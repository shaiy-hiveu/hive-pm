import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/members
// List all members. Includes their skills + repos as joined arrays.
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("rnd_members")
      .select(`
        *,
        rnd_member_skills (skill_id, level, notes),
        rnd_member_repos (repo_id, role, started_at, ended_at)
      `)
      .order("full_name");
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ items: [], error: msg }, { status: 500 });
  }
}

// POST /api/members
// Create a new member.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { handle, full_name, email, role, slack_user_id, photo_url, joined_at, notes, is_admin, notion_assignee_name } = body ?? {};
    if (!handle || !full_name || !email) {
      return NextResponse.json({ error: "handle, full_name, email required" }, { status: 400 });
    }
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("rnd_members")
      .insert({
        handle: String(handle).trim().replace(/^@/, ""),
        full_name: String(full_name).trim(),
        email: String(email).trim().toLowerCase(),
        role: role ?? null,
        slack_user_id: slack_user_id ?? null,
        photo_url: photo_url ?? null,
        joined_at: joined_at ?? null,
        notes: notes ?? null,
        is_admin: !!is_admin,
        notion_assignee_name: notion_assignee_name ? String(notion_assignee_name).trim() : null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, member: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
