"use client";

import React, { useState, useRef } from "react";
import { ZoomControls } from "./ZoomControls";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  DEFAULT_ZOOM,
  MindmapCanvas,
  MindmapCanvasRef,
} from "./MindmapCanvas";
import "./mindmap.css";

export const InteractiveMindmap: React.FC = () => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(
    new Set([2005, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024])
  );
  const [zoomScale, setZoomScale] = useState(DEFAULT_ZOOM);

  const canvasRef = useRef<MindmapCanvasRef | null>(null);

  return (
    <div className="mindmap-app">
      {/* Background decoration */}
      <div className="bg-glow" />
      <div className="bg-grid" />

      <div className="main-content">
        {/* Dynamic Main View */}
        <div className="relative flex-1 h-full w-full">
          <MindmapCanvas
            ref={canvasRef}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            collapsedYears={collapsedYears}
            setCollapsedYears={setCollapsedYears}
            onZoomChange={setZoomScale}
          />
          <ZoomControls
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            onReset={() => canvasRef.current?.resetView()}
            zoomScale={zoomScale}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
          />
        </div>
      </div>
    </div>
  );
};
