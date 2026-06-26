"use client";

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import * as d3 from "d3";
import { TimelineItem, GraphNode, GraphLink } from "./types";
import { timelineData, categoryMeta } from "./data";

interface MindmapCanvasProps {
  currentSearch: string;
  activeCategories: Set<string>;
  activeMediaFilter: string;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  collapsedYears: Set<number>;
  setCollapsedYears: (years: Set<number>) => void;
}

export interface MindmapCanvasRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

interface Point {
  x: number;
  y: number;
}

function getWidth(node: GraphNode): number {
  if (node.type === "center") return 110;
  if (node.type === "year") return 40;
  if (node.type === "media") return 50;
  if (node.type === "text") return 220;
  if (node.type === "awards") return 180;
  return 40;
}

function getHeight(node: GraphNode): number {
  if (node.type === "center") return 110;
  if (node.type === "year") return 40;
  if (node.type === "media") return 50;
  if (node.type === "text") return 100;
  if (node.type === "awards") return 50;
  return 40;
}

function getNodeIntersection(node: GraphNode, fromPoint: Point): Point {
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  
  if (node.type === "center" || node.type === "year") {
    const r = node.type === "center" ? 55 : 20;
    const dx = fromPoint.x - x;
    const dy = fromPoint.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x, y };
    return {
      x: x + (dx / dist) * r,
      y: y + (dy / dist) * r,
    };
  } else {
    let halfW = 25;
    let halfH = 25;
    if (node.type === "text") {
      halfW = 110;
      halfH = 50;
    } else if (node.type === "awards") {
      halfW = 90;
      halfH = 25;
    }
    
    const dx = fromPoint.x - x;
    const dy = fromPoint.y - y;
    if (dx === 0 && dy === 0) return { x, y };
    
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    if (absDx * halfH > absDy * halfW) {
      const signX = dx > 0 ? 1 : -1;
      return {
        x: x + signX * halfW,
        y: y + (dy / absDx) * halfW,
      };
    } else {
      const signY = dy > 0 ? 1 : -1;
      return {
        x: x + (dx / absDy) * halfH,
        y: y + signY * halfH,
      };
    }
  }
}

function rectCollide() {
  let nodes: GraphNode[];
  const padding = 35;

  function force(alpha: number) {
    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      if (nodeA.x === undefined || nodeA.y === undefined) continue;

      const wA = getWidth(nodeA) / 2 + padding;
      const hA = getHeight(nodeA) / 2 + padding;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];
        if (nodeB.x === undefined || nodeB.y === undefined) continue;

        const wB = getWidth(nodeB) / 2 + padding;
        const hB = getHeight(nodeB) / 2 + padding;

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;

        const minX = wA + wB;
        const minY = hA + hB;

        const overlapX = minX - Math.abs(dx);
        const overlapY = minY - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const pushX = overlapX * (dx > 0 ? 0.5 : -0.5) * alpha;
            if (nodeB.fx === null || nodeB.fx === undefined) nodeB.x += pushX;
            if (nodeA.fx === null || nodeA.fx === undefined) nodeA.x -= pushX;
          } else {
            const pushY = overlapY * (dy > 0 ? 0.5 : -0.5) * alpha;
            if (nodeB.fy === null || nodeB.fy === undefined) nodeB.y += pushY;
            if (nodeA.fy === null || nodeA.fy === undefined) nodeA.y -= pushY;
          }
        }
      }
    }
  }

  force.initialize = (_nodes: GraphNode[]) => {
    nodes = _nodes;
  };

  return force;
}

