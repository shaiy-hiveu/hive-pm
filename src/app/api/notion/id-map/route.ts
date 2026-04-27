import { NextResponse } from "next/server";
import { fetchNotionTasks } from "@/lib/notion";

// Returns a slim map: notion_page_id -> notion_id (the human-readable #N)
export async function GET() {
  try {
    const tasks = await fetchNotionTasks();
    const map: Record<string, number> = {};
    for (const t of tasks) {
      if (t.notion_id != null) map[t.id] = t.notion_id;
    }
    return NextResponse.json({ map });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
