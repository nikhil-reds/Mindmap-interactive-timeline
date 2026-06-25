"use client";

import React, { useState, useMemo, useRef } from "react";
import { ZoomControls } from "./ZoomControls";
import { DetailsDrawer } from "./DetailsDrawer";
import { MindmapCanvas, MindmapCanvasRef } from "./MindmapCanvas";
import { timelineData, categoryMeta } from "./data";
import { TimelineItem } from "./types";
import "./mindmap.css";

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
                    >
                      <span className="flex items-center">
                        <span
                          className="category-dot"
                          style={{ backgroundColor: meta.color }}
                        />
                        {cat}
                      </span>
                      <span className="category-count">{count}</span>
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
