import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchNotionTaskByPageId } from "@/lib/notion";
import { sendSlackDM } from "@/lib/slack";

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint, e.code ? `(code ${e.code})` : null].filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
    try { return JSON.stringify(err); } catch { /* noop */ }
  }
  return "unknown error";
}

// GET /api/acute-flags
// Returns the set of currently-flagged Notion page ids.
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("pm_acute_flags")
      .select("notion_page_id, flagged_at, flagged_by");
    if (error) {
      // Treat missing-table as empty — UI can still render.
      console.warn("pm_acute_flags read error:", error.message);
      return NextResponse.json({ ids: [], items: [] });
    }
    const items = data ?? [];
    return NextResponse.json({ ids: items.map(i => i.notion_page_id), items });
  } catch (err: unknown) {
    return NextResponse.json({ ids: [], items: [], error: describeError(err) }, { status: 500 });
  }
}

// POST /api/acute-flags  body: { notion_page_id, flagged_by? }
// Marks a task as acute. Idempotent. After the upsert succeeds we attempt
// (best-effort) to DM each Notion assignee on Slack with a heads-up that
// this task has been flagged as high-profile.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { notion_page_id, flagged_by } = body ?? {};
    if (!notion_page_id) {
      return NextResponse.json({ error: "notion_page_id required" }, { status: 400 });
    }
    const db = supabaseAdmin();
    // Detect first-time flagging vs re-toggling — only DM on the first flag
    // so toggling doesn't spam the assignee. We check before the upsert.
    const { data: existing } = await db
      .from("pm_acute_flags")
      .select("notion_page_id")
      .eq("notion_page_id", notion_page_id)
      .maybeSingle();
    const isFirstTime = !existing;

    const { error } = await db
      .from("pm_acute_flags")
      .upsert({
        notion_page_id,
        flagged_at: new Date().toISOString(),
        flagged_by: flagged_by ?? null,
      }, { onConflict: "notion_page_id" });
    if (error) throw error;

    let slack: { attempted: number; sent: number; failures: string[] } | null = null;
    if (isFirstTime) {
      slack = await notifyAssignees(notion_page_id, flagged_by ?? null).catch(err => {
        console.warn("acute-flag slack notify error:", err);
        return { attempted: 0, sent: 0, failures: [String(err?.message ?? err)] };
      });
    }
    return NextResponse.json({ ok: true, slack });
  } catch (err: unknown) {
    console.error("acute-flags POST error:", err);
    return NextResponse.json({ error: describeError(err) }, { status: 500 });
  }
}

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Look up each Notion assignee against rnd_members (matching on full_name
// or notion_assignee_name override) and DM them. Failures are recorded
// but never thrown — Slack should never break the flag write.
async function notifyAssignees(notionPageId: string, flaggedBy: string | null) {
  const result = { attempted: 0, sent: 0, failures: [] as string[] };
  const task = await fetchNotionTaskByPageId(notionPageId);
  if (!task) {
    result.failures.push("notion task not found");
    return result;
  }
  const names = (task.assignees && task.assignees.length > 0
    ? task.assignees
    : task.assignee
      ? [task.assignee]
      : []
  ).map(normalizeName).filter(Boolean);
  if (names.length === 0) {
    result.failures.push("no assignees on task");
    return result;
  }

  const db = supabaseAdmin();
  const { data: members, error } = await db
    .from("rnd_members")
    .select("id, full_name, notion_assignee_name, slack_user_id, active")
    .eq("active", true);
  if (error) {
    result.failures.push(`rnd_members query: ${error.message}`);
    return result;
  }

  const message = buildAcuteSlackMessage(task, flaggedBy);
  const sentTo = new Set<string>();
  for (const name of names) {
    const member = (members ?? []).find(m =>
      normalizeName(m.full_name) === name ||
      normalizeName(m.notion_assignee_name) === name
    );
    if (!member) {
      result.failures.push(`no rnd_members match for "${name}"`);
      continue;
    }
    if (!member.slack_user_id) {
      result.failures.push(`${member.full_name}: no slack_user_id`);
      continue;
    }
    if (sentTo.has(member.slack_user_id)) continue;
    sentTo.add(member.slack_user_id);
    result.attempted++;
    const r = await sendSlackDM(member.slack_user_id, message);
    if (r.ok) result.sent++;
    else result.failures.push(`${member.full_name}: ${r.reason}`);
  }
  return result;
}

function buildAcuteSlackMessage(task: { name: string; notion_id: number | null; page_url: string }, flaggedBy: string | null): string {
  const idStr = task.notion_id != null ? `#${task.notion_id} ` : "";
  const flagLine = flaggedBy ? `\nFlagged by: ${flaggedBy}` : "";
  return [
    `:rotating_light: *High-profile task — please communicate ongoing status.*`,
    `<${task.page_url}|${idStr}${task.name}>`,
    `This task has been marked *acute* in PM. Please reply here (or in the task) with current status, blockers, and ETA so the team can stay aligned.${flagLine}`,
  ].join("\n");
}

// DELETE /api/acute-flags?notion_page_id=...
// Clears the flag.
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const pageId = url.searchParams.get("notion_page_id");
    if (!pageId) {
      return NextResponse.json({ error: "notion_page_id required" }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { error } = await db.from("pm_acute_flags").delete().eq("notion_page_id", pageId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("acute-flags DELETE error:", err);
    return NextResponse.json({ error: describeError(err) }, { status: 500 });
  }
}
