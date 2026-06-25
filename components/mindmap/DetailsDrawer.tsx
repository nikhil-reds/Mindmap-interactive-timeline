"use client";

import React, { useState, useEffect } from "react";
import { TimelineItem } from "./types";
import { categoryMeta } from "./data";

interface DetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItem: TimelineItem | null;
}

export const DetailsDrawer: React.FC<DetailsDrawerProps> = ({
  isOpen,
  onClose,
  selectedItem,
}) => {
  const [imgError, setImgError] = useState(false);

  // Reset image error state when selected item changes
  useEffect(() => {
    setImgError(false);
  }, [selectedItem]);

  if (!selectedItem) return null;

  const meta = categoryMeta[selectedItem.category] || {
    color: "#d4af37",
    icon: "",
  };

  return (
    <div className={`details-drawer ${isOpen ? "open" : ""}`}>
      <div className="drawer-header">
        <span
          className="tag"
          style={{
            borderColor: meta.color,
            color: "var(--primary-light)",
            background: `${meta.color}26`, // 15% opacity hex
          }}
        >
          {selectedItem.category}
        </span>
        <button className="drawer-close" onClick={onClose} title="Close Details">
          ×
        </button>
      </div>
      <div className="drawer-body">
        <div className="drawer-title">
          <div className="drawer-year">Year {selectedItem.year}</div>
          <h2>{selectedItem.title}</h2>
        </div>

        {/* Media Frame */}
        <div className="drawer-media">
          {selectedItem.mediaType === "Video" && (selectedItem as any).videoUrl ? (
            <div className="video-container">
              <iframe
                src={(selectedItem as any).videoUrl}
                title={selectedItem.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : !imgError && selectedItem.image ? (
            <img
              src={selectedItem.image}
              alt={selectedItem.title}
              className="media-image"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="media-fallback">
              <svg className="fallback-pattern" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" strokeWidth="0.5" stroke="var(--border-glass)" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                <circle cx="50" cy="50" r="35" fill="none" stroke="var(--primary)" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--primary)" strokeWidth="0.2" strokeDasharray="2, 2" />
              </svg>
              <svg className="fallback-icon" viewBox="0 0 24 24">
                <path d={meta.icon} fill="currentColor" />
              </svg>
              <span>{selectedItem.title}</span>
            </div>
          )}
        </div>

        {/* Stats/Specs metadata */}
        <div className="drawer-stats">
          <strong>Details:</strong> {selectedItem.stats}
        </div>

        {/* Long description */}
        <div className="drawer-description">{selectedItem.description}</div>

        {/* Awards and recognitions */}
        {selectedItem.awards && selectedItem.awards.length > 0 && (
          <div className="drawer-awards">
            <h4>Awards & Recognition</h4>
            <div className="awards-list">
              {selectedItem.awards.map((award, index) => (
                <div key={index} className="award-badge">
                  <span className="emoji">🏆</span>
                  <span>{award.replace(/^🏆\s*/, "")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
