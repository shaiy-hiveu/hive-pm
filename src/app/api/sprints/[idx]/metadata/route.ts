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
    let goals: { text: string; completion: number }[] | undefined;
    if (Array.isArray(body.goals)) {
      goals = body.goals
        .map((g: unknown) => {
          const obj = g as { text?: unknown; completion?: unknown };
          const text = typeof obj?.text === "string" ? obj.text.trim() : "";
          const completion = Number(obj?.completion);
          if (!text) return null;
          if (!Number.isFinite(completion)) return null;
          return { text, completion: Math.max(0, Math.min(100, Math.round(completion))) };
        })
        .filter((g: { text: string; completion: number } | null): g is { text: string; completion: number } => g !== null);
    }

    const db = supabaseAdmin();
    const row: Record<string, unknown> = { sprint_index: sprintIdx, updated_at: new Date().toISOString() };
    if (name !== undefined) row.name = name;
    if (comment !== undefined) row.comment = comment;
    if (goals !== undefined) row.goals = goals;

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
