import { Client } from "@notionhq/client";
import { NotionTask } from "@/types";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_TASKS_DB_ID!;

function extractText(prop: any): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.map((t: any) => t.plain_text).join("") ?? "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
  return "";
}

function extractSelect(prop: any): string | null {
  return prop?.select?.name ?? prop?.status?.name ?? null;
}

function extractMultiSelect(prop: any): string[] {
  return prop?.multi_select?.map((s: any) => s.name) ?? [];
}

function extractNumber(prop: any): number | null {
  if (!prop) return null;
  if (prop.type === "unique_id") return prop.unique_id?.number ?? null;
  if (prop.type === "formula" && prop.formula?.type === "number") return prop.formula.number ?? null;
  return prop.number ?? null;
}

function extractDate(prop: any): string | null {
  return prop?.date?.start ?? null;
}

function extractPeople(prop: any): string | null {
  const people = prop?.people ?? [];
  return people.length > 0 ? people[0].name : null;
}

export async function fetchNotionTasks(filter?: {
  product?: string;
  sprint?: string;
  status?: string;
}): Promise<NotionTask[]> {
  const filters: any[] = [];

  if (filter?.status) {
    filters.push({ property: "Status", status: { equals: filter.status } });
  }
  if (filter?.sprint) {
    filters.push({ property: "Sprint", select: { equals: filter.sprint } });
  }

  // Paginate through the entire Notion DB (cap at ~2000 to stay safe)
  const MAX_PAGES = 20;
  const PAGE_SIZE = 100;
  const results: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: filters.length > 0 ? { and: filters } : undefined,
      page_size: PAGE_SIZE,
      start_cursor: cursor,
      sorts: [{ property: "ID", direction: "descending" }],
    });
    results.push(...response.results);
    if (!response.has_more || !response.next_cursor) break;
    cursor = response.next_cursor;
  }

  return results
    .filter((page: any) => page.object === "page")
    .map(mapPageToTask);
}

export function mapPageToTask(page: any): NotionTask {
  const props = page.properties;
  return {
    id: page.id,
    page_url: page.url,
    notion_id: extractNumber(props["ID"]),
    name: extractText(props["Name"]),
    status: extractSelect(props["Status"]),
    priority: extractSelect(props["Priority"]),
    product: extractMultiSelect(props["product"])?.[0] ?? extractSelect(props["product"]) ?? null,
    area: extractSelect(props["Area"]),
    sprint: extractNumber(props["Sprint"]) ? `Sprint ${extractNumber(props["Sprint"])}` : null,
    assignee: extractPeople(props["Assigned to"]) ?? extractPeople(props["Assignee"]),
    due_date: extractDate(props["Due date"]) ?? extractDate(props["Due Date"]) ?? extractDate(props["Due"]),
    type: extractSelect(props["Bug/Feature"])?.toLowerCase() as NotionTask["type"] ?? extractSelect(props["Type"])?.toLowerCase() as NotionTask["type"] ?? null,
    tags: extractMultiSelect(props["Tags"]),
    created_at: (page as any).created_time ?? null,
  };
}

export async function fetchNotionTaskByPageId(pageId: string): Promise<NotionTask | null> {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId });
    return mapPageToTask(page);
  } catch {
    return null;
  }
}

export async function fetchCurrentSprint(): Promise<string | null> {
  // Query to find the most recent sprint name from tasks
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
    page_size: 1,
    sorts: [{ property: "ID", direction: "descending" }],
  });
  const first = response.results[0] as any;
  if (!first) return null;
  return extractSelect(first.properties["Sprint"]);
}
