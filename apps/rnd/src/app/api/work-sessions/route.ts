import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Daily reset hour (Asia/Jerusalem). Anyone visiting the work-sessions
// endpoint at or after this hour triggers a global close of every open
// session — i.e. "the workday is over". Folks who genuinely work past
// 19:00 should accept that the next visit collapses everyone, including
// themselves. Tomorrow they clock in fresh.
const RESET_HOUR_IL = 19;

// Hard ceiling on session duration. If nobody visits after 19:00 (so the
// soft reset never fires), sessions older than this threshold get closed
// the next morning — keeps stale "still working since yesterday" rows out
// of the team view.
const MAX_OPEN_HOURS = 16;

function israelHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
    10
  );
}

// One-minute grace so a brand-new clock-in (POST then immediate GET)
// survives the same-request auto-close — relevant when the user clocks in
// after 19:00 Israel time.
const GRACE_MS = 60 * 1000;

// Side-effect: closes open sessions that should no longer be "currently
// working". Returns nothing — callers re-query afterwards.
async function autoCloseStaleSessions(db: ReturnType<typeof supabaseAdmin>) {
  const nowIso = new Date().toISOString();
  // 1) Anything older than MAX_OPEN_HOURS — forgotten clock-outs.
  const ceilingIso = new Date(Date.now() - MAX_OPEN_HOURS * 60 * 60 * 1000).toISOString();
  await db.from("rnd_work_sessions")
    .update({ ended_at: nowIso })
    .is("ended_at", null)
    .lt("started_at", ceilingIso);
  // 2) After 19:00 Israel time → close every open session older than the
  //    grace period. Sessions started in the last GRACE_MS stay open so
  //    intentional late clock-ins register at least briefly.
  if (israelHour() >= RESET_HOUR_IL) {
    const graceCutoffIso = new Date(Date.now() - GRACE_MS).toISOString();
    await db.from("rnd_work_sessions")
      .update({ ended_at: nowIso })
      .is("ended_at", null)
      .lt("started_at", graceCutoffIso);
  }
}

// GET /api/work-sessions
// Closes stale sessions first, then returns the current state.
// Response: { byMember: { [member_id]: { active, started_at, ended_at } } }
export async function GET() {
  try {
    const db = supabaseAdmin();
    await autoCloseStaleSessions(db);

    const since = new Date();
    since.setHours(since.getHours() - 24);
    const { data, error } = await db
      .from("rnd_work_sessions")
      .select("id, member_id, started_at, ended_at")
      .gte("started_at", since.toISOString())
      .order("started_at", { ascending: false });
    if (error) throw error;

    const byMember: Record<string, {
      active: boolean;
      session_id: string | null;
      started_at: string | null;
      ended_at: string | null;
    }> = {};
    for (const row of data ?? []) {
      if (byMember[row.member_id]) continue;
      byMember[row.member_id] = {
        active: row.ended_at == null,
        session_id: row.id,
        started_at: row.started_at,
        ended_at: row.ended_at,
      };
    }
    return NextResponse.json({ byMember, autoEndHour: RESET_HOUR_IL });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ byMember: {}, error: msg }, { status: 500 });
  }
}

// POST /api/work-sessions  body: { member_id }
// Clocks the member in. Closes any prior open session first so we don't
// build up duplicates from forgotten clock-outs.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { member_id } = body ?? {};
    if (!member_id) return NextResponse.json({ error: "member_id required" }, { status: 400 });
    const db = supabaseAdmin();
    await db.from("rnd_work_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("member_id", member_id)
      .is("ended_at", null);
    const { data, error } = await db
      .from("rnd_work_sessions")
      .insert({ member_id })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, session: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/work-sessions  body: { member_id }
// Clocks the member out (closes the open session for the member).
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { member_id } = body ?? {};
    if (!member_id) return NextResponse.json({ error: "member_id required" }, { status: 400 });
    const db = supabaseAdmin();
    const { error } = await db
      .from("rnd_work_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("member_id", member_id)
      .is("ended_at", null);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
