import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// PATCH /api/sprints/[idx]/metadata
//   body: { name?: string | null, comment?: string | null }
// Upserts the row keyed by sprint_index. Pass null to clear a field.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ idx: string }> }) {
  try {
    const { idx } = await params;
    const sprintIdx = parseInt(idx, 10);
    if (!Number.isFinite(sprintIdx) || sprintIdx <= 0) {
      return NextResponse.json({ error: "invalid sprint index" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const name = body.name === undefined ? undefined : (body.name === null || body.name === "" ? null : String(body.name).trim());
    const comment = body.comment === undefined ? undefined : (body.comment === null || body.comment === "" ? null : String(body.comment).trim());

    const db = supabaseAdmin();
    const row: Record<string, unknown> = { sprint_index: sprintIdx, updated_at: new Date().toISOString() };
    if (name !== undefined) row.name = name;
    if (comment !== undefined) row.comment = comment;

    const { error } = await db
      .from("sprint_metadata")
      .upsert(row, { onConflict: "sprint_index" });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("sprint metadata patch error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
