"use client";

import React from "react";

interface TourOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TourOverlay: React.FC<TourOverlayProps> = ({ isOpen, onClose }) => {
  return (
    <div className={`tour-overlay ${isOpen ? "open" : ""}`}>
      <div className="tour-box">
        <div className="tour-logo">Rubenius Interiors</div>
        <div className="tour-sub">20 Years of Design Excellence</div>
        <div className="tour-desc">
          Welcome to our interactive timeline & brand catalog. Discover how we've
          sculpted experiences, retail environments, and workspace innovations
          since 2005.
        </div>
        <div
          style={{
            textAlign: "left",
            fontSize: "12px",
            lineHeight: "1.8",
            color: "var(--text-muted)",
            width: "100%",
            margin: "10px 0",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border-glass)",
            padding: "15px",
            borderRadius: "8px",
          }}
        >
          <p style={{ color: "var(--primary-light)", fontWeight: 500, marginBottom: "5px" }}>
            Mind-Map Operations:
          </p>
          <p>• Scroll to Zoom, Drag to Pan</p>
          <p>• Click <strong style={{ color: "var(--primary)" }}>Year Nodes</strong> to collapse / expand branches</p>
          <p>• Click <strong style={{ color: "var(--primary)" }}>Outer Items</strong> to view asset descriptions</p>
        </div>
        <button className="tour-btn" onClick={onClose}>
          Enter Experience
        </button>
      </div>
    </div>
  );
};
