import { supabaseAdmin } from "@/lib/supabase";
import { fetchNotionTasks } from "@/lib/notion";

function mapStatus(s: string | null): "todo" | "in_progress" | "done" | "blocked" {
  if (!s) return "todo";
  const l = s.toLowerCase();
  if (l.includes("progress") || l.includes("working")) return "in_progress";
  if (l.includes("done") || l.includes("complete") || l.includes("approved")) return "done";
  if (l.includes("block")) return "blocked";
  return "todo";
}

export type SyncResult = { updated: number; total: number };

// Pulls fresh Notion data for every DB task that has a notion_page_id and
// updates only the fields that change frequently in Notion (status, the
// notion:approved tag, due_date). Title / product / type stay as set at
// import time.
export async function syncNotionStatus(): Promise<SyncResult> {
  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from("tasks")
    .select("id, notion_page_id, status, tags, due_date")
    .not("notion_page_id", "is", null);
  if (error) throw error;
  if (!rows || rows.length === 0) return { updated: 0, total: 0 };

  const linkedIds = new Set(rows.map(r => r.notion_page_id as string));
  const notionTasks = await fetchNotionTasks();
  const byId = new Map(notionTasks.filter(t => linkedIds.has(t.id)).map(t => [t.id, t]));

  let updated = 0;
  for (const row of rows) {
    const t = byId.get(row.notion_page_id as string);
    if (!t) continue;

    const newStatus = mapStatus(t.status);
    const isApprovedNow = (t.status ?? "").toLowerCase().includes("approved");
    const currentTags: string[] = Array.isArray(row.tags) ? row.tags : [];
    const hadApproved = currentTags.includes("notion:approved");
    let nextTags = currentTags;
    if (isApprovedNow && !hadApproved) nextTags = [...currentTags, "notion:approved"];
    else if (!isApprovedNow && hadApproved) nextTags = currentTags.filter(x => x !== "notion:approved");
    const newDue = t.due_date ?? null;

    const tagsChanged = nextTags !== currentTags;
    const statusChanged = newStatus !== row.status;
    const dueChanged = newDue !== (row.due_date ?? null);
    if (!statusChanged && !tagsChanged && !dueChanged) continue;

    const patch: Record<string, unknown> = {};
    if (statusChanged) patch.status = newStatus;
    if (tagsChanged) patch.tags = nextTags;
    if (dueChanged) patch.due_date = newDue;

    const { error: upErr } = await db.from("tasks").update(patch).eq("id", row.id);
    if (!upErr) updated++;
  }

  return { updated, total: rows.length };
}
