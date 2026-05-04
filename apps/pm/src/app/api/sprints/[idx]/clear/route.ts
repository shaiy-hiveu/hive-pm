import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { SPRINT_TAG_PREFIX, withSprintTag } from "@/lib/sprints";

// POST /api/sprints/[idx]/clear
// Removes every task's assignment to sprint <idx> by replacing the
// `sprint:<idx>` tag with `sprint:0` (the cleared sentinel). Cleared
// tasks no longer auto-fall back to the current sprint — they simply
// don't appear in any sprint until the user picks one explicitly.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ idx: string }> }) {
  try {
    const { idx } = await params;
    const sprintIdx = parseInt(idx, 10);
    if (!Number.isFinite(sprintIdx) || sprintIdx <= 0) {
      return NextResponse.json({ error: "invalid sprint index" }, { status: 400 });
    }

    const tagToClear = `${SPRINT_TAG_PREFIX}${sprintIdx}`;
    const db = supabaseAdmin();

    const { data: rows, error } = await db
      .from("tasks")
      .select("id, tags")
      .contains("tags", [tagToClear]);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ cleared: 0 });
    }

    let cleared = 0;
    for (const row of rows) {
      const currentTags: string[] = Array.isArray(row.tags) ? row.tags : [];
      const nextTags = withSprintTag(currentTags, 0);
      const { error: upErr } = await db.from("tasks").update({ tags: nextTags }).eq("id", row.id);
      if (!upErr) cleared++;
    }
    return NextResponse.json({ cleared });
  } catch (err: any) {
    console.error("clear sprint error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
