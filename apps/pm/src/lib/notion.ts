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
  if (prop.type === "rollup" && prop.rollup?.type === "number") return prop.rollup.number ?? null;
  // Title/rich_text fallback — sometimes the visible "#NN" lives in a text
  // property rather than a structured number, especially after schema
  // edits. Pull the first integer out of the text if there is one.
  if (prop.type === "title" || prop.type === "rich_text") {
    const text = (prop[prop.type] ?? []).map((t: { plain_text?: string }) => t.plain_text ?? "").join("");
    const match = text.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return prop.number ?? null;
}

// Resolves the Notion auto-id even when the property has been renamed.
// Tries the most-common labels first, then any property whose type is
// `unique_id`, then any number-shaped property — in that order.
function resolveNotionId(props: Record<string, any>): number | null {
  const candidates = ["ID", "Id", "id", "Task ID", "TaskID", "#", "Number", "No"];
  for (const key of candidates) {
    const v = extractNumber(props[key]);
    if (v != null) return v;
  }
  for (const v of Object.values(props ?? {})) {
    const p = v as { type?: string };
    if (p?.type === "unique_id") {
      const n = extractNumber(p);
      if (n != null) return n;
    }
  }
  return null;
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

  // Paginate through the entire Notion DB (cap at ~2000 to stay safe).
  // Sort by the "ID" property when available; fall back to no sort if the
  // property is renamed/missing in this DB — Notion returns 400 otherwise
  // and the entire task picker / Working-on column lights up empty.
  const MAX_PAGES = 20;
  const PAGE_SIZE = 100;
  const results: any[] = [];
  let cursor: string | undefined;
  let useIdSort = true;
  for (let i = 0; i < MAX_PAGES; i++) {
    let response;
    try {
      response = await notion.databases.query({
        database_id: DATABASE_ID,
        filter: filters.length > 0 ? { and: filters } : undefined,
        page_size: PAGE_SIZE,
        start_cursor: cursor,
        sorts: useIdSort ? [{ property: "ID", direction: "descending" }] : undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (useIdSort && /sort property|sort_property|"ID"/i.test(msg)) {
        useIdSort = false;
        i--; // retry this page without the offending sort
        continue;
      }
      throw err;
    }
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
    notion_id: resolveNotionId(props),
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
  // Query to find the most recent sprint name from tasks. Falls back to
  // an unsorted query if the "ID" property isn't sortable in this DB.
  const opts: Parameters<typeof notion.databases.query>[0] = {
    database_id: DATABASE_ID,
    page_size: 1,
    sorts: [{ property: "ID", direction: "descending" }],
  };
  let response;
  try {
    response = await notion.databases.query(opts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/sort property|sort_property|"ID"/i.test(msg)) {
      response = await notion.databases.query({ ...opts, sorts: undefined });
    } else {
      throw err;
    }
  }
  const first = response.results[0] as any;
  if (!first) return null;
  return extractSelect(first.properties["Sprint"]);
}
