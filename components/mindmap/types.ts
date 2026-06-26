export interface TimelineItem {
  id: string;
  year: number;
  title: string;
  category: string;
  stats: string;
  description: string;
  image: string;
  mediaType: "Image" | "Video";
  awards: string[];
}

export interface Era {
  theme: string;
  highlights: string;
}

export interface CenterInfo {
  title: string;
  subtitle: string;
  description: string;
}

export interface TimelineData {
  center: CenterInfo;
  eras: Record<number, Era>;
  items: TimelineItem[];
}

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: "center" | "year" | "media" | "text" | "awards";
  label: string;
  category?: string;
  year?: number;
  itemData?: TimelineItem;
  eraData?: Era;
  originalX?: number;
  originalY?: number;
  fx?: number | null;
  fy?: number | null;
  isExpanded?: boolean;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: "center-era" | "era-media" | "media-text" | "media-awards";
}
