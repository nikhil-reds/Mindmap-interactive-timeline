"use client";

import React, {
  Dispatch,
  SetStateAction,
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import * as d3 from "d3";
import { GraphNode, GraphLink } from "./types";
import { timelineData, categoryMeta } from "./data";

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2;
export const DEFAULT_ZOOM = 0.85;
const MESH_PADDING = 44;

interface MindmapCanvasProps {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  collapsedYears: Set<number>;
  setCollapsedYears: Dispatch<SetStateAction<Set<number>>>;
  onZoomChange: (scale: number) => void;
}

export interface MindmapCanvasRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface NodeRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const NODE_SIZE = {
  center: { width: 110, height: 110 },
  year: { width: 40, height: 40 },
  image: { width: 112, height: 92 },
  video: { width: 240, height: 156 },
  text: { width: 320, height: 210 },
  awards: { width: 200, height: 60 },
} as const;

const NODE_LIMITS = {
  image: { minWidth: 84, minHeight: 72, maxWidth: 420, maxHeight: 344 },
  video: { minWidth: 180, minHeight: 118, maxWidth: 640, maxHeight: 416 },
  text: { minWidth: 220, minHeight: 140, maxWidth: 640, maxHeight: 520 },
} as const;

function getDefaultSize(node: GraphNode) {
  if (node.type === "center") return NODE_SIZE.center;
  if (node.type === "year") return NODE_SIZE.year;
  if (node.type === "text") return NODE_SIZE.text;
  if (node.type === "awards") return NODE_SIZE.awards;
  if (node.type === "media" && node.itemData?.mediaType === "Video") {
    return NODE_SIZE.video;
  }
  return NODE_SIZE.image;
}

function initializeNodeSize(node: GraphNode) {
  const fallback = getDefaultSize(node);
  node.width ??= fallback.width;
  node.height ??= fallback.height;
}

function getNodeRect(node: GraphNode, x = node.x ?? 0, y = node.y ?? 0, padding = 0): NodeRect {
  const halfWidth = getWidth(node) / 2 + padding;
  const halfHeight = getHeight(node) / 2 + padding;
  return {
    left: x - halfWidth,
    right: x + halfWidth,
    top: y - halfHeight,
    bottom: y + halfHeight,
  };
}

function rectsOverlap(a: NodeRect, b: NodeRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function pointInsideRect(point: Point, rect: NodeRect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function segmentCrossesRect(from: Point, to: Point, rect: NodeRect) {
  // Sampling is sufficient here because graph links are short and the obstacle rectangles are large.
  for (let step = 1; step < 20; step += 1) {
    const t = step / 20;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    if (pointInsideRect(point, rect)) return true;
  }
  return false;
}

function clampPointToMesh(node: GraphNode, point: Point, width: number, height: number): Point {
  const halfWidth = getWidth(node) / 2;
  const halfHeight = getHeight(node) / 2;
  const minX = MESH_PADDING + halfWidth;
  const maxX = width - MESH_PADDING - halfWidth;
  const minY = MESH_PADDING + halfHeight;
  const maxY = height - MESH_PADDING - halfHeight;

  return {
    x: minX > maxX ? width / 2 : Math.max(minX, Math.min(maxX, point.x)),
    y: minY > maxY ? height / 2 : Math.max(minY, Math.min(maxY, point.y)),
  };
}

function constrainNodeToMesh(node: GraphNode, width: number, height: number) {
  if (node.x === undefined || node.y === undefined) return;
  const constrained = clampPointToMesh(node, { x: node.x, y: node.y }, width, height);
  node.x = constrained.x;
  node.y = constrained.y;
  if (node.fx !== null && node.fx !== undefined) node.fx = constrained.x;
  if (node.fy !== null && node.fy !== undefined) node.fy = constrained.y;
}

function getCurvedLinkPath(link: GraphLink) {
  if (typeof link.source === "string" || typeof link.target === "string") return "";
  const source = link.source;
  const target = link.target;
  if (
    source.x === undefined ||
    source.y === undefined ||
    target.x === undefined ||
    target.y === undefined
  ) return "";

  const sourcePoint = getNodeIntersection(source, { x: target.x, y: target.y });
  const targetPoint = getNodeIntersection(target, { x: source.x, y: source.y });
  const deltaX = targetPoint.x - sourcePoint.x;
  const deltaY = targetPoint.y - sourcePoint.y;
  const curveAmount = Math.min(64, Math.hypot(deltaX, deltaY) * 0.18);
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const normalX = -deltaY / distance;
  const normalY = deltaX / distance;
  const controlX1 = sourcePoint.x + deltaX * 0.34 + normalX * curveAmount;
  const controlY1 = sourcePoint.y + deltaY * 0.34 + normalY * curveAmount;
  const controlX2 = sourcePoint.x + deltaX * 0.66 + normalX * curveAmount;
  const controlY2 = sourcePoint.y + deltaY * 0.66 + normalY * curveAmount;
  return `M${sourcePoint.x},${sourcePoint.y} C${controlX1},${controlY1} ${controlX2},${controlY2} ${targetPoint.x},${targetPoint.y}`;
}


function getWidth(node: GraphNode): number {
  return node.width ?? getDefaultSize(node).width;
}

function getHeight(node: GraphNode): number {
  return node.height ?? getDefaultSize(node).height;
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
    const halfW = getWidth(node) / 2;
    const halfH = getHeight(node) / 2;
    
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
  const padding = 40; // Strict 40px clearance zone buffer around node boundaries

  function force(alpha: number) {
    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      if (nodeA.x === undefined || nodeA.y === undefined) continue;

      const wA = getWidth(nodeA) / 2;
      const hA = getHeight(nodeA) / 2;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];
        if (nodeB.x === undefined || nodeB.y === undefined) continue;

        const wB = getWidth(nodeB) / 2;
        const hB = getHeight(nodeB) / 2;

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;

        const minX = wA + wB + padding;
        const minY = hA + hB + padding;

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
      selectedNodeId,
      setSelectedNodeId,
      collapsedYears,
      setCollapsedYears,
      onZoomChange,
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

    const expandedNodesRef = useRef(expandedNodes);
    expandedNodesRef.current = expandedNodes;
    const collapsedYearsRef = useRef(collapsedYears);
    collapsedYearsRef.current = collapsedYears;

    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
    const tickedRef = useRef<(() => void) | null>(null);
    const onZoomChangeRef = useRef(onZoomChange);
    const branchFocusNodeRef = useRef<string | null>(null);
    const branchVisibilityTimerRef = useRef<number | null>(null);
    onZoomChangeRef.current = onZoomChange;



    const hasInitialCenteredRef = useRef(false);

    const ensureBranchVisibleRef = useRef<(focusNodeId: string) => void>(() => undefined);
    ensureBranchVisibleRef.current = (focusNodeId: string) => {
      if (
        !svgRef.current ||
        !containerRef.current ||
        !zoomBehaviorRef.current ||
        !simulationRef.current
      ) return;

      const allNodes = simulationRef.current.nodes();
      const liveLinks = (
        simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>
      ).links();
      const branchNodeIds = new Set<string>([focusNodeId]);

      liveLinks.forEach((link) => {
        const sourceId = typeof link.source === "string" ? link.source : link.source.id;
        const targetId = typeof link.target === "string" ? link.target : link.target.id;
        if (sourceId === focusNodeId) branchNodeIds.add(targetId);
      });

      const branchNodes = allNodes.filter(
        (node) => branchNodeIds.has(node.id) && node.x !== undefined && node.y !== undefined
      );
      if (branchNodes.length < 2) return;

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      branchNodes.forEach((node) => {
        const rect = getNodeRect(node);
        minX = Math.min(minX, rect.left);
        maxX = Math.max(maxX, rect.right);
        minY = Math.min(minY, rect.top);
        maxY = Math.max(maxY, rect.bottom);
      });

      const viewportWidth = containerRef.current.clientWidth || 800;
      const viewportHeight = containerRef.current.clientHeight || 600;
      const padding = 72;
      const currentTransform = d3.zoomTransform(svgRef.current);
      const currentlyVisible =
        minX * currentTransform.k + currentTransform.x >= padding &&
        maxX * currentTransform.k + currentTransform.x <= viewportWidth - padding &&
        minY * currentTransform.k + currentTransform.y >= padding &&
        maxY * currentTransform.k + currentTransform.y <= viewportHeight - padding;
      if (currentlyVisible) return;

      const branchWidth = Math.max(1, maxX - minX);
      const branchHeight = Math.max(1, maxY - minY);
      const fitScale = Math.min(
        (viewportWidth - padding * 2) / branchWidth,
        (viewportHeight - padding * 2) / branchHeight
      );
      const nextScale = Math.max(MIN_ZOOM, Math.min(currentTransform.k, fitScale));
      const branchCenterX = minX + branchWidth / 2;
      const branchCenterY = minY + branchHeight / 2;
      const nextTransform = d3.zoomIdentity
        .translate(
          viewportWidth / 2 - nextScale * branchCenterX,
          viewportHeight / 2 - nextScale * branchCenterY
        )
        .scale(nextScale);

      d3.select(svgRef.current)
        .transition()
        .duration(550)
        .ease(d3.easeCubicOut)
        .call(zoomBehaviorRef.current.transform, nextTransform);
    };

    const centerAndScaleGraph = (transitionDuration = 500) => {
      if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current || !simulationRef.current) return;
      
      const nodes = simulationRef.current.nodes();
      if (nodes.length === 0) return;

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      nodes.forEach((node) => {
        if (node.x !== undefined && node.y !== undefined) {
          const halfWidth = getWidth(node) / 2;
          const halfHeight = getHeight(node) / 2;
          if (node.x - halfWidth < minX) minX = node.x - halfWidth;
          if (node.x + halfWidth > maxX) maxX = node.x + halfWidth;
          if (node.y - halfHeight < minY) minY = node.y - halfHeight;
          if (node.y + halfHeight > maxY) maxY = node.y + halfHeight;
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
      const scale = Math.max(MIN_ZOOM, Math.min(Math.min(scaleX, scaleY), 1.0));

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
          const currentScale = d3.zoomTransform(svgRef.current).k;
          const nextScale = Math.min(MAX_ZOOM, currentScale * 1.25);
          d3.select(svgRef.current)
            .transition()
            .duration(350)
            .call(zoomBehaviorRef.current.scaleTo, nextScale);
        }
      },
      zoomOut: () => {
        if (svgRef.current && zoomBehaviorRef.current) {
          const currentScale = d3.zoomTransform(svgRef.current).k;
          const nextScale = Math.max(MIN_ZOOM, currentScale / 1.25);
          d3.select(svgRef.current)
            .transition()
            .duration(350)
            .call(zoomBehaviorRef.current.scaleTo, nextScale);
        }
      },
      resetView: () => {
        branchFocusNodeRef.current = null;
        if (branchVisibilityTimerRef.current !== null) {
          window.clearTimeout(branchVisibilityTimerRef.current);
          branchVisibilityTimerRef.current = null;
        }
        const allYears = Object.keys(timelineData.eras).map(Number);
        const viewportWidth = containerRef.current?.clientWidth || 800;
        const viewportHeight = containerRef.current?.clientHeight || 600;

        // Reset every manual drag/resize pin before collapsing the hierarchy.
        simulationRef.current?.nodes().forEach((node) => {
          node.fx = null;
          node.fy = null;
          if (node.id === "root") {
            node.x = viewportWidth / 2;
            node.y = viewportHeight / 2;
            node.originalX = viewportWidth / 2;
            node.originalY = viewportHeight / 2;
            node.vx = 0;
            node.vy = 0;
          }
        });

        setExpandedNodes(new Set());
        setCollapsedYears(new Set(allYears));
        setSelectedNodeId(null);

        // Wait for the collapsed root-only graph to be committed before centering it.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (
              !svgRef.current ||
              !zoomBehaviorRef.current ||
              !containerRef.current ||
              !simulationRef.current
            ) return;

            const root = simulationRef.current.nodes().find((node) => node.id === "root");
            const rootX = root?.x ?? containerRef.current.clientWidth / 2;
            const rootY = root?.y ?? containerRef.current.clientHeight / 2;
            const viewportWidth = containerRef.current.clientWidth || 800;
            const viewportHeight = containerRef.current.clientHeight || 600;
            const transform = d3.zoomIdentity
              .translate(
                viewportWidth / 2 - DEFAULT_ZOOM * rootX,
                viewportHeight / 2 - DEFAULT_ZOOM * rootY
              )
              .scale(DEFAULT_ZOOM);

            d3.select(svgRef.current)
              .transition()
              .duration(600)
              .ease(d3.easeCubicOut)
              .call(zoomBehaviorRef.current.transform, transform);
          });
        });
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
        .scaleExtent([MIN_ZOOM, MAX_ZOOM])
        .on("zoom", (event) => {
          mainGroup.attr("transform", event.transform);
          const k = event.transform.k;
          onZoomChangeRef.current(k);
          d3.selectAll(".node-center .node-content").attr("transform", `scale(${1 / k})`);
          d3.selectAll(".node-year .node-content").attr("transform", `scale(${1 / k})`);
        });

      zoomBehaviorRef.current = zoomBehavior;
      svgEl.call(zoomBehavior);

      // Initial zoom transform
      svgEl.call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(width / 2 - 120, height / 2).scale(DEFAULT_ZOOM)
      );

      // Setup force simulation
      const simulation = d3
        .forceSimulation<GraphNode, GraphLink>()
        .force(
          "link",
          d3
            .forceLink<GraphNode, GraphLink>()
            .id((d) => d.id)
            .distance((d) => {
              if (typeof d.source === "string" || typeof d.target === "string") return 180;
              const horizontalClearance = getWidth(d.source) / 2 + getWidth(d.target) / 2 + 110;
              const verticalClearance = getHeight(d.source) / 2 + getHeight(d.target) / 2 + 110;
              return Math.max(180, Math.min(420, Math.max(horizontalClearance, verticalClearance)));
            })
            .strength((d) => {
              const sourceId = typeof d.source === "string" ? d.source : d.source.id;
              const targetId = typeof d.target === "string" ? d.target : d.target.id;
              if (d.type === "center-era" || sourceId === "root" || targetId === "root") {
                return 0.3;
              }
              return 1.2;
            })
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
              return Math.hypot(getWidth(d), getHeight(d)) / 2 + 18;
            })
            .strength(1)
            .iterations(4)
        )
        .force("rect-collide", rectCollide())
        .force(
          "sector-x",
          d3.forceX<GraphNode>((d) => d.originalX ?? width / 2).strength((d) =>
            d.type === "center" ? 0.04 : 0.075
          )
        )
        .force(
          "sector-y",
          d3.forceY<GraphNode>((d) => d.originalY ?? height / 2).strength((d) =>
            d.type === "center" ? 0.04 : 0.075
          )
        )
        .force("center", d3.forceCenter(width / 2, height / 2));

      let ticksCount = 0;
      simulation.on("tick", () => {
        const meshWidth = containerRef.current?.clientWidth || width;
        const meshHeight = containerRef.current?.clientHeight || height;
        simulation.nodes().forEach((node) => constrainNodeToMesh(node, meshWidth, meshHeight));
        ticked();
        ticksCount++;
        if (ticksCount === 30 && !hasInitialCenteredRef.current) {
          hasInitialCenteredRef.current = true;
          centerAndScaleGraph(0);
        }
      });

      simulationRef.current = simulation;

      function ticked() {
        mainGroup
          .selectAll<SVGPathElement, GraphLink>(".link")
          .attr("d", (link) => getCurvedLinkPath(link));

        mainGroup.selectAll<SVGGElement, GraphNode>(".node").attr("transform", (d) => `translate(${d.x},${d.y})`);

        if (svgRef.current) {
          const transform = d3.zoomTransform(svgRef.current);
          const k = transform.k;
          mainGroup.selectAll(".node-center .node-content").attr("transform", `scale(${1 / k})`);
          mainGroup.selectAll(".node-year .node-content").attr("transform", `scale(${1 / k})`);
        }
      }

      tickedRef.current = ticked;

      return () => {
        simulation.stop();
        tickedRef.current = null;
        if (branchVisibilityTimerRef.current !== null) {
          window.clearTimeout(branchVisibilityTimerRef.current);
          branchVisibilityTimerRef.current = null;
        }
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

      // Helper to restore previous node positions if they exist, or spawn them from parent node
      const prevNodesMap = new Map<string, GraphNode>();
      if (simulationRef.current) {
        simulationRef.current.nodes().forEach((n) => {
          prevNodesMap.set(n.id, n);
        });
      }

      const findVacantPosition = (node: GraphNode, parent: GraphNode): Point => {
        const parentX = parent.x ?? width / 2;
        const parentY = parent.y ?? height / 2;
        const root = nodes.find((existing) => existing.id === "root");
        const seededDirection =
          node.x !== undefined && node.y !== undefined
            ? Math.atan2(node.y - parentY, node.x - parentX)
            : undefined;
        const outwardDirection =
          parent.id !== "root" && root?.x !== undefined && root.y !== undefined
            ? Math.atan2(parentY - root.y, parentX - root.x)
            : 0;
        const baseAngle = seededDirection ?? outwardDirection;
        const angularOffsets = [0, 0.42, -0.42, 0.84, -0.84, 1.26, -1.26, 1.68, -1.68, Math.PI];
        const baseDistance =
          Math.hypot(getWidth(parent), getHeight(parent)) / 2 +
          Math.hypot(getWidth(node), getHeight(node)) / 2 +
          72;
        let bestPosition = { x: parentX + Math.cos(baseAngle) * baseDistance, y: parentY + Math.sin(baseAngle) * baseDistance };
        let bestScore = Number.POSITIVE_INFINITY;

        for (let ring = 0; ring < 6; ring += 1) {
          const distance = baseDistance + ring * 96;
          for (const offset of angularOffsets) {
            const angle = baseAngle + offset;
            const candidate = clampPointToMesh(
              node,
              {
                x: parentX + Math.cos(angle) * distance,
                y: parentY + Math.sin(angle) * distance,
              },
              width,
              height
            );
            const candidateRect = getNodeRect(node, candidate.x, candidate.y, 34);
            let hazards = 0;

            for (const existing of nodes) {
              if (rectsOverlap(candidateRect, getNodeRect(existing, undefined, undefined, 22))) {
                hazards += 100_000;
              }

              if (
                existing.id !== parent.id &&
                existing.x !== undefined &&
                existing.y !== undefined &&
                segmentCrossesRect(
                  { x: parentX, y: parentY },
                  candidate,
                  getNodeRect(existing, undefined, undefined, 18)
                )
              ) {
                hazards += 40_000;
              }
            }

            for (const link of links) {
              const sourceId = typeof link.source === "string" ? link.source : link.source.id;
              const targetId = typeof link.target === "string" ? link.target : link.target.id;
              const source = nodes.find((existing) => existing.id === sourceId);
              const target = nodes.find((existing) => existing.id === targetId);
              if (
                source?.x !== undefined &&
                source.y !== undefined &&
                target?.x !== undefined &&
                target.y !== undefined &&
                segmentCrossesRect(
                  { x: source.x, y: source.y },
                  { x: target.x, y: target.y },
                  candidateRect
                )
              ) {
                hazards += 25_000;
              }
            }

            const outsideViewport =
              candidateRect.left < 48 ||
              candidateRect.top < 48 ||
              candidateRect.right > width - 48 ||
              candidateRect.bottom > height - 48;
            const score = hazards + ring * 120 + Math.abs(offset) * 40 + (outsideViewport ? 4_000 : 0);

            if (score < bestScore) {
              bestScore = score;
              bestPosition = candidate;
            }
            if (hazards === 0 && !outsideViewport) return candidate;
          }
        }

        return bestPosition;
      };

      const restoreNodePhysics = (node: GraphNode, parent?: GraphNode) => {
        const prev = prevNodesMap.get(node.id);
        if (prev) {
          node.x = prev.x;
          node.y = prev.y;
          node.vx = prev.vx;
          node.vy = prev.vy;
          node.fx = prev.fx;
          node.fy = prev.fy;
          node.width = prev.width;
          node.height = prev.height;
          node.originalX = prev.originalX;
          node.originalY = prev.originalY;
        } else if (parent && parent.x !== undefined && parent.y !== undefined) {
          initializeNodeSize(node);
          const vacantPosition = findVacantPosition(node, parent);
          node.x = vacantPosition.x;
          node.y = vacantPosition.y;
          node.originalX = vacantPosition.x;
          node.originalY = vacantPosition.y;
        }
        initializeNodeSize(node);
        node.originalX ??= node.x;
        node.originalY ??= node.y;
      };

      const updateNodeGeometry = (
        element: SVGGElement,
        node: GraphNode
      ) => {
        const selection = d3.select<SVGGElement, GraphNode>(element);
        const nodeWidth = getWidth(node);
        const nodeHeight = getHeight(node);

        selection
          .select<SVGForeignObjectElement>(".node-foreign")
          .attr("x", -nodeWidth / 2)
          .attr("y", -nodeHeight / 2)
          .attr("width", nodeWidth)
          .attr("height", nodeHeight);

        selection
          .select<SVGGElement>(".resize-handle")
          .attr("transform", `translate(${nodeWidth / 2},${nodeHeight / 2})`);

        selection
          .select<SVGTextElement>(".node-size-label")
          .attr("x", nodeWidth / 2 - 10)
          .attr("y", nodeHeight / 2 + 24)
          .text(`${Math.round(nodeWidth)} × ${Math.round(nodeHeight)}`);

        selection
          .select<HTMLElement>(".media-node-shell")
          .classed("is-compact", nodeWidth < 220 || nodeHeight < 142);
      };

      // 1. Center node
      const centerNode: GraphNode = {
        id: "root",
        type: "center",
        label: timelineData.center.title,
        isExpanded: expandedNodes.has("root"),
      };
      const prevRoot = prevNodesMap.get("root");
      if (!prevRoot) {
        centerNode.x = width / 2;
        centerNode.y = height / 2;
      }
      restoreNodePhysics(centerNode);
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
          restoreNodePhysics(yNode, centerNode);
          nodes.push(yNode);

          links.push({
            source: "root",
            target: yrId,
            type: "center-era",
          });

          // 3. Media nodes under this year
          if (expandedNodes.has(yrId)) {
            timelineData.items.forEach((item) => {
              if (item.year === yr) {
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
                restoreNodePhysics(mNode, yNode);
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
                  restoreNodePhysics(tNode, mNode);
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
                    restoreNodePhysics(aNode, mNode);
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

      const releaseConflictingPins = (activeNode: GraphNode) => {
        const activeRect = getNodeRect(activeNode, undefined, undefined, 28);
        nodes.forEach((otherNode) => {
          if (otherNode.id === activeNode.id) return;
          if (!rectsOverlap(activeRect, getNodeRect(otherNode, undefined, undefined, 28))) return;
          otherNode.fx = null;
          otherNode.fy = null;
        });
        simulationRef.current?.alpha(0.45).restart();
      };

      // Drag behavior
      const drag = d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          simulationRef.current?.stop();
          d.fx = d.x;
          d.fy = d.y;
          d3.select(event.sourceEvent.target.closest('.node')).classed("is-dragging", true);
        })
        .on("drag", (event, d) => {
          const constrained = clampPointToMesh(d, { x: event.x, y: event.y }, width, height);
          d.x = constrained.x;
          d.y = constrained.y;
          d.fx = constrained.x;
          d.fy = constrained.y;
          tickedRef.current?.();
        })
        .on("end", (event, d) => {
          d3.select(event.sourceEvent.target.closest('.node')).classed("is-dragging", false);
          d.originalX = d.x;
          d.originalY = d.y;
          // Manual placement is authoritative until the user resets the view.
          d.fx = d.x;
          d.fy = d.y;
          tickedRef.current?.();
        });

      const resize = d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          event.sourceEvent.stopPropagation();
          d.fx = d.x;
          d.fy = d.y;
          d3.select((event.sourceEvent.target as Element).closest(".node"))
            .classed("is-resizing", true);
        })
        .on("drag", function (event, d) {
          event.sourceEvent.stopPropagation();
          const deltaWidth = Math.abs(event.x - (d.x ?? 0)) * 2;
          const deltaHeight = Math.abs(event.y - (d.y ?? 0)) * 2;

          if (d.type === "text") {
            const limits = NODE_LIMITS.text;
            d.width = Math.max(limits.minWidth, Math.min(limits.maxWidth, deltaWidth));
            d.height = Math.max(limits.minHeight, Math.min(limits.maxHeight, deltaHeight));
          } else if (d.type === "media") {
            const kind = d.itemData?.mediaType === "Video" ? "video" : "image";
            const limits = NODE_LIMITS[kind];
            const defaults = NODE_SIZE[kind];
            const scaleFromPointer = Math.max(
              deltaWidth / defaults.width,
              deltaHeight / defaults.height
            );
            const minScale = Math.max(
              limits.minWidth / defaults.width,
              limits.minHeight / defaults.height
            );
            const maxScale = Math.min(
              limits.maxWidth / defaults.width,
              limits.maxHeight / defaults.height
            );
            const nextScale = Math.max(minScale, Math.min(maxScale, scaleFromPointer));
            d.width = defaults.width * nextScale;
            d.height = defaults.height * nextScale;
          }

          constrainNodeToMesh(d, width, height);
          const nodeElement = this.parentNode as SVGGElement;
          updateNodeGeometry(nodeElement, d);
          simulationRef.current?.alpha(0.18).restart();
          tickedRef.current?.();
        })
        .on("end", (event, d) => {
          event.sourceEvent.stopPropagation();
          d3.select((event.sourceEvent.target as Element).closest(".node"))
            .classed("is-resizing", false);
          d.originalX = d.x;
          d.originalY = d.y;
          d.fx = d.x;
          d.fy = d.y;
          releaseConflictingPins(d);
          simulationRef.current?.alphaTarget(0);
        });

      const resizeWithKeyboard = function (
        this: SVGGElement,
        event: KeyboardEvent,
        d: GraphNode
      ) {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 20 : 8;
        const grow = event.key === "ArrowRight" || event.key === "ArrowDown";
        const delta = grow ? step : -step;

        if (d.type === "text") {
          const limits = NODE_LIMITS.text;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            d.width = Math.max(limits.minWidth, Math.min(limits.maxWidth, getWidth(d) + delta));
          } else {
            d.height = Math.max(limits.minHeight, Math.min(limits.maxHeight, getHeight(d) + delta));
          }
        } else if (d.type === "media") {
          const kind = d.itemData?.mediaType === "Video" ? "video" : "image";
          const limits = NODE_LIMITS[kind];
          const defaults = NODE_SIZE[kind];
          const nextWidth = Math.max(limits.minWidth, Math.min(limits.maxWidth, getWidth(d) + delta));
          const scale = nextWidth / defaults.width;
          d.width = nextWidth;
          d.height = Math.max(limits.minHeight, Math.min(limits.maxHeight, defaults.height * scale));
        }

        constrainNodeToMesh(d, width, height);
        updateNodeGeometry(this.parentNode as SVGGElement, d);
        releaseConflictingPins(d);
        simulationRef.current?.alpha(0.18).restart();
        tickedRef.current?.();
      };

      // RENDER LINKS
      const linkSelection = mainGroup
        .selectAll<SVGPathElement, GraphLink>(".link")
        .data(links, (d) => {
          const sourceId = typeof d.source === "string" ? d.source : d.source.id;
          const targetId = typeof d.target === "string" ? d.target : d.target.id;
          return `${sourceId}-${targetId}`;
        });

      linkSelection.exit()
        .transition()
        .duration(200)
        .style("opacity", 0)
        .remove();

      const linkEnter = linkSelection.enter().append("path").attr("class", "link");

      const allLinks = linkEnter.merge(linkSelection);

      allLinks.classed("active", false).classed("faded", false);

      // RENDER NODES
      const nodeSelection = mainGroup
        .selectAll<SVGGElement, GraphNode>(".node")
        .data(nodes, (d) => d.id);

      nodeSelection.exit()
        .style("pointer-events", "none")
        .transition()
        .duration(200)
        .style("opacity", 0)
        .remove();

      const nodeEnter = nodeSelection
        .enter()
        .append("g")
        .attr("class", (d) => `node node-${d.type}`)
        .call(drag)
        .on("click", (event, d) => {
          if (event.defaultPrevented) return;

          const nodeId = d.id;
          const isExpanded = expandedNodesRef.current.has(nodeId);
          const canExpand = d.type === "center" || d.type === "year" || d.type === "media";
          branchFocusNodeRef.current = !isExpanded && canExpand ? nodeId : null;

          setExpandedNodes((prevExpanded) => {
            const nextExpanded = new Set(prevExpanded);

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
            } else {
              nextExpanded.add(nodeId);
              if (nodeId === "root") {
                const yearKeys = Object.keys(timelineData.eras).map(Number);
                yearKeys.forEach((yr) => {
                  if (!collapsedYearsRef.current.has(yr)) {
                    nextExpanded.add(`year-${yr}`);
                  }
                });
              }
            }
            return nextExpanded;
          });

          if (d.type === "year" && d.year) {
            setCollapsedYears((prevCollapsed) => {
              const nextCollapsed = new Set(prevCollapsed);
              if (isExpanded) {
                nextCollapsed.add(d.year!);
              } else {
                nextCollapsed.delete(d.year!);
              }
              return nextCollapsed;
            });
          }

          setSelectedNodeId(nodeId);
          event.stopPropagation();
        });

      // Center node template
      nodeEnter
        .filter((d) => d.type === "center")
        .each(function () {
          const group = d3.select(this).append("g").attr("class", "node-content");
          group.append("circle").attr("r", 55);
          group.append("text").attr("dy", -6).text("RUBENIUS");
          group
            .append("text")
            .attr("dy", 12)
            .text("INTERIORS")
            .style("font-size", "10px")
            .style("fill", "#ffffff");

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
          const group = d3.select(this).append("g").attr("class", "node-content");
          group.append("circle").attr("r", 20);
          group.append("text").attr("dy", 4).text(d.label);
          group
            .append("text")
            .attr("class", "expand-glyph")
            .attr("x", 0)
            .attr("y", 32)
            .text(collapsedYears.has(d.year!) ? "+" : "−");
        });

      // Responsive image/video card with inline playback controls.
      nodeEnter
        .filter((d) => d.type === "media")
        .each(function (d) {
          const node = d3.select<SVGGElement, GraphNode>(this);
          const group = node.append("g").attr("class", "node-content");
          const item = d.itemData!;
          const meta = categoryMeta[d.category!] || { color: "#d4af37" };
          const foreign = group
            .append("foreignObject")
            .attr("class", "node-foreign media-foreign");
          const shell = foreign
            .append("xhtml:div")
            .attr("class", `media-node-shell media-node-${item.mediaType.toLowerCase()}`)
            .style("--node-accent", meta.color);

          const stage = shell.append("xhtml:div").attr("class", "media-node-stage");

          if (item.mediaType === "Video") {
            const hasSource = Boolean(item.videoSrc);
            const isYouTube = Boolean(item.videoSrc && (item.videoSrc.includes("youtube.com") || item.videoSrc.includes("youtu.be")));

            if (isYouTube) {
              let videoId = "";
              const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
              const match = item.videoSrc!.match(regExp);
              if (match && match[2].length === 11) {
                videoId = match[2];
              }
              const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : item.videoSrc!;

              stage
                .append("xhtml:iframe")
                .attr("class", "node-video")
                .attr("src", embedUrl)
                .attr("frameborder", "0")
                .attr("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture")
                .attr("allowfullscreen", "")
                .style("border", "none")
                .style("width", "100%")
                .style("height", "100%");
            } else {
              const videoSelection = stage
                .append("xhtml:video")
                .attr("class", "node-video")
                .attr("poster", item.image)
                .attr("preload", "metadata")
                .attr("playsinline", "")
                .attr("muted", "")
                .attr("autoplay", "")
                .attr("loop", "")
                .attr("aria-label", `${item.title} video`);

              if (item.videoSrc) videoSelection.attr("src", item.videoSrc);
              if (item.captionsSrc) {
                videoSelection
                  .append("xhtml:track")
                  .attr("kind", "captions")
                  .attr("src", item.captionsSrc)
                  .attr("srclang", "en")
                  .attr("label", "English");
              }

              const video = videoSelection.node() as HTMLVideoElement;
              video.muted = true;

              if (!hasSource) {
                stage
                  .append("xhtml:div")
                  .attr("class", "video-source-note")
                  .text("Add videoSrc to enable playback");
              }

              const controls = shell
                .append("xhtml:div")
                .attr("class", "node-video-controls")
                .on("pointerdown", (event) => event.stopPropagation())
                .on("click", (event) => event.stopPropagation());

              const playButton = controls
                .append("xhtml:button")
                .attr("type", "button")
                .attr("class", "video-control-btn video-play-btn")
                .attr("aria-label", "Play video")
                .property("disabled", !hasSource)
                .text("▶");

              const progress = controls
                .append("xhtml:input")
                .attr("class", "video-progress")
                .attr("type", "range")
                .attr("min", "0")
                .attr("max", "100")
                .attr("step", "0.1")
                .attr("value", "0")
                .attr("aria-label", "Video progress")
                .property("disabled", !hasSource);

              const time = controls
                .append("xhtml:span")
                .attr("class", "video-time")
                .text("0:00 / 0:00");

              const speed = controls
                .append("xhtml:select")
                .attr("class", "video-speed")
                .attr("aria-label", "Playback speed")
                .property("disabled", !hasSource);
              [0.5, 1, 1.25, 1.5, 2].forEach((rate) => {
                speed
                  .append("xhtml:option")
                  .attr("value", String(rate))
                  .property("selected", rate === 1)
                  .text(`${rate}×`);
              });

              const muteButton = controls
                .append("xhtml:button")
                .attr("type", "button")
                .attr("class", "video-control-btn video-mute-btn")
                .attr("aria-label", "Unmute video")
                .property("disabled", !hasSource)
                .text("🔇");

              const volume = controls
                .append("xhtml:input")
                .attr("class", "video-volume")
                .attr("type", "range")
                .attr("min", "0")
                .attr("max", "1")
                .attr("step", "0.05")
                .attr("value", "0.8")
                .attr("aria-label", "Video volume")
                .property("disabled", !hasSource);

              const fullscreenButton = controls
                .append("xhtml:button")
                .attr("type", "button")
                .attr("class", "video-control-btn video-fullscreen-btn")
                .attr("aria-label", "Enter fullscreen")
                .property("disabled", !hasSource)
                .text("⛶");

              const updatePlayState = () => {
                playButton.text(video.paused ? "▶" : "❚❚");
                playButton.attr("aria-label", video.paused ? "Play video" : "Pause video");
              };
              const updateTimeline = () => {
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                const percentage = duration ? (video.currentTime / duration) * 100 : 0;
                progress.property("value", percentage);
                const formatTime = (seconds: number) => {
                  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
                  const minutes = Math.floor(safeSeconds / 60);
                  const remainder = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
                  return `${minutes}:${remainder}`;
                };
                time.text(`${formatTime(video.currentTime)} / ${formatTime(duration)}`);
              };

              playButton.on("click", () => {
                if (video.paused) void video.play().catch(() => undefined);
                else video.pause();
              });
              stage
                .on("pointerdown", (event) => event.stopPropagation())
                .on("click", (event) => {
                  event.stopPropagation();
                  if (!hasSource) return;
                  if (video.paused) void video.play().catch(() => undefined);
                  else video.pause();
                });
              progress.on("input", (event) => {
                if (!video.duration) return;
                const input = event.currentTarget as HTMLInputElement;
                video.currentTime = (Number(input.value) / 100) * video.duration;
              });
              speed.on("change", (event) => {
                video.playbackRate = Number((event.currentTarget as HTMLSelectElement).value);
              });
              muteButton.on("click", () => {
                video.muted = !video.muted;
                muteButton.text(video.muted ? "🔇" : "🔊");
                muteButton.attr("aria-label", video.muted ? "Unmute video" : "Mute video");
              });
              volume.on("input", (event) => {
                const nextVolume = Number((event.currentTarget as HTMLInputElement).value);
                video.volume = nextVolume;
                video.muted = nextVolume === 0;
                muteButton.text(video.muted ? "🔇" : "🔊");
              });
              fullscreenButton.on("click", () => {
                const shellElement = shell.node() as HTMLElement;
                void shellElement.requestFullscreen?.();
              });

              video.addEventListener("play", updatePlayState);
              video.addEventListener("pause", updatePlayState);
              video.addEventListener("timeupdate", updateTimeline);
              video.addEventListener("loadedmetadata", updateTimeline);
              if (hasSource) void video.play().catch(() => undefined);
            }
          } else {
            stage
              .append("xhtml:img")
              .attr("class", "node-image")
              .attr("src", item.image)
              .attr("alt", item.title)
              .attr("draggable", "false");
          }

          shell
            .append("xhtml:div")
            .attr("class", "media-node-caption")
            .append("xhtml:span")
            .text(item.title);

          const handle = node
            .append("g")
            .attr("class", "resize-handle")
            .attr("role", "button")
            .attr("tabindex", 0)
            .attr("aria-label", `Resize ${item.mediaType.toLowerCase()} node`)
            .call(resize)
            .on("keydown", resizeWithKeyboard)
            .on("click", (event) => event.stopPropagation());
          handle.append("rect").attr("x", -10).attr("y", -10).attr("width", 20).attr("height", 20).attr("rx", 5);
          handle.append("path").attr("d", "M-4 5L5-4M1 5L5 1");
          node.append("text").attr("class", "node-size-label");
          updateNodeGeometry(this, d);
        });

      // Text node template (ForeignObject rectangle containing wrapped HTML text)
      nodeEnter
        .filter((d) => d.type === "text")
        .each(function (d) {
          const node = d3.select<SVGGElement, GraphNode>(this);
          const group = node.append("g").attr("class", "node-content");
          const item = d.itemData!;
          const foreign = group
            .append("foreignObject")
            .attr("class", "node-foreign text-foreign");

          const card = foreign
            .append("xhtml:div")
            .attr("class", "canvas-text-card")
            .html(`
              <div class="card-year-tag">${item.year}</div>
              <div class="card-title">${item.title}</div>
              <div class="card-desc">${item.description}</div>
              <div class="card-meta">${item.stats}</div>
            `);

          card
            .on("pointerdown", (event) => event.stopPropagation())
            .on("click", (event) => event.stopPropagation())
            .on("wheel", (event) => event.stopPropagation());

          const handle = node
            .append("g")
            .attr("class", "resize-handle")
            .attr("role", "button")
            .attr("tabindex", 0)
            .attr("aria-label", "Resize text node")
            .call(resize)
            .on("keydown", resizeWithKeyboard)
            .on("click", (event) => event.stopPropagation());
          handle.append("rect").attr("x", -10).attr("y", -10).attr("width", 20).attr("height", 20).attr("rx", 5);
          handle.append("path").attr("d", "M-4 5L5-4M1 5L5 1");
          node.append("text").attr("class", "node-size-label");
          updateNodeGeometry(this, d);
        });

      // Awards node template (ForeignObject rectangle for Awards)
      nodeEnter
        .filter((d) => d.type === "awards")
        .each(function (d) {
          const group = d3.select(this).append("g").attr("class", "node-content");
          const item = d.itemData!;
          
          const foreign = group
            .append("foreignObject")
            .attr("class", "node-foreign");

          foreign
            .append("xhtml:div")
            .attr("class", "canvas-award-card")
            .html(`
              <span class="award-trophy">🏆</span>
              <span class="award-text">${item.awards.join(" • ")}</span>
            `);
          updateNodeGeometry(this, d);
        });

      const allNodes = nodeEnter.merge(nodeSelection);

      // Class settings & filtering dim effects
      allNodes.each(function (d) {
        const el = d3.select<SVGGElement, GraphNode>(this);
        el.classed("selected", d.id === selectedNodeId);

        const isExpanded = expandedNodes.has(d.id);
        const hasHidden = !isExpanded && (d.type === "center" || d.type === "year" || d.type === "media");
        el.classed("has-hidden-children", hasHidden);
        el.classed("faded", false);
        updateNodeGeometry(this, d);
      });

      // A clear plus/minus replaces the previous ambiguous status dot.
      allNodes
        .filter((d) => d.type === "year")
        .select(".expand-glyph")
        .text((d) => (collapsedYears.has(d.year!) ? "+" : "−"));

      // Update force simulation data
      simulationRef.current.nodes(nodes);
      (simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>)?.links(links);
      simulationRef.current.alpha(0.8).restart();

      if (branchVisibilityTimerRef.current !== null) {
        window.clearTimeout(branchVisibilityTimerRef.current);
        branchVisibilityTimerRef.current = null;
      }
      if (branchFocusNodeRef.current) {
        const focusNodeId = branchFocusNodeRef.current;
        branchVisibilityTimerRef.current = window.setTimeout(() => {
          ensureBranchVisibleRef.current(focusNodeId);
          // Re-check once the force layout has cooled so late movement cannot push
          // the newly opened branch back outside the viewport.
          branchVisibilityTimerRef.current = window.setTimeout(() => {
            ensureBranchVisibleRef.current(focusNodeId);
            branchFocusNodeRef.current = null;
            branchVisibilityTimerRef.current = null;
          }, 620);
        }, 280);
      }
    }, [collapsedYears, selectedNodeId, expandedNodes, setCollapsedYears, setSelectedNodeId]);

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
