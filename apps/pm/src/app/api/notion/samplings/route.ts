import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type DoneSnapshot = {
  notion_page_id: string;
  notion_id: number | null;
  name: string;
  assignee: string | null;
  status: string | null;
  product: string | null;
};

export type SamplingItem = {
  id: string;
  sampled_at: string;
  previous_sampled_at: string | null;
  newly_done: DoneSnapshot[];
  total_done: number;
};

// GET /api/notion/samplings?limit=50
// Returns the most recent samplings (newest first). For each sampling,
// `newly_done` is the set of tasks that are Done in this sampling but were
// NOT in the chronologically-previous sampling — i.e., the batch that
// flipped to Done between the two refreshes. The very oldest sampling
// (the bottom of the list) returns its full done_tasks as newly_done.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("notion_samplings")
      .select("id, sampled_at, done_tasks")
      .order("sampled_at", { ascending: false })
      .limit(limit);
    if (error) {
      // Table-missing on a fresh DB is non-fatal — just return an empty list
      // so the UI keeps rendering without errors.
      console.warn("notion_samplings read error:", error.message);
      return NextResponse.json({ items: [] as SamplingItem[] });
    }

    const rows = (data ?? []) as Array<{ id: string; sampled_at: string; done_tasks: DoneSnapshot[] | null }>;

    // We need one extra older sampling beyond the limit to compute newly_done
    // for the oldest sampling in the page. `null` means no older sampling
    // exists in the entire DB — this is the absolute first sampling, which
    // we treat as a baseline (newly_done = []) instead of "everything".
    let olderDoneIds: Set<string> | null = null;
    if (rows.length > 0) {
      const oldestSampledAt = rows[rows.length - 1].sampled_at;
      const { data: prev } = await db
        .from("notion_samplings")
        .select("done_tasks")
        .lt("sampled_at", oldestSampledAt)
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prev) {
        const prevDone = (prev.done_tasks ?? []) as DoneSnapshot[];
        olderDoneIds = new Set(prevDone.map(t => t.notion_page_id));
      }
    }

    const items: SamplingItem[] = rows.map((current, i) => {
      const next = rows[i + 1]; // chronologically older within this page
      const currentDone = (current.done_tasks ?? []) as DoneSnapshot[];
      let newlyDone: DoneSnapshot[];
      if (next) {
        const previousIds = new Set((next.done_tasks ?? []).map(t => t.notion_page_id));
        newlyDone = currentDone.filter(t => !previousIds.has(t.notion_page_id));
      } else if (olderDoneIds) {
        const previousIds = olderDoneIds;
        newlyDone = currentDone.filter(t => !previousIds.has(t.notion_page_id));
      } else {
        // Absolute first sampling ever — baseline, no "newly done" by
        // definition. Avoids the cold-start "everything is new" bias.
        newlyDone = [];
      }
      return {
        id: current.id,
        sampled_at: current.sampled_at,
        previous_sampled_at: next?.sampled_at ?? null,
        newly_done: newlyDone,
        total_done: currentDone.length,
      };
    });

    return NextResponse.json({ items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ items: [], error: msg });
  }
}
