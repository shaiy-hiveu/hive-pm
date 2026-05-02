import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export type SprintMetadataRow = {
  sprint_index: number;
  name: string | null;
  comment: string | null;
};

// GET /api/sprints/metadata
// Returns the full set of sprint metadata rows. Falls back to an empty list
// if the table doesn't exist yet (cold install) so the UI keeps working.
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("sprint_metadata")
      .select("sprint_index, name, comment");
    if (error) {
      // Table-missing is the most likely cause on a fresh DB. Treat any error
      // here as "no metadata" so the chart still renders.
      console.warn("sprint_metadata read error:", error.message);
      return NextResponse.json({ items: [] satisfies SprintMetadataRow[] });
    }
    return NextResponse.json({ items: (data ?? []) as SprintMetadataRow[] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ items: [], error: msg });
  }
}
