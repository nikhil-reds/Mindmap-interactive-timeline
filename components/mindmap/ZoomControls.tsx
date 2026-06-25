"use client";

import React from "react";

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
}) => {
  return (
    <div className="zoom-controls">
      <button className="zoom-btn" onClick={onZoomIn} title="Zoom In">
        +
      </button>
      <button className="zoom-btn" onClick={onZoomOut} title="Zoom Out">
        -
      </button>
      <button className="zoom-btn" onClick={onReset} title="Recenter">
        ⟲
      </button>
    </div>
  );
};
