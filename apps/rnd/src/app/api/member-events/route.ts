import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/member-events?member_id=...&limit=200
// Returns events newest-first with skill / repo names joined for display.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const memberId = url.searchParams.get("member_id");
    if (!memberId) return NextResponse.json({ error: "member_id required" }, { status: 400 });
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "200", 10) || 200));
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("rnd_member_events")
      .select(`
        id, event_type, level_before, level_after, occurred_at, source,
        skill:rnd_skills (id, name),
        repo:rnd_repos (id, name, slug, color)
      `)
      .eq("member_id", memberId)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("member-events read error:", error.message);
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ items: [], error: msg }, { status: 500 });
  }
}
