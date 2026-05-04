import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET all pillars with their sections + task counts
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data: pillars, error } = await db
      .from("pillars")
      .select(`
        *,
        tasks (*)
      `)
      .order("order_index");

    if (error) throw error;
    return NextResponse.json({ pillars });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST create pillar
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = supabaseAdmin();
    const { data, error } = await db.from("pillars").insert(body).select().single();
    if (error) throw error;
    return NextResponse.json({ pillar: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
