"use client";

import React, { useState, useMemo, useRef } from "react";
import { Header } from "./Header";
import { ZoomControls } from "./ZoomControls";
import { TourOverlay } from "./TourOverlay";
import { DetailsDrawer } from "./DetailsDrawer";
import { GalleryView } from "./GalleryView";
import { MindmapCanvas, MindmapCanvasRef } from "./MindmapCanvas";
import { timelineData, categoryMeta } from "./data";
import { TimelineItem } from "./types";
import "./mindmap.css";

export const InteractiveMindmap: React.FC = () => {
  const [activeView, setActiveView] = useState<"mindmap" | "gallery">("mindmap");
  const [currentSearch, setCurrentSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [activeMediaFilter, setActiveMediaFilter] = useState("All");
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isTourOpen, setIsTourOpen] = useState(true);
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(
    new Set([2005, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024])
  );

  const canvasRef = useRef<MindmapCanvasRef | null>(null);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    timelineData.items.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, []);

  // Filter items for gallery / search calculations
  const filteredItems = useMemo(() => {
    return timelineData.items.filter((item) => {
      // Search
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

      // Categories
      if (activeCategories.size > 0 && !activeCategories.has(item.category)) {
        return false;
      }

      // Media
      if (activeMediaFilter !== "All" && item.mediaType !== activeMediaFilter) {
        return false;
      }

      return true;
    });
  }, [currentSearch, activeCategories, activeMediaFilter]);

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

      {/* Top Header */}
      <Header
        currentSearch={currentSearch}
        setCurrentSearch={setCurrentSearch}
        activeView={activeView}
        setActiveView={setActiveView}
        openTour={() => setIsTourOpen(true)}
      />

      <div className="main-content">
        {/* Left Filter Sidebar */}
        <aside className="filter-panel">
          <div className="filter-section">
            <h3>
              <span>Disciplines</span>
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

          <div className="filter-section">
            <h3>Media Type</h3>
            <div className="media-filter">
              {["All", "Image", "Video"].map((type) => (
                <button
                  key={type}
                  className={`media-btn ${activeMediaFilter === type ? "active" : ""}`}
                  onClick={() => setActiveMediaFilter(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Dynamic Main View */}
        {activeView === "mindmap" ? (
          <div className="relative flex-1 h-full w-full">
            <MindmapCanvas
              ref={canvasRef}
              currentSearch={currentSearch}
              activeCategories={activeCategories}
              activeMediaFilter={activeMediaFilter}
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
        ) : (
          <GalleryView
            isActive={activeView === "gallery"}
            filteredItems={filteredItems}
            onSelectItem={handleSelectItem}
          />
        )}
      </div>

      {/* Side drawer for selected item details */}
      <DetailsDrawer
        isOpen={selectedItem !== null}
        onClose={() => handleSelectItem(null)}
        selectedItem={selectedItem}
      />

      {/* Guide tour popup */}
      <TourOverlay isOpen={isTourOpen} onClose={() => setIsTourOpen(false)} />
    </div>
  );
};
