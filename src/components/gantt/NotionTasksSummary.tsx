"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Flame, Rocket, Loader2 } from "lucide-react";
import clsx from "clsx";

type NotionTask = {
  id: string;
  page_url: string;
  notion_id: number | null;
  name: string;
  status: string | null;
  priority: string | null;
  product: string | null;
  type: string | null;
  sprint: string | null;
};

type DbTask = {
  id: string;
  notion_page_id?: string | null;
  pillar_id?: string | null;
};

type Pillar = {
  id: string;
  name: string;
  color?: string;
  tasks?: DbTask[];
};

type Props = {
  pillars: Pillar[];
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-rose-100 text-rose-700 border-rose-200",
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-sky-100 text-sky-700 border-sky-200",
};

const STATUS_STYLE: Record<string, string> = {
  "to-do": "bg-gray-100 text-gray-600 border-gray-200",
  "todo": "bg-gray-100 text-gray-600 border-gray-200",
  "not started": "bg-slate-100 text-slate-600 border-slate-200",
  "in progress": "bg-blue-100 text-blue-700 border-blue-200",
  "blocked": "bg-red-100 text-red-700 border-red-200",
  "done": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "complete": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "approved": "bg-violet-100 text-violet-700 border-violet-200",
};

type HotScope = "urgent" | "urgent_high";

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function isActiveStatus(s: string | null): boolean {
  const v = (s ?? "").toLowerCase();
  return v === "not started" || v === "in progress" || v === "to-do" || v === "todo";
}

function isHotTask(t: NotionTask, scope: HotScope): boolean {
  const p = (t.priority ?? "").toLowerCase();
  const priorityHit = scope === "urgent" ? p === "urgent" : p === "urgent" || p === "high";
  return priorityHit && isActiveStatus(t.status);
}

function sortByPriority(a: NotionTask, b: NotionTask): number {
  const pa = PRIORITY_ORDER[(a.priority ?? "").toLowerCase()] ?? 99;
  const pb = PRIORITY_ORDER[(b.priority ?? "").toLowerCase()] ?? 99;
  return pa - pb;
}

function isProductionTask(t: NotionTask): boolean {
  return (t.type ?? "").toLowerCase() === "production";
}

export default function NotionTasksSummary({ pillars }: Props) {
  const [tasks, setTasks] = useState<NotionTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hotScope, setHotScope] = useState<HotScope>("urgent_high");

  // Build map: notion_page_id -> pillar
  const pillarByPageId = useMemo(() => {
    const map = new Map<string, Pillar>();
    for (const p of pillars) {
      for (const t of p.tasks ?? []) {
        if (t.notion_page_id) map.set(t.notion_page_id, p);
      }
    }
    return map;
  }, [pillars]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notion/tasks?includeAssigned=true")
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setTasks(data.tasks ?? []);
      })
      .catch(err => { if (!cancelled) setError(String(err?.message ?? err)); });
    return () => { cancelled = true; };
  }, []);

  const hot = useMemo(
    () => (tasks ?? []).filter(t => isHotTask(t, hotScope)).sort(sortByPriority),
    [tasks, hotScope]
  );
  const production = useMemo(
    () => (tasks ?? []).filter(isProductionTask).sort(sortByPriority),
    [tasks]
  );

  return (
    <div className="space-y-4">
      <DigestPanel
        title="משימות חמות"
        subtitle={hotScope === "urgent" ? "Urgent · Not Started · In Progress" : "Urgent + High · Not Started · In Progress"}
        icon={<Flame size={16} className="text-rose-500" />}
        tasks={hot}
        loading={tasks === null}
        error={error}
        pillarByPageId={pillarByPageId}
        toolbar={
          <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5"
            onClick={e => e.stopPropagation()}>
            {([
              { key: "urgent", label: "Urgent" },
              { key: "urgent_high", label: "Urgent + High" },
            ] as const).map(opt => (
              <button key={opt.key}
                onClick={() => setHotScope(opt.key)}
                className={clsx("px-2 py-0.5 rounded text-[11px] transition-colors",
                  hotScope === opt.key ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700")}>
                {opt.label}
              </button>
            ))}
          </div>
        }
      />
      <DigestPanel
        title="משימות Production"
        subtitle="Type = Production"
        icon={<Rocket size={16} className="text-amber-500" />}
        tasks={production}
        loading={tasks === null}
        error={error}
        pillarByPageId={pillarByPageId}
      />
    </div>
  );
}

function DigestPanel({ title, subtitle, icon, tasks, loading, error, pillarByPageId, toolbar }: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tasks: NotionTask[];
  loading: boolean;
  error: string | null;
  pillarByPageId: Map<string, Pillar>;
  toolbar?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-3 flex-1 min-w-0 text-right">
          {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
          <span className="shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{title}</span>
              {!loading && (
                <span className="text-xs text-gray-400 tabular-nums">· {tasks.length}</span>
              )}
              {loading && <Loader2 size={12} className="animate-spin text-gray-400" />}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
          </div>
        </button>
        {toolbar && <div className="shrink-0">{toolbar}</div>}
      </div>

      {open && (
        <div className="border-t border-gray-100">
          {error && (
            <p className="px-4 py-3 text-xs text-red-600">{error}</p>
          )}
          {!error && !loading && tasks.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-gray-400">אין משימות תואמות</p>
          )}
          {!error && tasks.map(task => {
            const pillar = task.id ? pillarByPageId.get(task.id) : undefined;
            const pillarHex = pillar?.color && pillar.color.startsWith("#") ? pillar.color : "#9ca3af";
            const openNotion = () => window.open(task.page_url, "_blank", "noopener,noreferrer");
            return (
              <div key={task.id}
                onDoubleClick={openNotion}
                onContextMenu={e => { e.preventDefault(); openNotion(); }}
                title={task.name}
                className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-default">
                {task.notion_id != null && (
                  <span className="text-[10px] font-mono text-gray-400 tabular-nums shrink-0 w-10">#{task.notion_id}</span>
                )}
                <span className="text-sm text-gray-700 flex-1 truncate">{task.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {task.priority && (
                    <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border capitalize",
                      PRIORITY_STYLE[task.priority.toLowerCase()] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
                      {task.priority}
                    </span>
                  )}
                  {task.status && (
                    <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border capitalize",
                      STATUS_STYLE[task.status.toLowerCase()] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
                      {task.status}
                    </span>
                  )}
                  {task.product && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                      {task.product}
                    </span>
                  )}
                  {pillar ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-600">
                      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: pillarHex }} />
                      {pillar.name}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-400">
                      Unassigned
                    </span>
                  )}
                  <a href={task.page_url} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-gray-300 hover:text-gray-600">
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
