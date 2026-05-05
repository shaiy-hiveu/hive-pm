import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// PATCH /api/members/[id] — partial update
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = [
      "handle", "full_name", "email", "role", "slack_user_id",
      "photo_url", "active", "is_admin", "joined_at", "notes",
      "notion_assignee_name",
    ] as const;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (k in body) patch[k] = body[k];
    }
    if (typeof patch.handle === "string") patch.handle = patch.handle.trim().replace(/^@/, "");
    if (typeof patch.email === "string") patch.email = patch.email.trim().toLowerCase();

    const db = supabaseAdmin();
    const { error } = await db.from("rnd_members").update(patch).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/members/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = supabaseAdmin();
    const { error } = await db.from("rnd_members").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
