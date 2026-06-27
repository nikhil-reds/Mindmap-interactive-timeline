"use client";

import React from "react";

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  zoomScale: number;
  minZoom: number;
  maxZoom: number;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  zoomScale,
  minZoom,
  maxZoom,
}) => {
  const atMinimum = zoomScale <= minZoom + 0.001;
  const atMaximum = zoomScale >= maxZoom - 0.001;

  return (
    <div className="zoom-controls" aria-label="Canvas zoom controls">
      <button
        className="zoom-btn"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        disabled={atMaximum}
      >
        +
      </button>
      <output className="zoom-value" aria-live="polite">
        {Math.round(zoomScale * 100)}%
      </output>
      <button
        className="zoom-btn"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        disabled={atMinimum}
      >
        -
      </button>
      <button className="zoom-btn" onClick={onReset} title="Reset view" aria-label="Reset view">
        ⟲
      </button>
    </div>
  );
};
