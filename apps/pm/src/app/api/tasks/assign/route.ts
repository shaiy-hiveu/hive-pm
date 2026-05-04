import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchNotionTaskByPageId } from "@/lib/notion";
import { currentSprintIndex, SPRINT_TAG_PREFIX } from "@/lib/sprints";

function mapStatus(s: string | null): "todo" | "in_progress" | "done" | "blocked" {
  if (!s) return "todo";
  const l = s.toLowerCase();
  if (l.includes("progress") || l.includes("working")) return "in_progress";
  if (l.includes("done") || l.includes("complete") || l.includes("approved")) return "done";
  if (l.includes("block")) return "blocked";
  return "todo";
}

// POST { notion_page_id, pillar_id }
//   pillar_id null/empty -> unassign (delete row if exists)
//   row exists -> update pillar_id
//   row doesn't exist -> fetch from Notion and insert under pillar_id
export async function POST(req: NextRequest) {
  try {
    const { notion_page_id, pillar_id } = await req.json();
    if (!notion_page_id) {
      return NextResponse.json({ error: "notion_page_id required" }, { status: 400 });
    }
    const db = supabaseAdmin();

    const { data: existing } = await db
      .from("tasks")
      .select("id, pillar_id")
      .eq("notion_page_id", notion_page_id)
      .maybeSingle();

    const targetPillar = pillar_id || null;

    if (!targetPillar) {
      // Unassign
      if (existing) await db.from("tasks").delete().eq("id", existing.id);
      return NextResponse.json({ ok: true, action: "unassigned" });
    }

    if (existing) {
      const { error } = await db.from("tasks").update({ pillar_id: targetPillar }).eq("id", existing.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, action: "moved" });
    }

    const t = await fetchNotionTaskByPageId(notion_page_id);
    if (!t) return NextResponse.json({ error: "Task not found in Notion" }, { status: 404 });

    const tags: string[] = [];
    if (t.type) tags.push(t.type);
    if (t.status && t.status.toLowerCase().includes("approved")) tags.push("notion:approved");
    tags.push(`${SPRINT_TAG_PREFIX}${currentSprintIndex()}`);

    const row = {
      pillar_id: targetPillar,
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
  } catch (err: any) {
    console.error("assign error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
