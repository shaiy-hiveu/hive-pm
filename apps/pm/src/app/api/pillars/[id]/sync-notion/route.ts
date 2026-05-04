import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchNotionTasks } from "@/lib/notion";
import { currentSprintIndex, SPRINT_TAG_PREFIX } from "@/lib/sprints";

// Sync Notion tasks into a pillar
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { notionTaskIds } = await req.json(); // array of notion page IDs to link

    const db = supabaseAdmin();

    // Fetch all Notion tasks and narrow to the selected IDs
    const allTasks = await fetchNotionTasks();
    const selected = allTasks.filter(t => notionTaskIds.includes(t.id));
    if (selected.length === 0) {
      return NextResponse.json({ tasks: [], count: 0 });
    }

    // Skip any Notion page that is already linked somewhere
    const { data: existing } = await db
      .from("tasks")
      .select("notion_page_id")
      .in("notion_page_id", selected.map(t => t.id));
    const existingIds = new Set((existing ?? []).map(r => r.notion_page_id));
    const sprintIdx = currentSprintIndex();
    const toInsert = selected
      .filter(t => !existingIds.has(t.id))
      .map(t => {
        const tags: string[] = [];
        if (t.type) tags.push(t.type);
        if (t.status && t.status.toLowerCase().includes("approved")) tags.push("notion:approved");
        tags.push(`${SPRINT_TAG_PREFIX}${sprintIdx}`);
        return {
          pillar_id: id,
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
      });

    if (toInsert.length === 0) {
      return NextResponse.json({ tasks: [], count: 0 });
    }

    const { data, error } = await db.from("tasks").insert(toInsert).select();
    if (error) throw error;
    return NextResponse.json({ tasks: data, count: data?.length ?? 0 });
  } catch (err: any) {
    console.error("sync-notion error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function mapStatus(s: string | null): "todo" | "in_progress" | "done" | "blocked" {
  if (!s) return "todo";
  const l = s.toLowerCase();
  if (l.includes("progress") || l.includes("working")) return "in_progress";
  if (l.includes("done") || l.includes("complete") || l.includes("approved")) return "done";
  if (l.includes("block")) return "blocked";
  return "todo";
}
