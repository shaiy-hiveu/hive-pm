import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { withProgressTag } from "@/lib/sprints";

// PATCH { progress: number | null }
//   number => override completion to N% (0..100). Only meaningful while the
//             task's status is "in_progress" — other statuses ignore it.
//   null   => clear the override (revert to status default).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { progress } = await req.json();
    const db = supabaseAdmin();

    const { data: row, error: readErr } = await db
      .from("tasks")
      .select("tags")
      .eq("id", id)
      .single();
    if (readErr) throw readErr;

    const currentTags: string[] = Array.isArray(row?.tags) ? row.tags : [];
    let pct: number | null = null;
    if (progress != null) {
      const n = Number(progress);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: "progress must be a number 0..100 or null" }, { status: 400 });
      }
      pct = n;
    }
    const nextTags = withProgressTag(currentTags, pct);

    const { error: upErr } = await db.from("tasks").update({ tags: nextTags }).eq("id", id);
    if (upErr) throw upErr;
    return NextResponse.json({ ok: true, tags: nextTags });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("set-progress error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
