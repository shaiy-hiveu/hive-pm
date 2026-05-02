import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export type SprintGoal = { text: string; completion: number };

export type SprintMetadataRow = {
  sprint_index: number;
  name: string | null;
  comment: string | null;
  goals: SprintGoal[];
};

// GET /api/sprints/metadata
// Returns the full set of sprint metadata rows. Falls back to an empty list
// if the table doesn't exist yet (cold install) so the UI keeps working.
export async function GET() {
  try {
    const db = supabaseAdmin();
    // select("*") tolerates older schemas missing the `goals` column.
    const { data, error } = await db
      .from("sprint_metadata")
      .select("*");
    if (error) {
      // Table-missing is the most likely cause on a fresh DB. Treat any error
      // here as "no metadata" so the chart still renders.
      console.warn("sprint_metadata read error:", error.message);
      return NextResponse.json({ items: [] as SprintMetadataRow[] });
    }
    const items: SprintMetadataRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
      sprint_index: Number(r.sprint_index),
      name: (r.name as string | null) ?? null,
      comment: (r.comment as string | null) ?? null,
      goals: Array.isArray(r.goals) ? (r.goals as SprintGoal[]) : [],
    }));
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ items: [], error: msg });
  }
}
