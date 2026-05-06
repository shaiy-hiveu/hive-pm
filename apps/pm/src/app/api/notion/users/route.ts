import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// In-memory cache — workspace users don't change often, and the picker
// in the Hot tasks panel may open dozens of times per session. 5-minute
// TTL means add/rename of a teammate becomes visible quickly enough.
type NotionPerson = { id: string; name: string | null; email: string | null; avatar_url: string | null };
let cache: { ts: number; users: NotionPerson[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

// GET /api/notion/users — list workspace users that can be assigned.
// Filters out bots/integrations. Returned shape is intentionally minimal:
// just what the assignee picker needs to render and submit.
export async function GET() {
  try {
    if (cache && Date.now() - cache.ts < TTL_MS) {
      return NextResponse.json({ users: cache.users, cached: true });
    }
    const all: any[] = [];
    let cursor: string | undefined;
    // Defensive cap — Notion users.list paginates 100 at a time, and even
    // very large workspaces fit in 10 pages. Anything beyond is suspicious.
    for (let i = 0; i < 10; i++) {
      const res = await notion.users.list({ start_cursor: cursor, page_size: 100 });
      all.push(...res.results);
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }
    const users: NotionPerson[] = all
      .filter(u => u.type === "person")
      .map(u => ({
        id: u.id,
        name: u.name ?? null,
        email: u.person?.email ?? null,
        avatar_url: u.avatar_url ?? null,
      }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    cache = { ts: Date.now(), users };
    return NextResponse.json({ users });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ users: [], error: msg }, { status: 500 });
  }
}
