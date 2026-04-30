import { supabaseAdmin } from "@/lib/supabase";
import GanttChart from "@/components/gantt/GanttChart";
import NotionTasksSummary from "@/components/gantt/NotionTasksSummary";
import { syncNotionStatus } from "@/lib/sync-notion-status";

export const dynamic = "force-dynamic";

export default async function GanttPage() {
  // Refresh status / approved-tag / due_date from Notion before rendering
  // so the chart reflects the latest reality, not a stale import snapshot.
  try { await syncNotionStatus(); } catch { /* render with whatever's in DB */ }

  const db = supabaseAdmin();
  const { data: pillars } = await db
    .from("pillars")
    .select(`*, tasks (*)`)
    .order("order_index");

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4">
      <div>
        <p className="text-xs font-semibold tracking-widest text-indigo-500 mb-1">HIVE · תכנון ספרינטים</p>
        <h1 className="text-3xl font-bold text-gray-900">Gantt</h1>
      </div>
      <GanttChart pillars={pillars ?? []} />
      <NotionTasksSummary pillars={pillars ?? []} />
    </div>
  );
}
