import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// PATCH /api/notion/tasks/:pageId/assignees
// Body: { user_ids: string[] }
// Replaces the people in the Notion `Assigned to` (or `Assignee`) field
// with exactly the supplied list. Empty list clears the assignee.
//
// Different DBs in the workspace have used either property name; we
// prefer "Assigned to" and fall back to "Assignee" only when Notion
// rejects the first attempt with a property-not-found style error.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;
    if (!pageId) return NextResponse.json({ error: "pageId required" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const ids: unknown = body?.user_ids;
    if (!Array.isArray(ids) || ids.some(x => typeof x !== "string")) {
      return NextResponse.json({ error: "user_ids must be an array of Notion user UUIDs" }, { status: 400 });
    }
    const people = (ids as string[]).map(id => ({ id }));

    try {
      await notion.pages.update({
        page_id: pageId,
        properties: { "Assigned to": { people } as any },
      });
      return NextResponse.json({ ok: true, property: "Assigned to" });
    } catch (e1: unknown) {
      const m1 = e1 instanceof Error ? e1.message : String(e1);
      if (/property|Assigned to/i.test(m1)) {
        try {
          await notion.pages.update({
            page_id: pageId,
            properties: { Assignee: { people } as any },
          });
          return NextResponse.json({ ok: true, property: "Assignee" });
        } catch (e2: unknown) {
          const m2 = e2 instanceof Error ? e2.message : String(e2);
          return NextResponse.json({ error: `Notion update failed: ${m2}` }, { status: 500 });
        }
      }
      return NextResponse.json({ error: `Notion update failed: ${m1}` }, { status: 500 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
