import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withSprintTag, SPRINT_TAG_PREFIX } from "@/lib/sprints";

// PATCH { sprintIndex: number | null }
//   number => set/replace the sprint:N tag
//   null   => clear sprint assignment (task falls back to current sprint)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { sprintIndex } = await req.json();
    const db = supabaseAdmin();

    const { data: row, error: readErr } = await db
      .from("tasks")
      .select("tags")
      .eq("id", id)
      .single();
    if (readErr) throw readErr;

    const currentTags: string[] = Array.isArray(row?.tags) ? row.tags : [];
    let nextTags: string[];
    if (sprintIndex == null) {
      nextTags = currentTags.filter(t => !t.startsWith(SPRINT_TAG_PREFIX));
    } else {
      const n = Number(sprintIndex);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: "sprintIndex must be a positive integer" }, { status: 400 });
      }
      nextTags = withSprintTag(currentTags, n);
    }

    const { error: upErr } = await db.from("tasks").update({ tags: nextTags }).eq("id", id);
    if (upErr) throw upErr;
    return NextResponse.json({ ok: true, tags: nextTags });
  } catch (err: any) {
    console.error("set-sprint error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
