// Shared client-side cache for Notion metadata keyed by notion_page_id.
// Used by PillarBlock, GanttChart, and the candidate picker so a single
// fetch covers every place that wants to render task IDs / priorities.

export type NotionMeta = {
  ids: Record<string, number>;
  priorities: Record<string, string>;
};

const STORAGE_KEY = "notion:meta-cache";
let memCached: NotionMeta | null = null;

function readFromStorage(): NotionMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        ids: parsed.ids ?? {},
        priorities: parsed.priorities ?? {},
      };
    }
  } catch { /* noop */ }
  return null;
}

function writeToStorage(meta: NotionMeta) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch { /* noop */ }
}

// Returns cached data if available — never auto-refetches. The user
// triggers a refresh explicitly via the Refresh Data button (which calls
// refreshNotionMeta()). On absolute first load (no cache yet), we do
// fetch once so the UI has something to show.
async function loadNotionMeta(): Promise<NotionMeta> {
  if (memCached) return memCached;
  const stored = readFromStorage();
  if (stored) {
    memCached = stored;
    return stored;
  }
  return refreshNotionMeta();
}

export async function refreshNotionMeta(): Promise<NotionMeta> {
  try {
    const res = await fetch("/api/notion/id-map");
    if (!res.ok) return memCached ?? { ids: {}, priorities: {} };
    const data = await res.json();
    const meta: NotionMeta = {
      ids: data.map ?? {},
      priorities: data.priorities ?? {},
    };
    memCached = meta;
    writeToStorage(meta);
    return meta;
  } catch {
    return memCached ?? { ids: {}, priorities: {} };
  }
}

// Backwards-compat: many call sites only need the id map.
export async function loadNotionIdMap(): Promise<Record<string, number>> {
  const meta = await loadNotionMeta();
  return meta.ids;
}

export async function loadNotionMetaMap(): Promise<NotionMeta> {
  return loadNotionMeta();
}

export function clearNotionIdMapCache(): void {
  memCached = null;
  if (typeof window !== "undefined") {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }
}
