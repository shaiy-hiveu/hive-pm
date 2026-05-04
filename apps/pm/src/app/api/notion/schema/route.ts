import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_TASKS_DB_ID!;

export async function GET() {
  try {
    const db = await notion.databases.retrieve({ database_id: DATABASE_ID });
    const props = db.properties as any;

    // Return all property names and types for debugging
    const schema = Object.entries(props).map(([name, val]: [string, any]) => ({
      name,
      type: val.type,
      options:
        val.type === "select"
          ? val.select?.options?.map((o: any) => o.name)
          : val.type === "multi_select"
          ? val.multi_select?.options?.map((o: any) => o.name)
          : val.type === "status"
          ? val.status?.options?.map((o: any) => o.name)
          : undefined,
    }));

    return NextResponse.json({ schema });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
