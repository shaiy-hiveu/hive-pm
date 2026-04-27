// ─── Supabase / local DB types ───────────────────────────────────────────────

export type Pillar = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  order_index: number;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  pillar_id: string | null;
  area: "core" | "research" | "production" | "other";
  status: "active" | "paused" | "archived";
  notion_filter?: string | null;
  created_at: string;
};

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  pillar_id: string | null;
  product_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "not_started" | "in_progress" | "done" | "blocked";
  progress: number; // 0-100
  created_at: string;
};

export type Sprint = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  product_id: string | null;
  created_at: string;
};

// ─── Notion types ─────────────────────────────────────────────────────────────

export type NotionTask = {
  id: string;
  page_url: string;
  notion_id: number | null;
  name: string;
  status: string | null;
  priority: string | null;
  product: string | null;
  area: string | null;
  sprint: string | null;
  assignee: string | null;
  due_date: string | null;
  type: "feature" | "bug" | "task" | null;
  tags: string[];
  created_at?: string | null;
};
