import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// PUT /api/member-repos
//   body: { member_id: string, repos: Array<{ repo_id: string, role?: string,
//                                              started_at?: string, ended_at?: string,
//                                              keep: boolean }> }
// Adds/updates entries where keep=true; removes entries where keep=false.
// Writes rnd_member_events rows for every actual diff (added / removed).
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { member_id, repos } = body ?? {};
    if (!member_id || !Array.isArray(repos)) {
      return NextResponse.json({ error: "member_id and repos[] required" }, { status: 400 });
    }
    const db = supabaseAdmin();

    // Snapshot current repo membership to compute the diff.
    const { data: existingRows } = await db
      .from("rnd_member_repos")
      .select("repo_id")
      .eq("member_id", member_id);
    const existing = new Set<string>((existingRows ?? []).map(r => r.repo_id as string));

    const upserts = repos
      .filter(r => r?.keep)
      .map(r => ({
        member_id,
        repo_id: r.repo_id,
        role: r.role ?? null,
        started_at: r.started_at ?? null,
        ended_at: r.ended_at ?? null,
      }));
    const removes = repos.filter(r => !r?.keep).map(r => r.repo_id);

    if (upserts.length > 0) {
      const { error } = await db
        .from("rnd_member_repos")
        .upsert(upserts, { onConflict: "member_id,repo_id" });
      if (error) throw error;
    }
    if (removes.length > 0) {
      const { error } = await db
        .from("rnd_member_repos")
        .delete()
        .eq("member_id", member_id)
        .in("repo_id", removes);
      if (error) throw error;
    }

    type Event = {
      member_id: string;
      event_type: "repo_added" | "repo_removed";
      repo_id: string;
    };
    const events: Event[] = [];
    for (const u of upserts) {
      if (!existing.has(u.repo_id)) events.push({ member_id, event_type: "repo_added", repo_id: u.repo_id });
    }
    for (const repoId of removes) {
      if (existing.has(repoId)) events.push({ member_id, event_type: "repo_removed", repo_id: repoId });
    }
    if (events.length > 0) {
      const { error: evtErr } = await db.from("rnd_member_events").insert(events);
      if (evtErr) console.warn("rnd_member_events insert error:", evtErr.message);
    }

    return NextResponse.json({ ok: true, events: events.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
