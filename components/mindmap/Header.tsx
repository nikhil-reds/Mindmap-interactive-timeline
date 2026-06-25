"use client";

import React from "react";

interface HeaderProps {
  currentSearch: string;
  setCurrentSearch: (val: string) => void;
  activeView: "mindmap" | "gallery";
  setActiveView: (view: "mindmap" | "gallery") => void;
  openTour: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentSearch,
  setCurrentSearch,
  activeView,
  setActiveView,
  openTour,
}) => {
  return (
    <header>
      <div className="brand">
        <h1>Rubenius Interiors</h1>
        <span>20 Years of Design Excellence</span>
      </div>

      <div className="controls-header">
        {/* Search Bar */}
        <div className="search-container">
          <input
            type="text"
            placeholder="Search milestones, projects..."
            value={currentSearch}
            onChange={(e) => setCurrentSearch(e.target.value)}
          />
          <svg viewBox="0 0 24 24">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
        </div>

        {/* View Switcher */}
        <div className="view-toggle">
          <button
            className={activeView === "mindmap" ? "active" : ""}
            onClick={() => setActiveView("mindmap")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M3 20h18M3 4h18M12 4v16" />
            </svg>
            Mind-Map
          </button>
          <button
            className={activeView === "gallery" ? "active" : ""}
            onClick={() => setActiveView("gallery")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
            Gallery
          </button>
        </div>

        {/* Tour / Help Button */}
        <button
          onClick={openTour}
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--border-glass)",
            color: "var(--primary)",
            padding: "8px 16px",
            fontSize: "12px",
            fontWeight: 600,
            borderRadius: "20px",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            transition: "var(--transition)",
          }}
          className="hover:border-[var(--primary)] hover:bg-[rgba(212,175,55,0.05)]"
        >
          Tour Guide
        </button>
      </div>
    </header>
  );
};
