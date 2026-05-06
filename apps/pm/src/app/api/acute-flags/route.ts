import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
// Marks a task as acute. Idempotent.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { notion_page_id, flagged_by } = body ?? {};
    if (!notion_page_id) {
      return NextResponse.json({ error: "notion_page_id required" }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { error } = await db
      .from("pm_acute_flags")
      .upsert({
        notion_page_id,
        flagged_at: new Date().toISOString(),
        flagged_by: flagged_by ?? null,
      }, { onConflict: "notion_page_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("acute-flags POST error:", err);
    return NextResponse.json({ error: describeError(err) }, { status: 500 });
  }
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