export const MindmapCanvas = forwardRef<MindmapCanvasRef, MindmapCanvasProps>(
  (
    {
      currentSearch,
      activeCategories,
      activeMediaFilter,
      selectedNodeId,
      setSelectedNodeId,
      collapsedYears,
      setCollapsedYears,
    },
    ref
  ) => {
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
      const initial = new Set<string>(["root"]);
      const yearKeys = Object.keys(timelineData.eras).map(Number);
      yearKeys.forEach(yr => {
        if (!collapsedYears.has(yr)) {
          initial.add(`year-${yr}`);
        }
      });
      return initial;
    });

    useEffect(() => {
      setExpandedNodes(prev => {
        const next = new Set(prev);
        const yearKeys = Object.keys(timelineData.eras).map(Number);
        yearKeys.forEach(yr => {
          const yrId = `year-${yr}`;
          if (collapsedYears.has(yr)) {
            next.delete(yrId);
          } else {
            next.add(yrId);
          }
        });
        return next;
      });
    }, [collapsedYears]);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

    // Helpers to filter item pass status
    const itemPassesFilters = (item: TimelineItem) => {
      // Search text match
      if (currentSearch) {
        const searchTxt = (
          item.title +
          " " +
          item.description +
          " " +
          item.category +
          " " +
          item.awards.join(" ")
        ).toLowerCase();
        if (!searchTxt.includes(currentSearch.toLowerCase())) {
          return false;
        }
      }

      // Category filter match
      if (activeCategories.size > 0 && !activeCategories.has(item.category)) {
        return false;
      }

      // Media filter match
      if (activeMediaFilter !== "All" && item.mediaType !== activeMediaFilter) {
        return false;
      }

      return true;
    };

    const hasInitialCenteredRef = useRef(false);

    const centerAndScaleGraph = (transitionDuration = 500) => {
      if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current || !simulationRef.current) return;
      
      const nodes = simulationRef.current.nodes();
      if (nodes.length === 0) return;

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      nodes.forEach((node) => {
        if (node.x !== undefined && node.y !== undefined) {
          if (node.x < minX) minX = node.x;
          if (node.x > maxX) maxX = node.x;
          if (node.y < minY) minY = node.y;
          if (node.y > maxY) maxY = node.y;
        }
      });

      if (minX === Infinity || minY === Infinity) return;

      const graphCenterX = minX + (maxX - minX) / 2;
      const graphCenterY = minY + (maxY - minY) / 2;

      const w = containerRef.current.clientWidth || 800;
      const h = containerRef.current.clientHeight || 600;

      const graphWidth = (maxX - minX) || 1;
      const graphHeight = (maxY - minY) || 1;

      const padding = 80;
      const scaleX = (w - padding * 2) / graphWidth;
      const scaleY = (h - padding * 2) / graphHeight;
      const scale = Math.min(Math.min(scaleX, scaleY), 1.0);

      const transform = d3.zoomIdentity
        .translate(w / 2 - scale * graphCenterX, h / 2 - scale * graphCenterY)
        .scale(scale);

      if (transitionDuration > 0) {
        d3.select(svgRef.current)
          .transition()
          .duration(transitionDuration)
          .ease(d3.easeCubicOut)
          .call(zoomBehaviorRef.current.transform, transform);
      } else {
        d3.select(svgRef.current)
          .call(zoomBehaviorRef.current.transform, transform);
      }
    };

    // Zoom handlers exposed to parent
    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        if (svgRef.current && zoomBehaviorRef.current) {
          d3.select(svgRef.current)
            .transition()
            .duration(350)
            .call(zoomBehaviorRef.current.scaleBy, 1.3);
        }
      },
      zoomOut: () => {
        if (svgRef.current && zoomBehaviorRef.current) {
          d3.select(svgRef.current)
            .transition()
            .duration(350)
            .call(zoomBehaviorRef.current.scaleBy, 0.7);
        }
      },
      resetZoom: () => {
        centerAndScaleGraph(800);
      },
    }));

    useEffect(() => {
      if (!svgRef.current || !containerRef.current) return;

      const width = containerRef.current.clientWidth || 800;
      const height = containerRef.current.clientHeight || 600;

      const svgEl = d3.select(svgRef.current);
      const mainGroup = d3.select("#mainGroup");

      // Setup Zooming & Panning
      const zoomBehavior = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.15, 3])
        .on("zoom", (event) => {
          mainGroup.attr("transform", event.transform);
        });

      zoomBehaviorRef.current = zoomBehavior;
      svgEl.call(zoomBehavior);

      // Initial zoom transform
      svgEl.call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(width / 2 - 120, height / 2).scale(0.85)
      );

      // Setup force simulation
      const simulation = d3
        .forceSimulation<GraphNode, GraphLink>()
        .force(
          "link",
          d3
            .forceLink<GraphNode, GraphLink>()
            .id((d) => d.id)
            .distance(() => 180)
            .strength(1.2)
        )
        .force(
          "charge",
          d3.forceManyBody<GraphNode>().strength((d) => {
            if (d.type === "center") return -600;
            if (d.type === "year") return -300;
            if (d.type === "media") return -150;
            if (d.type === "text") return -400;
            if (d.type === "awards") return -250;
            return -40;
          })
        )
        .force(
          "collide",
          d3
            .forceCollide<GraphNode>()
            .radius((d) => {
              if (d.type === "center") return 75;
              if (d.type === "year") return 40;
              if (d.type === "media") return 35;
              if (d.type === "text") return 120;
              if (d.type === "awards") return 95;
              return 20;
            })
            .strength(0.8)
        )
        .force("rect-collide", rectCollide())
        .force("center", d3.forceCenter(width / 2, height / 2));

      let ticksCount = 0;
      simulation.on("tick", () => {
        ticked();
        ticksCount++;
        if (ticksCount === 30 && !hasInitialCenteredRef.current) {
          hasInitialCenteredRef.current = true;
          centerAndScaleGraph(0);
        }
      });

      simulationRef.current = simulation;

      function ticked() {
        mainGroup.selectAll<SVGPathElement, GraphLink>(".link").attr("d", (d: any) => {
          const sourceNode = d.source;
          const targetNode = d.target;
          if (!sourceNode || !targetNode || sourceNode.x === undefined || targetNode.x === undefined) {
            return "";
          }
          const sPt = getNodeIntersection(sourceNode, { x: targetNode.x, y: targetNode.y });
          const tPt = getNodeIntersection(targetNode, { x: sourceNode.x, y: sourceNode.y });
          
          const dx = tPt.x - sPt.x;
          const dy = tPt.y - sPt.y;
          
          const cx1 = sPt.x + dx * 0.5;
          const cy1 = sPt.y;
          const cx2 = tPt.x - dx * 0.5;
          const cy2 = tPt.y;
          
          return `M${sPt.x},${sPt.y} C${cx1},${cy1} ${cx2},${cy2} ${tPt.x},${tPt.y}`;
        });

        mainGroup.selectAll<SVGGElement, GraphNode>(".node").attr("transform", (d) => `translate(${d.x},${d.y})`);
      }

      return () => {
        simulation.stop();
      };
    }, []);

    // Resize observer / window resize listener to maintain center positions dynamically
    useEffect(() => {
      const handleResize = () => {
        centerAndScaleGraph(0);
      };
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, []);

    // Effect to update graph data and simulation nodes/links on state changes
    useEffect(() => {
      if (!simulationRef.current || !containerRef.current) return;

      const width = containerRef.current.clientWidth || 800;
      const height = containerRef.current.clientHeight || 600;

      const mainGroup = d3.select("#mainGroup");

      // BUILD GRAPH DATA
      const nodes: GraphNode[] = [];
      const links: GraphLink[] = [];

      // 1. Center node
      const centerNode: GraphNode = {
        id: "root",
        type: "center",
        label: timelineData.center.title,
        fx: width / 2,
        fy: height / 2,
        isExpanded: expandedNodes.has("root"),
      };
      nodes.push(centerNode);

      // 2. Year nodes
      if (expandedNodes.has("root")) {
        const yearKeys = Object.keys(timelineData.eras).map(Number).sort((a, b) => a - b);
        yearKeys.forEach((yr, idx) => {
          const angle = (idx / yearKeys.length) * Math.PI * 2;
          const r = 160;
          const yrId = `year-${yr}`;

          const yNode: GraphNode = {
            id: yrId,
            type: "year",
            label: String(yr),
            year: yr,
            x: width / 2 + Math.cos(angle) * r,
            y: height / 2 + Math.sin(angle) * r,
            isExpanded: expandedNodes.has(yrId),
          };
          nodes.push(yNode);

          links.push({
            source: "root",
            target: yrId,
            type: "center-era",
          });

          // 3. Media nodes under this year
          if (expandedNodes.has(yrId)) {
            timelineData.items.forEach((item) => {
              const isFilteredIn = itemPassesFilters(item);
              if (item.year === yr && isFilteredIn) {
                const mediaNodeId = `media-${item.id}`;
                const mNode: GraphNode = {
                  id: mediaNodeId,
                  type: "media",
                  label: item.title,
                  category: item.category,
                  year: item.year,
                  itemData: item,
                  isExpanded: expandedNodes.has(mediaNodeId),
                };
                nodes.push(mNode);

                links.push({
                  source: yrId,
                  target: mediaNodeId,
                  type: "era-media",
                });

                // Text/awards under media
                if (expandedNodes.has(mediaNodeId)) {
                  const textNodeId = `text-${item.id}`;
                  const tNode: GraphNode = {
                    id: textNodeId,
                    type: "text",
                    label: item.description,
                    category: item.category,
                    year: item.year,
                    itemData: item,
                    isExpanded: false,
                  };
                  nodes.push(tNode);

                  links.push({
                    source: mediaNodeId,
                    target: textNodeId,
                    type: "media-text",
                  });

                  if (item.awards.length > 0) {
                    const awardsNodeId = `awards-${item.id}`;
                    const aNode: GraphNode = {
                      id: awardsNodeId,
                      type: "awards",
                      label: item.awards.join(" • "),
                      category: item.category,
                      year: item.year,
                      itemData: item,
                      isExpanded: false,
                    };
                    nodes.push(aNode);

                    links.push({
                      source: mediaNodeId,
                      target: awardsNodeId,
                      type: "media-awards",
                    });
                  }
                }
              }
            });
          }
        });
      }

      // Drag behavior
      const drag = d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
          d3.select(event.sourceEvent.target.closest('.node')).classed("is-dragging", true);
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulationRef.current?.alphaTarget(0);
          d3.select(event.sourceEvent.target.closest('.node')).classed("is-dragging", false);
          if (d.type !== "center") {
            d.fx = d.x;
            d.fy = d.y;
          } else {
            d.fx = width / 2;
            d.fy = height / 2;
          }
        });

      // RENDER LINKS
      const linkSelection = mainGroup
        .selectAll<SVGPathElement, GraphLink>(".link")
        .data(links, (d: any) => `${d.source.id || d.source}-${d.target.id || d.target}`);

      linkSelection.exit().remove();

      const linkEnter = linkSelection.enter().append("path").attr("class", "link");

      const allLinks = linkEnter.merge(linkSelection);

      allLinks.each(function (d: any) {
        const element = d3.select(this);
        // Highlight active links when searching
        const targetId = d.target.id || d.target;
        if (currentSearch && d.type === "era-media") {
          const targetNode = nodes.find((n) => n.id === targetId);
          if (targetNode && targetNode.type === "media" && targetNode.itemData) {
            const searchTxt = (
              targetNode.label +
              " " +
              targetNode.itemData.description +
              " " +
              targetNode.category +
              " " +
              targetNode.itemData.awards.join(" ")
            ).toLowerCase();
            if (searchTxt.includes(currentSearch.toLowerCase())) {
              element.classed("active", true);
              element.classed("faded", false);
              return;
            }
          }
        }
        element.classed("active", false);
        element.classed("faded", false);
      });

      // RENDER NODES
      const nodeSelection = mainGroup
        .selectAll<SVGGElement, GraphNode>(".node")
        .data(nodes, (d) => d.id);

      nodeSelection.exit().remove();

      const nodeEnter = nodeSelection
        .enter()
        .append("g")
        .attr("class", (d) => `node node-${d.type}`)
        .call(drag as any)
        .on("click", (event, d) => {
          if (event.defaultPrevented) return;

          const nodeId = d.id;
          const isExpanded = expandedNodes.has(nodeId);
          const nextExpanded = new Set(expandedNodes);

          if (isExpanded) {
            nextExpanded.delete(nodeId);
            const removeDescendants = (id: string) => {
              if (id === "root") {
                const yearKeys = Object.keys(timelineData.eras).map(Number);
                yearKeys.forEach((yr) => {
                  const yrId = `year-${yr}`;
                  nextExpanded.delete(yrId);
                  removeDescendants(yrId);
                });
              } else if (id.startsWith("year-")) {
                const yr = Number(id.replace("year-", ""));
                timelineData.items.forEach((item) => {
                  if (item.year === yr) {
                    const mediaId = `media-${item.id}`;
                    nextExpanded.delete(mediaId);
                    removeDescendants(mediaId);
                  }
                });
              } else if (id.startsWith("media-")) {
                const itemId = id.replace("media-", "");
                nextExpanded.delete(`text-${itemId}`);
                nextExpanded.delete(`awards-${itemId}`);
              }
            };
            removeDescendants(nodeId);

            if (d.type === "year" && d.year) {
              const nextCollapsed = new Set(collapsedYears);
              nextCollapsed.add(d.year);
              setCollapsedYears(nextCollapsed);
            }
          } else {
            nextExpanded.add(nodeId);
            if (d.type === "year" && d.year) {
              const nextCollapsed = new Set(collapsedYears);
              nextCollapsed.delete(d.year);
              setCollapsedYears(nextCollapsed);
            }
          }

          setExpandedNodes(nextExpanded);
          setSelectedNodeId(nodeId);
          event.stopPropagation();
        });

      // Center node template
      nodeEnter
        .filter((d) => d.type === "center")
        .each(function () {
          const group = d3.select(this);
          group.append("circle").attr("r", 55);
          group.append("text").attr("dy", -6).text("RUBENIUS");
          group
            .append("text")
            .attr("dy", 12)
            .text("INTERIORS")
            .style("font-size", "10px")
            .style("fill", "var(--text-muted)");

          // Pulse halo
          group
            .append("circle")
            .attr("r", 65)
            .style("fill", "none")
            .style("stroke", "var(--primary)")
            .style("stroke-opacity", 0.2)
            .style("stroke-width", "1px")
            .style("pointer-events", "none")
            .append("animate")
            .attr("attributeName", "r")
            .attr("values", "60;80;60")
            .attr("dur", "4s")
            .attr("repeatCount", "indefinite");

          // Badge
          group
            .append("g")
            .attr("class", "toggle-badge")
            .attr("transform", "translate(0, 68)")
            .each(function () {
              const badge = d3.select(this);
              badge.append("circle").attr("r", 7).style("fill", "var(--bg-card)").style("stroke", "var(--primary)").style("stroke-width", "1px");
              badge.append("text").attr("dy", 3).attr("text-anchor", "middle").style("font-size", "9px").style("fill", "var(--primary-light)").text("+");
            });
        });

      // Year node template
      nodeEnter
        .filter((d) => d.type === "year")
        .each(function (d) {
          const group = d3.select(this);
          group.append("circle").attr("r", 20);
          group.append("text").attr("dy", 4).text(d.label);

          group
            .append("circle")
            .attr("class", "expand-indicator")
            .attr("cx", 0)
            .attr("cy", 20)
            .attr("r", 4)
            .style("fill", collapsedYears.has(d.year!) ? "var(--primary)" : "#2a9d8f")
            .style("stroke", "var(--bg-base)")
            .style("stroke-width", "1px");

          // Badge
          group
            .append("g")
            .attr("class", "toggle-badge")
            .attr("transform", "translate(0, 22)")
            .each(function () {
              const badge = d3.select(this);
              badge.append("circle").attr("r", 6).style("fill", "var(--bg-card)").style("stroke", "var(--primary)").style("stroke-width", "1px");
              badge.append("text").attr("dy", 2.5).attr("text-anchor", "middle").style("font-size", "8px").style("fill", "var(--primary-light)").text("+");
            });
        });

      // Media node template (Image/Video square thumbnail preview)
      nodeEnter
        .filter((d) => d.type === "media")
        .each(function (d) {
          const group = d3.select(this);
          const meta = categoryMeta[d.category!] || { color: "#d4af37" };
          
          // Outer square container
          group
            .append("rect")
            .attr("x", -25)
            .attr("y", -25)
            .attr("width", 50)
            .attr("height", 50)
            .attr("rx", 6)
            .style("fill", "rgba(18, 18, 24, 0.95)")
            .style("stroke", meta.color)
            .style("stroke-width", "2px");

          // Image element
          if (d.itemData?.image) {
            group
              .append("image")
              .attr("href", d.itemData.image)
              .attr("x", -22)
              .attr("y", -22)
              .attr("width", 44)
              .attr("height", 44)
              .attr("preserveAspectRatio", "xMidYMid slice")
              .style("clip-path", "inset(0% round 4px)");
          }

          // Small play icon overlay if video
          if (d.itemData?.mediaType === "Video") {
            group
              .append("polygon")
              .attr("points", "-4,-6 6,0 -4,6")
              .attr("transform", "translate(0, 0)")
              .style("fill", "#ffffff")
              .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.5))");
          }

          // Label underneath
          group
            .append("text")
            .attr("dx", 0)
            .attr("dy", 38)
            .attr("text-anchor", "middle")
            .style("font-size", "9px")
            .style("fill", "var(--text-muted)")
            .text(d.label.length > 12 ? d.label.substring(0, 10) + ".." : d.label);

          // Badge
          group
            .append("g")
            .attr("class", "toggle-badge")
            .attr("transform", "translate(22, -22)")
            .each(function () {
              const badge = d3.select(this);
              badge.append("circle").attr("r", 6).style("fill", "var(--bg-card)").style("stroke", "var(--primary)").style("stroke-width", "1px");
              badge.append("text").attr("dy", 2.5).attr("text-anchor", "middle").style("font-size", "8px").style("fill", "var(--primary-light)").text("+");
            });
        });

      // Text node template (ForeignObject rectangle containing wrapped HTML text)
      nodeEnter
        .filter((d) => d.type === "text")
        .each(function (d) {
          const group = d3.select(this);
          const item = d.itemData!;
          
          const foreign = group
            .append("foreignObject")
            .attr("x", -110)
            .attr("y", -50)
            .attr("width", 220)
            .attr("height", 100);

          foreign
            .append("xhtml:div")
            .attr("class", "canvas-text-card")
            .html(`
              <div class="card-year-tag">${item.year}</div>
              <div class="card-title">${item.title}</div>
              <div class="card-desc">${item.description}</div>
              <div class="card-meta">${item.stats}</div>
            `);
        });

      // Awards node template (ForeignObject rectangle for Awards)
      nodeEnter
        .filter((d) => d.type === "awards")
        .each(function (d) {
          const group = d3.select(this);
          const item = d.itemData!;
          
          const foreign = group
            .append("foreignObject")
            .attr("x", -90)
            .attr("y", -25)
            .attr("width", 180)
            .attr("height", 50);

          foreign
            .append("xhtml:div")
            .attr("class", "canvas-award-card")
            .html(`
              <span class="award-trophy">🏆</span>
              <span class="award-text">${item.awards.join(" • ")}</span>
            `);
        });

      const allNodes = nodeEnter.merge(nodeSelection as any);

      // Class settings & filtering dim effects
      allNodes.each(function (d: any) {
        const el = d3.select(this);
        el.classed("selected", d.id === selectedNodeId);

        const isExpanded = expandedNodes.has(d.id);
        const hasHidden = !isExpanded && (d.type === "center" || d.type === "year" || d.type === "media");
        el.classed("has-hidden-children", hasHidden);

        // Update badge text, visibility, and styles
        const badge = el.select(".toggle-badge");
        if (d.type === "center" || d.type === "year" || d.type === "media") {
          badge.style("display", "block");
          badge.select("text").text(isExpanded ? "−" : "+");
          badge.select("circle").style("stroke", isExpanded ? "#2a9d8f" : "var(--primary)");
          badge.select("text").style("fill", isExpanded ? "#2a9d8f" : "var(--primary-light)");
        } else {
          badge.style("display", "none");
        }

        if (currentSearch && d.type === "media") {
          const searchTxt = (
            d.label +
            " " +
            d.itemData.description +
            " " +
            d.category +
            " " +
            d.itemData.awards.join(" ")
          ).toLowerCase();
          if (!searchTxt.includes(currentSearch.toLowerCase())) {
            el.classed("faded", true);
          } else {
            el.classed("faded", false);
          }
        } else {
          el.classed("faded", false);
        }
      });

      // Update expand indicators for years
      allNodes
        .filter((d) => d.type === "year")
        .select(".expand-indicator")
        .style("fill", (d) => (collapsedYears.has(d.year!) ? "var(--primary)" : "#2a9d8f"));

      // Update force simulation data
      simulationRef.current.nodes(nodes);
      (simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>)?.links(links);
      simulationRef.current.alpha(0.8).restart();
    }, [currentSearch, activeCategories, activeMediaFilter, collapsedYears, selectedNodeId, expandedNodes]);

    return (
      <div className="mindmap-container" id="mindmapView" ref={containerRef}>
        <svg className="mindmap-svg" id="mindmapSvg" ref={svgRef}>
          <defs>
            <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-gold-strong" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComponentTransfer in="blur" result="boost">
                <feFuncA type="linear" slope="2" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="boost" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g id="mainGroup" />
        </svg>
      </div>
    );
  }
);

MindmapCanvas.displayName = "MindmapCanvas";
