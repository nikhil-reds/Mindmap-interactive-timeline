"use client";

import React, { useState } from "react";
import { TimelineItem } from "./types";
import { categoryMeta } from "./data";

interface GalleryCardProps {
  item: TimelineItem;
  onClick: () => void;
}

const GalleryCard: React.FC<GalleryCardProps> = ({ item, onClick }) => {
  const [imgError, setImgError] = useState(false);
  const meta = categoryMeta[item.category] || { color: "#d4af37", icon: "" };

  const renderFallback = () => (
    <div className="media-fallback">
      <svg className="fallback-pattern" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <pattern id={`grid-card-${item.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" strokeWidth="0.5" stroke="var(--border-glass)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-card-${item.id})`} />
        <circle cx="50" cy="50" r="35" fill="none" stroke="var(--primary)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="45" fill="none" stroke="var(--primary)" strokeWidth="0.2" strokeDasharray="2, 2" />
      </svg>
      <svg className="fallback-icon" viewBox="0 0 24 24">
        <path d={meta.icon} fill="currentColor" />
      </svg>
      <span className="text-center text-[10px] px-2 font-serif text-[var(--primary-light)] truncate max-w-full">
        {item.title}
      </span>
    </div>
  );

  return (
    <div className="card" onClick={onClick}>
      <div className="card-media">
        <span
          className="card-tag"
          style={{ borderColor: meta.color, color: meta.color }}
        >
          {item.category}
        </span>
        <span className="card-year">{item.year}</span>

        {item.mediaType === "Video" ? (
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            {renderFallback()}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="var(--primary-light)"
                style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" }}
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        ) : !imgError && item.image ? (
          <img
            className="media-image w-full h-full object-cover"
            src={item.image}
            alt={item.title}
            onError={() => setImgError(true)}
          />
        ) : (
          renderFallback()
        )}
      </div>
      <div className="card-body">
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </div>
      <div className="card-footer">
        <span>{item.stats.split(" • ")[2] || "Experience Design"}</span>
        <span style={{ fontSize: "12px" }}>
          🏆 {item.awards.length} Award{item.awards.length > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
};

interface GalleryViewProps {
  isActive: boolean;
  filteredItems: TimelineItem[];
  onSelectItem: (item: TimelineItem) => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({
  isActive,
  filteredItems,
  onSelectItem,
}) => {
  return (
    <div className={`gallery-container ${isActive ? "active" : ""}`}>
      {filteredItems.length === 0 ? (
        <div className="nodata-message">
          No projects found matching the active search or category filters.
        </div>
      ) : (
        <div className="gallery-grid">
          {filteredItems.map((item) => (
            <GalleryCard
              key={item.id}
              item={item}
              onClick={() => onSelectItem(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
