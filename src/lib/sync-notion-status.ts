import { supabaseAdmin } from "@/lib/supabase";
import { fetchNotionTasks } from "@/lib/notion";
import { withProgressTag, progressOverride } from "@/lib/sprints";

function mapStatus(s: string | null): "todo" | "in_progress" | "done" | "blocked" {
  if (!s) return "todo";
  const l = s.toLowerCase();
  if (l.includes("progress") || l.includes("working")) return "in_progress";
  if (l.includes("done") || l.includes("complete") || l.includes("approved")) return "done";
  if (l.includes("block")) return "blocked";
  return "todo";
}

export type SyncResult = { updated: number; total: number };

type DoneSnapshot = {
  notion_page_id: string;
  notion_id: number | null;
  name: string;
  assignee: string | null;
  status: string | null;
  product: string | null;
};

function isDoneNotionStatus(status: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return s.includes("done") || s.includes("complete") || s.includes("approved");
}

// Pulls fresh Notion data for every DB task that has a notion_page_id and
// updates only the fields that change frequently in Notion (status, the
// notion:approved tag, due_date). Title / product / type stay as set at
// import time. Also records a "sampling" row capturing every Done/Approved
// task at this point in time, so the gantt page can show what flipped to
// Done since the previous refresh.
export async function syncNotionStatus(): Promise<SyncResult> {
  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from("tasks")
    .select("id, notion_page_id, status, tags, due_date")
    .not("notion_page_id", "is", null);
  if (error) throw error;

  const notionTasks = await fetchNotionTasks();

  // Record sampling — a snapshot of every Notion task currently Done /
  // Complete / Approved. Used by the gantt page's "Newly done" digest.
  // Failures here are non-fatal: the sync still proceeds.
  try {
    const doneSnapshot: DoneSnapshot[] = notionTasks
      .filter(t => isDoneNotionStatus(t.status))
      .map(t => ({
        notion_page_id: t.id,
        notion_id: t.notion_id ?? null,
        name: t.name,
        assignee: t.assignee ?? null,
        status: t.status ?? null,
        product: t.product ?? null,
      }));
    const { error: sampleErr } = await db
      .from("notion_samplings")
      .insert({ done_tasks: doneSnapshot });
    if (sampleErr) console.warn("notion_samplings insert error:", sampleErr.message);
  } catch (e: unknown) {
    console.warn("notion_samplings insert exception:", e instanceof Error ? e.message : e);
  }

  if (!rows || rows.length === 0) return { updated: 0, total: 0 };

  const linkedIds = new Set(rows.map(r => r.notion_page_id as string));
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
    // Manual progress override is per-status: when status changes, drop the
    // override so the bar reverts to the new status' default weight.
    if (newStatus !== row.status && progressOverride(nextTags) != null) {
      nextTags = withProgressTag(nextTags, null);
    }
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
