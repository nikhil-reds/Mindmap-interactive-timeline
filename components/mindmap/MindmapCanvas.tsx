"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import * as d3 from "d3";
import { TimelineItem, GraphNode, GraphLink } from "./types";
import { timelineData, categoryMeta } from "./data";

interface MindmapCanvasProps {
  currentSearch: string;
  activeCategories: Set<string>;
  activeMediaFilter: string;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  onSelectItem: (item: TimelineItem | null) => void;
  collapsedYears: Set<number>;
  setCollapsedYears: (years: Set<number>) => void;
}

export interface MindmapCanvasRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const MindmapCanvas = forwardRef<MindmapCanvasRef, MindmapCanvasProps>(
  (
    {
      currentSearch,
      activeCategories,
      activeMediaFilter,
      selectedNodeId,
      setSelectedNodeId,
      onSelectItem,
      collapsedYears,
      setCollapsedYears,
    },
    ref
  ) => {
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
        if (svgRef.current && zoomBehaviorRef.current && containerRef.current) {
          const w = containerRef.current.clientWidth || 800;
          const h = containerRef.current.clientHeight || 600;
          d3.select(svgRef.current)
            .transition()
            .duration(500)
            .call(
              zoomBehaviorRef.current.transform,
              d3.zoomIdentity.translate(w / 2 - 120, h / 2).scale(0.85)
            );
        }
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
            .distance((d: any) => {
              if (d.source.type === "center") return 160;
              return 85;
            })
            .strength(1.2)
        )
        .force(
          "charge",
          d3.forceManyBody<GraphNode>().strength((d) => {
            if (d.type === "center") return -400;
            if (d.type === "year") return -150;
            return -40;
          })
        )
        .force(
          "collide",
          d3
            .forceCollide<GraphNode>()
            .radius((d) => {
              if (d.type === "center") return 70;
              if (d.type === "year") return 35;
              return 20;
            })
            .strength(0.8)
        )
        .force("center", d3.forceCenter(width / 2, height / 2))
        .on("tick", ticked);

      simulationRef.current = simulation;

      function ticked() {
        mainGroup.selectAll<SVGPathElement, GraphLink>(".link").attr("d", (d: any) => {
          if (d.type === "root-year") {
            return `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`;
          } else {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
            return `M${d.source.x},${d.source.y} A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
          }
        });

        mainGroup.selectAll<SVGGElement, GraphNode>(".node").attr("transform", (d) => `translate(${d.x},${d.y})`);
      }

      return () => {
        simulation.stop();
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
      };
      nodes.push(centerNode);

      // 2. Year nodes
      const yearKeys = Object.keys(timelineData.eras).map(Number).sort((a, b) => a - b);
      yearKeys.forEach((yr, idx) => {
        const angle = (idx / yearKeys.length) * Math.PI * 2;
        const r = 160;

        const yNode: GraphNode = {
          id: `year-${yr}`,
          type: "year",
          label: String(yr),
          year: yr,
          x: width / 2 + Math.cos(angle) * r,
          y: height / 2 + Math.sin(angle) * r,
        };
        nodes.push(yNode);

        links.push({
          source: "root",
          target: `year-${yr}`,
          type: "center-era",
        });
      });

      // 3. Item nodes
      timelineData.items.forEach((item) => {
        const isFilteredIn = itemPassesFilters(item);
        const isYearExpanded = !collapsedYears.has(item.year);

        if (isFilteredIn && isYearExpanded) {
          const iNode: GraphNode = {
            id: `item-${item.id}`,
            type: "item",
            label: item.title,
            category: item.category,
            year: item.year,
            itemData: item,
          };
          nodes.push(iNode);

          links.push({
            source: `year-${item.year}`,
            target: `item-${item.id}`,
            type: "era-item",
          });
        }
      });

      // Drag behavior
      const drag = d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulationRef.current?.alphaTarget(0);
          if (d.type !== "center") {
            d.fx = null;
            d.fy = null;
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
        if (currentSearch && d.type === "era-item") {
          const targetNode = nodes.find((n) => n.id === targetId);
          if (targetNode && targetNode.type === "item") {
            element.classed("active", true);
            element.classed("faded", false);
            return;
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

          if (d.type === "year" && d.year) {
            const nextCollapsed = new Set(collapsedYears);
            if (nextCollapsed.has(d.year)) {
              nextCollapsed.delete(d.year);
            } else {
              nextCollapsed.add(d.year);
            }
            setCollapsedYears(nextCollapsed);
          }

          if (d.type === "item" && d.itemData) {
            setSelectedNodeId(d.id);
            onSelectItem(d.itemData);
          } else if (d.type === "year") {
            setSelectedNodeId(d.id);
            onSelectItem({
              id: d.id,
              year: d.year!,
              title: `Milestones in ${d.year}`,
              category: "Era",
              stats: `Theme: ${timelineData.eras[d.year!]?.theme || "N/A"}`,
              description: timelineData.eras[d.year!]?.highlights || "No highlights",
              image: "",
              mediaType: "Image",
              awards: [],
            });
          } else {
            setSelectedNodeId(null);
            onSelectItem(null);
          }
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
        });

      // Item node template
      nodeEnter
        .filter((d) => d.type === "item")
        .each(function (d) {
          const group = d3.select(this);
          const meta = categoryMeta[d.category!] || { color: "#d4af37" };

          group
            .append("circle")
            .attr("r", 8)
            .style("fill", meta.color)
            .style("stroke", "rgba(0,0,0,0.6)")
            .style("stroke-width", "1.5px")
            .style("--node-color", meta.color);

          group
            .append("text")
            .attr("dx", 12)
            .attr("dy", 4)
            .text(d.label.length > 20 ? d.label.substring(0, 18) + ".." : d.label);
        });

      const allNodes = nodeEnter.merge(nodeSelection as any);

      // Class settings & filtering dim effects
      allNodes.each(function (d: any) {
        const el = d3.select(this);
        el.classed("selected", d.id === selectedNodeId);

        if (currentSearch && d.type === "item") {
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
      simulationRef.current.alpha(0.6).restart();
    }, [currentSearch, activeCategories, activeMediaFilter, collapsedYears, selectedNodeId]);

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
