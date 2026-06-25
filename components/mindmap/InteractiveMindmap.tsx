"use client";

import React, { useState, useMemo, useRef } from "react";
import { ZoomControls } from "./ZoomControls";
import { DetailsDrawer } from "./DetailsDrawer";
import { MindmapCanvas, MindmapCanvasRef } from "./MindmapCanvas";
import { timelineData, categoryMeta } from "./data";
import { TimelineItem } from "./types";
import "./mindmap.css";

const render3DIcon = (category: string, color: string) => {
  switch (category) {
    case "Founded":
      return (
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" className="icon-3d">
          <defs>
            <linearGradient id="gold-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffe699" />
              <stop offset="100%" stopColor="#d4af37" />
            </linearGradient>
            <filter id="glow-filter-gold" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <path d="M20 32 L32 26 L32 18 L20 24 Z" fill="url(#gold-grad-1)" opacity="0.9" />
          <path d="M20 32 L8 26 L8 18 L20 24 Z" fill="#aa7c11" />
          <path d="M20 24 L32 18 L20 12 L8 18 Z" fill="#ffe57f" filter="url(#glow-filter-gold)" />
          <path d="M20 18 L26 15 L26 8 L20 11 Z" fill="url(#gold-grad-1)" />
          <path d="M20 18 L14 15 L14 8 L20 11 Z" fill="#b58d1d" />
          <path d="M20 11 L26 8 L20 5 L14 8 Z" fill="#ffe57f" />
        </svg>
      );
    case "Workspace":
      return (
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" className="icon-3d">
          <defs>
            <linearGradient id="work-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff7b8b" />
              <stop offset="100%" stopColor="#e84a5f" />
            </linearGradient>
          </defs>
          <path d="M12 28 L28 28 L32 20 L8 20 Z" fill="url(#work-grad)" opacity="0.8" />
          <path d="M14 20 L26 20 L28 8 L12 8 Z" fill="rgba(255, 255, 255, 0.15)" stroke="url(#work-grad)" strokeWidth="1.5" />
          <path d="M20 28 L20 34" stroke="#ff7b8b" strokeWidth="3" strokeLinecap="round" />
          <path d="M14 34 L26 34" stroke="#e84a5f" strokeWidth="2" />
        </svg>
      );
    case "Retail":
      return (
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" className="icon-3d">
          <defs>
            <linearGradient id="retail-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffc97a" />
              <stop offset="100%" stopColor="#f5a623" />
            </linearGradient>
            <filter id="glow-filter-retail" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <path d="M20 30 L30 25 L30 15 L20 20 Z" fill="rgba(245, 166, 35, 0.1)" stroke="rgba(245, 166, 35, 0.3)" />
          <path d="M20 30 L10 25 L10 15 L20 20 Z" fill="rgba(245, 166, 35, 0.15)" stroke="rgba(245, 166, 35, 0.3)" />
          <path d="M20 30 L30 25 L20 20 L10 25 Z" fill="url(#retail-grad)" opacity="0.8" />
          <circle cx="20" cy="17" r="3" fill="#ffffff" filter="url(#glow-filter-retail)" />
          <path d="M20 10 L30 15 L30 25 M20 10 L10 15 L10 25 M20 10 L20 20" stroke="url(#retail-grad)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "Awards":
      return (
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" className="icon-3d">
          <defs>
            <linearGradient id="gold-bright" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fff" />
              <stop offset="50%" stopColor="#d4af37" />
              <stop offset="100%" stopColor="#aa7c11" />
            </linearGradient>
          </defs>
          <path d="M12 34 L28 34 L24 30 L16 30 Z" fill="#aa7c11" />
          <path d="M20 30 L20 22" stroke="url(#gold-bright)" strokeWidth="4" />
          <path d="M12 10 L28 10 L24 22 L16 22 Z" fill="rgba(255, 255, 255, 0.12)" stroke="url(#gold-bright)" strokeWidth="1.5" />
          <circle cx="20" cy="13" r="5" stroke="#d4af37" strokeWidth="1.5" />
        </svg>
      );
    default:
      return (
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" className="icon-3d">
          <path d="M20 30 L32 24 L32 14 L20 20 Z" fill={color} opacity="0.95" />
          <path d="M20 30 L8 24 L8 14 L20 20 Z" fill={color} opacity="0.75" />
          <path d="M20 20 L32 14 L20 8 L8 14 Z" fill={color} filter="brightness(1.2)" />
        </svg>
      );
  }
};

export const InteractiveMindmap: React.FC = () => {
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(
    new Set([2005, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024])
  );
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(true);

  const canvasRef = useRef<MindmapCanvasRef | null>(null);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    timelineData.items.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, []);

  const toggleCategory = (category: string) => {
    const nextCategories = new Set(activeCategories);
    if (nextCategories.has(category)) {
      nextCategories.delete(category);
    } else {
      nextCategories.add(category);
    }
    setActiveCategories(nextCategories);
  };

  const handleSelectItem = (item: TimelineItem | null) => {
    setSelectedItem(item);
    if (!item) {
      setSelectedNodeId(null);
    }
  };

  return (
    <div className="mindmap-app">
      {/* Background decoration */}
      <div className="bg-glow" />
      <div className="bg-grid" />

      <div className={`main-content ${isFilterPanelOpen ? "filters-expanded" : "filters-collapsed"}`}>
        {/* Dynamic Main View */}
        <div className="relative flex-1 h-full w-full">
          <MindmapCanvas
            ref={canvasRef}
            currentSearch=""
            activeCategories={activeCategories}
            activeMediaFilter="All"
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            onSelectItem={handleSelectItem}
            collapsedYears={collapsedYears}
            setCollapsedYears={setCollapsedYears}
          />
          <ZoomControls
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            onReset={() => canvasRef.current?.resetZoom()}
          />
        </div>

        {/* Bottom Filter Sidebar */}
        <aside className={`filter-panel ${isFilterPanelOpen ? "open" : "collapsed"}`}>
          <button
            className="filter-toggle-btn"
            onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
            aria-label={isFilterPanelOpen ? "Hide Filters" : "Show Filters"}
          >
            {isFilterPanelOpen ? "Hide Filters" : "Show Filters"} {isFilterPanelOpen ? "▼" : "▲"}
          </button>
          
          <div className="filter-panel-inner">
            <div className="filter-section">
              <h3>
                <span><span>Disciplines</span></span>
                {activeCategories.size > 0 && (
                  <button
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--primary)",
                      fontSize: "10px",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                    onClick={() => setActiveCategories(new Set())}
                  >
                    Clear
                  </button>
                )}
              </h3>
              <div className="category-list">
                {Object.entries(categoryCounts).map(([cat, count]) => {
                  const meta = categoryMeta[cat] || { color: "#d4af37" };
                  const isActive = activeCategories.has(cat);
                  return (
                    <div
                      key={cat}
                      className={`category-item ${isActive ? "active" : ""}`}
                      onClick={() => toggleCategory(cat)}
                      style={{ "--glow-color": meta.color } as React.CSSProperties}
                    >
                      {render3DIcon(cat, meta.color)}
                      <span className="category-name-wrapper">
                        {cat}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Side drawer for selected item details */}
      <DetailsDrawer
        isOpen={selectedItem !== null}
        onClose={() => handleSelectItem(null)}
        selectedItem={selectedItem}
      />
    </div>
  );
};
