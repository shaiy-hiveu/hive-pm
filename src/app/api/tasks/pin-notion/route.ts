import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchNotionTaskByPageId } from "@/lib/notion";
import { withSprintTag } from "@/lib/sprints";

function mapStatus(s: string | null): "todo" | "in_progress" | "done" | "blocked" {
  if (!s) return "todo";
  const l = s.toLowerCase();
  if (l.includes("progress") || l.includes("working")) return "in_progress";
  if (l.includes("done") || l.includes("complete") || l.includes("approved")) return "done";
  if (l.includes("block")) return "blocked";
  return "todo";
}

// Ensures a single permanent "Others" pillar exists and returns its id.
// Used as the catch-all home for tasks pinned from the synthetic Others
// view — they need a real pillar so they remain visible after pinning.
async function getOrCreateOthersPillar(db: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data: existing } = await db
    .from("pillars")
    .select("id")
    .eq("name", "Others")
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await db
    .from("pillars")
    .insert({
      name: "Others",
      description: "Default pillar for tasks not assigned elsewhere",
      color: "#9ca3af",
      icon: null,
      order_index: 999,
    })
    .select("id")
    .single();
  if (error) throw error;
  return created!.id as string;
}

// POST /api/tasks/pin-notion
//   body: { notion_page_id: string, sprintIndex: number }
// "Pins" a Notion task to a specific sprint by creating a DB row (or
// updating its tags). Used by the Gantt's "Pin auto-assigned" button for
// Others-pillar tasks. Newly-created rows are placed in a permanent
// "Others" pillar so they keep showing up in the gantt after pinning.
export async function POST(req: NextRequest) {
  try {
    const { notion_page_id, sprintIndex } = await req.json();
    if (!notion_page_id) {
      return NextResponse.json({ error: "notion_page_id required" }, { status: 400 });
    }
    const sIdx = Number(sprintIndex);
    if (!Number.isFinite(sIdx) || sIdx <= 0) {
      return NextResponse.json({ error: "sprintIndex required" }, { status: 400 });
    }
    const db = supabaseAdmin();

    const { data: existing } = await db
      .from("tasks")
      .select("id, tags")
      .eq("notion_page_id", notion_page_id)
      .maybeSingle();

    if (existing) {
      const currentTags: string[] = Array.isArray(existing.tags) ? existing.tags : [];
      const nextTags = withSprintTag(currentTags, sIdx);
      const { error } = await db.from("tasks").update({ tags: nextTags }).eq("id", existing.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, action: "tag-updated" });
    }

    const t = await fetchNotionTaskByPageId(notion_page_id);
    if (!t) return NextResponse.json({ error: "Task not found in Notion" }, { status: 404 });

    const othersPillarId = await getOrCreateOthersPillar(db);

    const tags: string[] = [];
    if (t.type) tags.push(t.type);
    if (t.status && t.status.toLowerCase().includes("approved")) tags.push("notion:approved");
    tags.push(`sprint:${sIdx}`);

    const row = {
      pillar_id: othersPillarId,
      title: t.name,
      status: mapStatus(t.status),
      source: "notion" as const,
      notion_page_id: t.id,
      notion_url: t.page_url,
      assignee: t.assignee,
      sprint_name: t.sprint,
      tags,
      product: t.product ?? null,
      due_date: t.due_date ?? null,
    };
    const { error } = await db.from("tasks").insert(row);
    if (error) throw error;
    return NextResponse.json({ ok: true, action: "created" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("pin-notion error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
