import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_TASKS_DB_ID!;

export async function GET() {
  try {
    // Fetch the database schema to get all select options for Product field
    const db = await notion.databases.retrieve({ database_id: DATABASE_ID });
    const props = db.properties as any;

    // Try common field names for product
    const productProp =
      props["Product"] ?? props["product"] ?? props["Products"] ?? null;

    let products: string[] = [];

    if (productProp?.type === "select") {
      products = productProp.select.options.map((o: any) => o.name);
    } else if (productProp?.type === "multi_select") {
      products = productProp.multi_select.options.map((o: any) => o.name);
    }

    // Also grab Project field if exists
    const projectProp = props["Project"] ?? props["project"] ?? null;
    let projects: string[] = [];
    if (projectProp?.type === "select") {
      projects = projectProp.select.options.map((o: any) => o.name);
    } else if (projectProp?.type === "multi_select") {
      projects = projectProp.multi_select.options.map((o: any) => o.name);
    }

    return NextResponse.json({
      products: products.filter(Boolean),
      projects: projects.filter(Boolean),
    });
  } catch (err: any) {
    console.error("Notion products error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
