import { NextRequest, NextResponse } from "next/server";
import { fetchNotionTasks } from "@/lib/notion";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const product = searchParams.get("product") ?? undefined;
    const sprint = searchParams.get("sprint") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const includeAssigned = searchParams.get("includeAssigned") === "true";

    const tasks = await fetchNotionTasks({ product, sprint, status });

    const filtered = product
      ? tasks.filter((t) =>
          t.product?.toLowerCase().includes(product.toLowerCase()) ||
          t.name?.toLowerCase().includes(product.toLowerCase())
        )
      : tasks;

    // Exclude tasks already linked to any pillar (unless caller asks otherwise)
    let result = filtered;
    if (!includeAssigned) {
      const db = supabaseAdmin();
      const { data: assigned } = await db
        .from("tasks")
        .select("notion_page_id")
        .not("notion_page_id", "is", null);
      const assignedIds = new Set((assigned ?? []).map(r => r.notion_page_id));
      result = filtered.filter(t => !assignedIds.has(t.id));
    }

    return NextResponse.json({ tasks: result });
  } catch (err: any) {
    console.error("Notion API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
