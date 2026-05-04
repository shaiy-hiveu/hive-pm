import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const { taskId } = await params;
    const body = await req.json();
    const db = supabaseAdmin();
    const { data, error } = await db.from("tasks").update(body).eq("id", taskId).select().single();
    if (error) throw error;
    return NextResponse.json({ task: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    const { taskId } = await params;
    const db = supabaseAdmin();
    await db.from("tasks").delete().eq("id", taskId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
