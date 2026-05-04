import { NextResponse } from "next/server";
import { fetchNotionTasks } from "@/lib/notion";

// Returns slim maps keyed by notion_page_id:
//   map         -> notion_id (the human-readable #N)
//   priorities  -> priority label (Urgent / High / Medium / Low / null)
export async function GET() {
  try {
    const tasks = await fetchNotionTasks();
    const map: Record<string, number> = {};
    const priorities: Record<string, string> = {};
    for (const t of tasks) {
      if (t.notion_id != null) map[t.id] = t.notion_id;
      if (t.priority) priorities[t.id] = t.priority;
    }
    return NextResponse.json({ map, priorities });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
