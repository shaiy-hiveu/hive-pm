"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Plus, Minus, ExternalLink } from "lucide-react";
import clsx from "clsx";

type Task = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  source: "manual" | "notion";
  notion_url?: string | null;
  product?: string | null;
  tags?: string[] | null;
  due_date?: string | null;
  created_at?: string | null;
};

type Pillar = {
  id: string;
  name: string;
  color?: string;
  icon?: string | null;
  tasks?: Task[];
};

type Sprint = {
  index: number;   // 1-based
  start: Date;
  end: Date;       // exclusive
  weeks: [Date, Date]; // [week1 start, week2 start]
};

type Props = {
  pillars: Pillar[];
};

const BASE_DATE = new Date(2026, 3, 19); // 19 April 2026 (month is 0-indexed)
const SPRINT_DAYS = 14;
const DEFAULT_SPRINT_COUNT = 4;
const SPRINT_STORAGE_KEY = "gantt:sprintCount";

const STATUS_STYLE: Record<string, string> = {
  todo: "bg-gray-100 text-gray-600 border-gray-200",
  in_progress: "bg-indigo-100 text-indigo-600 border-indigo-200",
  blocked: "bg-red-100 text-red-600 border-red-200",
  done: "bg-emerald-100 text-emerald-600 border-emerald-200",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To-do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatShort(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatLong(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildSprints(count: number): Sprint[] {
  const out: Sprint[] = [];
  for (let i = 0; i < count; i++) {
    const start = addDays(BASE_DATE, i * SPRINT_DAYS);
    const end = addDays(start, SPRINT_DAYS);
    out.push({
      index: i + 1,
      start,
      end,
      weeks: [start, addDays(start, 7)],
    });
  }
  return out;
}

// A task is "in" a sprint if:
// 1) its due_date (if set) falls on or before the sprint end AND on/after sprint start, OR
// 2) no due date, but created_at is at least 7 days before sprint start
function sprintForTask(task: Task, sprints: Sprint[]): Sprint | null {
  const due = toDate(task.due_date ?? null);
  const created = toDate(task.created_at ?? null);

  if (due) {
    // Find earliest sprint whose end covers the due date
    for (const s of sprints) {
      if (due <= s.end) return s;
    }
    return sprints[sprints.length - 1] ?? null;
  }
  if (created) {
    for (const s of sprints) {
      if (addDays(created, 7) <= s.start) return s;
    }
  }
  return null;
}

function weekIndexOf(date: Date, sprints: Sprint[]): number | null {
  if (sprints.length === 0) return null;
  const total = sprints.length * 2;
  const first = sprints[0].start;
  const last = addDays(sprints[sprints.length - 1].start, SPRINT_DAYS);
  if (date < first) return 0;
  if (date >= last) return total - 1;
  const diffDays = Math.floor((date.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(Math.floor(diffDays / 7), total - 1);
}

export default function GanttChart({ pillars }: Props) {
  const [sprintCount, setSprintCount] = useState<number>(DEFAULT_SPRINT_COUNT);
  const [hydrated, setHydrated] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleSprints, setVisibleSprints] = useState<Set<number>>(new Set());

  // Load sprint count from storage, default to all visible
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SPRINT_STORAGE_KEY);
      const n = raw ? Math.max(1, parseInt(raw, 10) || DEFAULT_SPRINT_COUNT) : DEFAULT_SPRINT_COUNT;
      setSprintCount(n);
      setVisibleSprints(new Set(Array.from({ length: n }, (_, i) => i + 1)));
      setExpanded(new Set(pillars.map(p => p.id))); // open all pillars by default
    } catch {
      /* noop */
    }
    setHydrated(true);
  }, [pillars]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(SPRINT_STORAGE_KEY, String(sprintCount)); } catch { /* noop */ }
  }, [hydrated, sprintCount]);

  const allSprints = useMemo(() => buildSprints(sprintCount), [sprintCount]);
  const shownSprints = useMemo(
    () => allSprints.filter(s => visibleSprints.has(s.index)),
    [allSprints, visibleSprints]
  );

  const totalWeeks = shownSprints.length * 2;

  function toggleSprint(idx: number) {
    setVisibleSprints(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function addSprint() {
    setSprintCount(c => {
      const next = c + 1;
      setVisibleSprints(prev => new Set(prev).add(next));
      return next;
    });
  }

  function removeLastSprint() {
    setSprintCount(c => {
      if (c <= 1) return c;
      const next = c - 1;
      setVisibleSprints(prev => {
        const v = new Set(prev);
        v.delete(c);
        return v;
      });
      return next;
    });
  }

  function toggleExpand(pillarId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(pillarId) ? next.delete(pillarId) : next.add(pillarId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Sprint selector */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500">ספרינטים — לחץ/י לשינוי הנוכחי</p>
          <div className="flex items-center gap-1">
            <button onClick={removeLastSprint} disabled={sprintCount <= 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
              <Minus size={13} />
            </button>
            <button onClick={addSprint}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs">
              <Plus size={13} /> ספרינט
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {allSprints.map(s => {
            const isOn = visibleSprints.has(s.index);
            return (
              <button key={s.index} onClick={() => toggleSprint(s.index)}
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors",
                  isOn ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                       : "bg-white border-gray-200 text-gray-500 hover:border-gray-300")}>
                <span className="font-medium">Sprint {s.index}</span>
                <span className="text-[10px] opacity-70">{formatShort(s.start)}–{formatShort(addDays(s.end, -1))}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      {shownSprints.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center text-gray-400">
          בחר/י לפחות ספרינט אחד כדי לראות את הגאנט
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Grid header */}
          <div
            className="grid border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500"
            style={{ gridTemplateColumns: `minmax(360px, 1fr) repeat(${totalWeeks}, minmax(48px, 1fr))` }}
          >
            <div className="px-4 py-3">משימה / Pillar</div>
            {shownSprints.map(s => (
              <div key={s.index} className="col-span-2 border-l border-gray-200 px-3 py-2 text-center">
                <div className="text-[11px] text-indigo-600 font-semibold">Sprint {s.index}</div>
                <div className="text-[10px] text-gray-400">{formatShort(s.start)}–{formatShort(addDays(s.end, -1))}</div>
              </div>
            ))}
            {/* Week row */}
            <div className="" />
            {shownSprints.flatMap(s => [1, 2].map(w => (
              <div key={`${s.index}-${w}`} className="border-l border-gray-100 text-center text-[10px] text-gray-400 py-1">
                W{(s.index - 1) * 2 + w}
              </div>
            )))}
          </div>

          {/* Pillar rows */}
          {pillars.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-400">אין פילרים להצגה</div>
          )}
          {pillars.map((pillar, idx) => {
            const openTasks = (pillar.tasks ?? []).filter(t => t.status !== "done");
            const isOpen = expanded.has(pillar.id);
            return (
              <div key={pillar.id} className="border-b border-gray-100 last:border-0">
                <button onClick={() => toggleExpand(pillar.id)}
                  className="w-full grid items-center hover:bg-gray-50 transition-colors"
                  style={{ gridTemplateColumns: `minmax(360px, 1fr) repeat(${totalWeeks}, minmax(48px, 1fr))` }}>
                  <div className="px-4 py-3 flex items-center gap-2">
                    {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    {pillar.icon && <span className="text-base">{pillar.icon}</span>}
                    <span className="text-sm font-semibold text-gray-800">{pillar.name}</span>
                    <span className="text-xs text-gray-400">· {openTasks.length} פעילות</span>
                    <span className="text-[10px] text-gray-400 font-mono ml-auto">{String(idx + 1).padStart(2, "0")}</span>
                  </div>
                  {/* Empty cells to fill width */}
                  {Array.from({ length: totalWeeks }).map((_, i) => (
                    <div key={i} className="border-l border-gray-100 h-full" />
                  ))}
                </button>

                {isOpen && openTasks.length > 0 && (
                  <div>
                    {openTasks.map(task => <TaskRow key={task.id} task={task} sprints={shownSprints} totalWeeks={totalWeeks} pillarColor={pillar.color} />)}
                  </div>
                )}
                {isOpen && openTasks.length === 0 && (
                  <div className="px-12 py-3 text-xs text-gray-400">אין משימות פעילות בפילר זה</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, sprints, totalWeeks, pillarColor }: {
  task: Task;
  sprints: Sprint[];
  totalWeeks: number;
  pillarColor?: string;
}) {
  const targetSprint = sprintForTask(task, sprints);
  const created = toDate(task.created_at ?? null);
  const due = toDate(task.due_date ?? null);

  // Compute bar span across shown weeks
  let startWeek: number | null = null;
  let endWeek: number | null = null;
  if (targetSprint) {
    const barStart = created && created >= sprints[0].start ? created : sprints[0].start;
    const barEnd = due ?? addDays(targetSprint.end, -1);
    startWeek = weekIndexOf(barStart, sprints);
    endWeek = weekIndexOf(barEnd, sprints);
    if (startWeek !== null && endWeek !== null && endWeek < startWeek) endWeek = startWeek;
  }

  const openInNotion = () => {
    if (task.notion_url) window.open(task.notion_url, "_blank", "noopener,noreferrer");
  };

  const barColor = pillarColor && pillarColor.startsWith("#") ? pillarColor : "#6366f1";
  const tag = task.tags?.[0];

  return (
    <div
      className="grid items-center hover:bg-gray-50 transition-colors cursor-default"
      style={{ gridTemplateColumns: `minmax(360px, 1fr) repeat(${totalWeeks}, minmax(48px, 1fr))` }}
      onDoubleClick={openInNotion}
      onContextMenu={e => { if (task.notion_url) { e.preventDefault(); openInNotion(); } }}
      title={task.notion_url ? "Double/right click to open in Notion" : undefined}
    >
      <div className="px-4 py-2.5 pl-10 flex items-center gap-2 min-w-0">
        <span className="text-sm text-gray-700 truncate flex-1">{task.title}</span>
        {tag && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 capitalize shrink-0">
            {tag}
          </span>
        )}
        {task.product && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
            {task.product}
          </span>
        )}
        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border shrink-0", STATUS_STYLE[task.status] ?? STATUS_STYLE.todo)}>
          {STATUS_LABEL[task.status] ?? task.status}
        </span>
        {due && (
          <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
            📅 {formatLong(due)}
          </span>
        )}
        {task.notion_url && (
          <a href={task.notion_url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-gray-300 hover:text-gray-600 shrink-0">
            <ExternalLink size={11} />
          </a>
        )}
      </div>

      {/* Week cells with bar */}
      <div
        className="col-span-full row-start-1"
        style={{ gridColumn: `2 / span ${totalWeeks}` }}
      >
        <div className="relative h-full">
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))` }}>
            {Array.from({ length: totalWeeks }).map((_, i) => {
              const inSprint = targetSprint && (i === weekIndexOf(targetSprint.start, sprints));
              return (
                <div key={i} className={clsx("border-l border-gray-100", inSprint ? "bg-indigo-50/40" : "")} />
              );
            })}
          </div>
          {startWeek !== null && endWeek !== null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full opacity-85"
              style={{
                left: `calc(${(startWeek / totalWeeks) * 100}% + 4px)`,
                width: `calc(${((endWeek - startWeek + 1) / totalWeeks) * 100}% - 8px)`,
                backgroundColor: barColor,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
