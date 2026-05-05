import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// PUT /api/member-skills
//   body: { member_id: string, skills: Array<{ skill_id: string, level: 0|1|2|3|4|5 }> }
//
// Replaces the full set of skills for a member. level=0 means "remove".
// This is the simplest semantics for the editor UI: send the whole list,
// the server figures out inserts/updates/deletes — and writes one row to
// rnd_member_events for every actual diff (added / removed / changed).
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { member_id, skills } = body ?? {};
    if (!member_id || !Array.isArray(skills)) {
      return NextResponse.json({ error: "member_id and skills[] required" }, { status: 400 });
    }
    const db = supabaseAdmin();

    // Snapshot current state to compute the diff. We don't trust the
    // client to tell us what's being added/changed/removed — only what
    // the new desired state is.
    const { data: existingRows } = await db
      .from("rnd_member_skills")
      .select("skill_id, level")
      .eq("member_id", member_id);
    const existing = new Map<string, number>();
    for (const r of existingRows ?? []) existing.set(r.skill_id as string, Number(r.level));

    const desiredKeep = skills.filter(s => Number.isFinite(s?.level) && s.level >= 1 && s.level <= 5);
    const desiredRemove = skills
      .filter(s => Number.isFinite(s?.level) && (s.level === 0 || s.level == null))
      .map(s => s.skill_id);

    if (desiredKeep.length > 0) {
      const rows = desiredKeep.map(s => ({
        member_id,
        skill_id: s.skill_id,
        level: Math.max(1, Math.min(5, Math.round(s.level))),
        notes: typeof s.notes === "string" ? s.notes : null,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await db
        .from("rnd_member_skills")
        .upsert(rows, { onConflict: "member_id,skill_id" });
      if (error) throw error;
    }

    if (desiredRemove.length > 0) {
      const { error } = await db
        .from("rnd_member_skills")
        .delete()
        .eq("member_id", member_id)
        .in("skill_id", desiredRemove);
      if (error) throw error;
    }

    // Build the events list — one row per actual state change.
    type Event = {
      member_id: string;
      event_type: "skill_added" | "skill_removed" | "skill_level_change";
      skill_id: string;
      level_before: number | null;
      level_after: number | null;
    };
    const events: Event[] = [];
    const desiredKeepMap = new Map<string, number>();
    for (const s of desiredKeep) desiredKeepMap.set(s.skill_id, Math.max(1, Math.min(5, Math.round(s.level))));

    for (const [skillId, newLevel] of desiredKeepMap.entries()) {
      const prev = existing.get(skillId);
      if (prev == null) {
        events.push({ member_id, event_type: "skill_added", skill_id: skillId, level_before: null, level_after: newLevel });
      } else if (prev !== newLevel) {
        events.push({ member_id, event_type: "skill_level_change", skill_id: skillId, level_before: prev, level_after: newLevel });
      }
    }
    for (const skillId of desiredRemove) {
      const prev = existing.get(skillId);
      if (prev != null) {
        events.push({ member_id, event_type: "skill_removed", skill_id: skillId, level_before: prev, level_after: null });
      }
    }

    if (events.length > 0) {
      const { error: evtErr } = await db.from("rnd_member_events").insert(events);
      // Non-fatal: if the events table doesn't exist yet, log and move on.
      if (evtErr) console.warn("rnd_member_events insert error:", evtErr.message);
    }

    return NextResponse.json({ ok: true, kept: desiredKeep.length, removed: desiredRemove.length, events: events.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
