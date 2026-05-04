import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { currentSprintIndex, SPRINT_TAG_PREFIX } from "@/lib/sprints";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("tasks")
      .select("*")
      .eq("pillar_id", id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ tasks: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = supabaseAdmin();
    const incomingTags: string[] = Array.isArray(body.tags) ? body.tags : [];
    const tags = [...incomingTags, `${SPRINT_TAG_PREFIX}${currentSprintIndex()}`];
    const { data, error } = await db
      .from("tasks")
      .insert({ ...body, tags, pillar_id: id, source: "manual" })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ task: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
