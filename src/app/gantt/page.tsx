import { supabaseAdmin } from "@/lib/supabase";
import GanttChart from "@/components/gantt/GanttChart";
import NotionTasksSummary from "@/components/gantt/NotionTasksSummary";
import NewlyDoneDigest from "@/components/gantt/NewlyDoneDigest";
import RefreshDataButton from "@/components/RefreshDataButton";

export const dynamic = "force-dynamic";

export default async function GanttPage() {
  const db = supabaseAdmin();
  const [{ data: pillars }, { data: orphanTasks }] = await Promise.all([
    db.from("pillars").select(`*, tasks (*)`).order("order_index"),
    // Tasks pinned to a sprint without belonging to any pillar — these
    // populate the synthetic Others row in the gantt. is.null is the
    // PostgREST filter for IS NULL.
    db.from("tasks").select("*").is("pillar_id", null),
  ]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-500 mb-1">HIVE · תכנון ספרינטים</p>
          <h1 className="text-3xl font-bold text-gray-900">Gantt</h1>
        </div>
        <RefreshDataButton />
      </div>
      <GanttChart pillars={pillars ?? []} orphanTasks={orphanTasks ?? []} />
      <NewlyDoneDigest />
      <NotionTasksSummary pillars={pillars ?? []} />
    </div>
  );
}
