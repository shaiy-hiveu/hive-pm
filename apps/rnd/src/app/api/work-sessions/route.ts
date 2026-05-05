import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// End-of-workday hour, Asia/Jerusalem.
const RESET_HOUR_IL = 19;

// Hard ceiling on session duration regardless of clock — catches forgotten
// clock-outs that somehow slip past the daily reset.
const MAX_OPEN_HOURS = 16;

// Returns the timestamp (UTC ISO) of the most-recent 19:00 Israel-time
// boundary. If we're already past 19:00 today IL, returns today's 19:00;
// otherwise returns yesterday's 19:00. Sessions started before this
// timestamp belong to a previous workday and should be closed; sessions
// started after it are "today" and stay open.
function lastWorkdayBoundaryIso(): string {
  const now = new Date();
  // IL date (YYYY-MM-DD) computed via Intl, free of DST headaches.
  const ilDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(now);
  // Determine IL UTC offset for this exact instant. We format the same
  // moment in two timezones and difference the parsed values — gives an
  // offset in ms whose sign is correct for "IL ahead of UTC".
  const sv = (tz: string) => now.toLocaleString("sv-SE", { timeZone: tz });
  const ilOffsetMs = new Date(sv("Asia/Jerusalem")).getTime() - new Date(sv("UTC")).getTime();
  // today RESET_HOUR_IL:00 IL, expressed as a UTC ISO string. Subtract
  // offset to convert wall-clock-19:00-in-IL to absolute UTC.
  let target = new Date(`${ilDate}T${String(RESET_HOUR_IL).padStart(2, "0")}:00:00Z`).getTime() - ilOffsetMs;
  if (now.getTime() < target) target -= 24 * 60 * 60 * 1000; // before 19:00 IL today → use yesterday
  return new Date(target).toISOString();
}

// Side-effect: closes open sessions that should no longer be "currently
// working". Returns nothing — callers re-query afterwards.
async function autoCloseStaleSessions(db: ReturnType<typeof supabaseAdmin>) {
  const nowIso = new Date().toISOString();
  // 1) Hard ceiling — anything older than MAX_OPEN_HOURS.
  const ceilingIso = new Date(Date.now() - MAX_OPEN_HOURS * 60 * 60 * 1000).toISOString();
  await db.from("rnd_work_sessions")
    .update({ ended_at: nowIso })
    .is("ended_at", null)
    .lt("started_at", ceilingIso);
  // 2) End-of-workday — close every session whose started_at predates the
  //    most-recent 19:00 IL boundary. Sessions started AFTER that boundary
  //    (legit late workers) survive until the next 19:00.
  const boundaryIso = lastWorkdayBoundaryIso();
  await db.from("rnd_work_sessions")
    .update({ ended_at: nowIso })
    .is("ended_at", null)
    .lt("started_at", boundaryIso);
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
