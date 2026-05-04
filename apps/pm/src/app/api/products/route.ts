import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from("products").select("*").order("name");
    if (error) throw error;
    return NextResponse.json({ products: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, icon, area, description } = body;
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const db = supabaseAdmin();
    const { data, error } = await db
      .from("products")
      .upsert({ name, icon: icon ?? "📦", area: area ?? "core", description: description ?? null, status: "active" }, { onConflict: "name" })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ product: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const db = supabaseAdmin();
    await db.from("products").delete().eq("name", name);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
