"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Plus, Minus, ExternalLink } from "lucide-react";
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
const LABEL_WIDTH_KEY = "gantt:labelWidth";
const EXPANDED_KEY = "gantt:expandedPillars";
const LABEL_WIDTH_DEFAULT = 360;
const LABEL_WIDTH_MIN = 220;
const LABEL_WIDTH_MAX = 720;

const STATUS_STYLE: Record<string, string> = {
  todo: "bg-gray-100 text-gray-600 border-gray-200",
  in_progress: "bg-indigo-100 text-indigo-600 border-indigo-200",
  blocked: "bg-red-100 text-red-600 border-red-200",
  done: "bg-emerald-100 text-emerald-600 border-emerald-200",
  approved: "bg-violet-100 text-violet-600 border-violet-200",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To-do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  approved: "Approved",
};

// Completion weight per state used for sprint %
const COMPLETION: Record<string, number> = {
  todo: 0,
  blocked: 0,
  in_progress: 0.3,
  done: 0.8,
  approved: 1.0,
};

function taskState(task: Task): keyof typeof COMPLETION {
  if (task.tags?.includes("notion:approved")) return "approved";
  return task.status;
}

function taskCompletion(task: Task): number {
  return COMPLETION[taskState(task)] ?? 0;
}

function isActiveTask(task: Task): boolean {
  return taskState(task) !== "approved" && task.status !== "done";
}

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
  const [labelWidth, setLabelWidth] = useState<number>(LABEL_WIDTH_DEFAULT);

  // Load sprint count + label width + saved drawer state — mount-only.
  // Drawers default CLOSED; whatever the user opens persists per browser.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    try {
      const raw = localStorage.getItem(SPRINT_STORAGE_KEY);
      const n = raw ? Math.max(1, parseInt(raw, 10) || DEFAULT_SPRINT_COUNT) : DEFAULT_SPRINT_COUNT;
      setSprintCount(n);
      setVisibleSprints(new Set(Array.from({ length: n }, (_, i) => i + 1)));
      const wRaw = localStorage.getItem(LABEL_WIDTH_KEY);
      if (wRaw) {
        const w = parseInt(wRaw, 10);
        if (Number.isFinite(w)) {
          setLabelWidth(Math.min(LABEL_WIDTH_MAX, Math.max(LABEL_WIDTH_MIN, w)));
        }
      }
      const eRaw = localStorage.getItem(EXPANDED_KEY);
      if (eRaw) {
        const ids = JSON.parse(eRaw);
        if (Array.isArray(ids)) setExpanded(new Set(ids.filter(x => typeof x === "string")));
      }
    } catch {
      /* noop */
    }
    setHydrated(true);
  }, []);

  // Persist drawer state per browser
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expanded))); } catch { /* noop */ }
  }, [hydrated, expanded]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(SPRINT_STORAGE_KEY, String(sprintCount)); } catch { /* noop */ }
  }, [hydrated, sprintCount]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(LABEL_WIDTH_KEY, String(labelWidth)); } catch { /* noop */ }
  }, [hydrated, labelWidth]);

  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: labelWidth };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const next = dragRef.current.startW + (ev.clientX - dragRef.current.startX);
      setLabelWidth(Math.min(LABEL_WIDTH_MAX, Math.max(LABEL_WIDTH_MIN, next)));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const allSprints = useMemo(() => buildSprints(sprintCount), [sprintCount]);
  const shownSprints = useMemo(
    () => allSprints.filter(s => visibleSprints.has(s.index)),
    [allSprints, visibleSprints]
  );

  const totalWeeks = shownSprints.length * 2;

  const currentSprint = useMemo(() => {
    const today = new Date();
    return allSprints.find(s => today >= s.start && today < s.end) ?? allSprints[0] ?? null;
  }, [allSprints]);

  // Build a virtual "Others" pillar from Notion completions during the active sprint
  // window (sprint.start - 2d .. now), only for tasks not yet assigned to a pillar.
  const [othersPillar, setOthersPillar] = useState<Pillar | null>(null);

  useEffect(() => {
    if (!currentSprint) return;
    let cancelled = false;
    const assigned = new Set<string>();
    for (const p of pillars) {
      for (const t of p.tasks ?? []) {
        const pageId = (t as Task & { notion_page_id?: string | null }).notion_page_id;
        if (pageId) assigned.add(pageId);
      }
    }
    fetch("/api/notion/tasks?includeAssigned=true")
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const tasks: Array<{
          id: string; name: string; status: string | null; product: string | null;
          page_url: string; type: string | null; due_date: string | null;
          created_at?: string | null; notion_id?: number | null;
        }> = data.tasks ?? [];
        const windowStart = addDays(currentSprint.start, -2);
        const today = new Date();
        const filtered = tasks.filter(t => {
          if (assigned.has(t.id)) return false;
          const s = (t.status ?? "").toLowerCase();
          const isDone = s === "done" || s === "complete" || s === "approved";
          if (!isDone) return false;
          if (!t.created_at) return false;
          const created = new Date(t.created_at);
          if (Number.isNaN(created.getTime())) return false;
          return created >= windowStart && created <= today;
        });
        if (filtered.length === 0) { setOthersPillar(null); return; }
        const synthesized: Task[] = filtered.map(t => {
          const tags: string[] = [];
          if (t.type) tags.push(t.type);
          if ((t.status ?? "").toLowerCase() === "approved") tags.push("notion:approved");
          return {
            id: `others:${t.id}`,
            title: t.name,
            status: "done",
            source: "notion",
            notion_url: t.page_url,
            product: t.product,
            tags,
            due_date: currentSprint.end.toISOString(),
            created_at: t.created_at ?? null,
          };
        });
        setOthersPillar({
          id: "__others__",
          name: "Others",
          color: "#9ca3af",
          icon: null,
          tasks: synthesized,
        });
      })
      .catch(() => { /* swallow */ });
    return () => { cancelled = true; };
  }, [currentSprint, pillars]);

  const allPillars = useMemo<Pillar[]>(
    () => othersPillar ? [...pillars, othersPillar] : pillars,
    [pillars, othersPillar]
  );

  // Completion % per sprint (across all pillars' tasks that belong to that sprint)
  const sprintCompletion = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of allSprints) {
      const tasksInSprint: Task[] = [];
      for (const p of allPillars) {
        for (const t of p.tasks ?? []) {
          if (sprintForTask(t, allSprints)?.index === s.index) tasksInSprint.push(t);
        }
      }
      if (tasksInSprint.length === 0) {
        map.set(s.index, 0);
      } else {
        const sum = tasksInSprint.reduce((acc, t) => acc + taskCompletion(t), 0);
        map.set(s.index, sum / tasksInSprint.length);
      }
    }
    return map;
  }, [allSprints, allPillars]);

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
            const pct = Math.round((sprintCompletion.get(s.index) ?? 0) * 100);
            return (
              <button key={s.index} onClick={() => toggleSprint(s.index)}
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors",
                  isOn ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                       : "bg-white border-gray-200 text-gray-500 hover:border-gray-300")}>
                <span className="font-medium">Sprint {s.index}</span>
                <span className="text-[10px] opacity-70">{formatShort(s.start)}–{formatShort(addDays(s.end, -1))}</span>
                <span className="text-[10px] font-semibold tabular-nums ml-1">{pct}%</span>
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
          {/* Toolbar: collapse/expand all pillars */}
          <div className="flex items-center px-4 py-2 border-b border-gray-100 bg-white">
            {(() => {
              const allOpen = allPillars.length > 0 && allPillars.every(p => expanded.has(p.id));
              const Icon = allOpen ? ChevronsDownUp : ChevronsUpDown;
              return (
                <button
                  onClick={() =>
                    setExpanded(allOpen ? new Set() : new Set(allPillars.map(p => p.id)))
                  }
                  disabled={allPillars.length === 0}
                  className="group flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 -mx-1 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                  title={allOpen ? "סגור הכל" : "פתח הכל"}>
                  <Icon size={14} className="text-gray-400 group-hover:text-gray-700 transition-colors" />
                  <span>{allPillars.length} פילרים</span>
                </button>
              );
            })()}
          </div>
          {/* Grid header */}
          <div
            className="grid border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500"
            style={{ gridTemplateColumns: `${labelWidth}px repeat(${totalWeeks}, minmax(48px, 1fr))` }}
          >
            <div className="px-4 py-3 relative">
              משימה / Pillar
              <div
                onMouseDown={startDrag}
                onDoubleClick={() => setLabelWidth(LABEL_WIDTH_DEFAULT)}
                title="גרור כדי לשנות רוחב · דאבל-קליק לאיפוס"
                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-200 active:bg-indigo-400 transition-colors"
              />
            </div>
            {shownSprints.map(s => {
              const pct = Math.round((sprintCompletion.get(s.index) ?? 0) * 100);
              return (
                <div key={s.index} className="col-span-2 border-l border-gray-200 px-3 py-2 text-center">
                  <div className="text-[11px] text-indigo-600 font-semibold">Sprint {s.index}</div>
                  <div className="text-[10px] text-gray-400">{formatShort(s.start)}–{formatShort(addDays(s.end, -1))}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 justify-center">
                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden max-w-[80px]">
                      <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 tabular-nums">{pct}%</span>
                  </div>
                </div>
              );
            })}
            {/* Week row */}
            <div className="" />
            {shownSprints.flatMap(s => [1, 2].map(w => (
              <div key={`${s.index}-${w}`} className="border-l border-gray-100 text-center text-[10px] text-gray-400 py-1">
                W{(s.index - 1) * 2 + w}
              </div>
            )))}
          </div>

          {/* Pillar rows */}
          {allPillars.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-400">אין פילרים להצגה</div>
          )}
          {allPillars.map((pillar, idx) => {
            const allTasks = pillar.tasks ?? [];
            const activeTasks = allTasks.filter(isActiveTask);
            const openTasks = allTasks; // show every task; completion shows via bar/label
            const isOpen = expanded.has(pillar.id);
            const pillarPct = allTasks.length === 0
              ? 0
              : Math.round((allTasks.reduce((acc, t) => acc + taskCompletion(t), 0) / allTasks.length) * 100);
            const pillarHex = pillar.color && pillar.color.startsWith("#") ? pillar.color : "#6366f1";
            return (
              <div key={pillar.id} className="border-b border-gray-100 last:border-0">
                <button onClick={() => toggleExpand(pillar.id)}
                  className="w-full grid items-center hover:bg-gray-50 transition-colors"
                  style={{ gridTemplateColumns: `${labelWidth}px repeat(${totalWeeks}, minmax(48px, 1fr))` }}>
                  <div className="px-4 py-3 flex items-center gap-2">
                    {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-[4px] shrink-0"
                      style={{ backgroundColor: pillarHex }}
                      aria-hidden
                    />
                    <span className={clsx("text-sm font-semibold", pillar.id === "__others__" ? "text-gray-500 italic" : "text-gray-800")}>
                      {pillar.name}
                    </span>
                    {pillar.id === "__others__" && (
                      <span className="text-[10px] text-gray-400">משימות שהושלמו בספרינט הנוכחי וטרם שויכו</span>
                    )}
                    <span className="text-xs text-gray-400">· {activeTasks.length}/{allTasks.length}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full transition-all" style={{ width: `${pillarPct}%`, backgroundColor: pillarHex }} />
                      </div>
                      <span className="text-[11px] text-gray-500 tabular-nums w-8 text-right">{pillarPct}%</span>
                      <span className="text-[10px] text-gray-300 font-mono">{String(idx + 1).padStart(2, "0")}</span>
                    </div>
                  </div>
                  {/* Empty cells to fill width */}
                  {Array.from({ length: totalWeeks }).map((_, i) => (
                    <div key={i} className="border-l border-gray-100 h-full" />
                  ))}
                </button>

                {isOpen && openTasks.length > 0 && (
                  <div>
                    {openTasks.map(task => <TaskRow key={task.id} task={task} sprints={shownSprints} totalWeeks={totalWeeks} labelWidth={labelWidth} pillarColor={pillar.color} />)}
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

function TaskRow({ task, sprints, totalWeeks, labelWidth, pillarColor }: {
  task: Task;
  sprints: Sprint[];
  totalWeeks: number;
  labelWidth: number;
  pillarColor?: string;
}) {
  const targetSprint = sprintForTask(task, sprints);
  const created = toDate(task.created_at ?? null);
  const due = toDate(task.due_date ?? null);
  const state = taskState(task);
  const completionPct = Math.round(taskCompletion(task) * 100);
  const isComplete = state === "approved";

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
  const tag = task.tags?.find(t => !t.startsWith("notion:"));

  return (
    <div
      className={clsx("grid items-center hover:bg-gray-50 transition-colors cursor-default", isComplete && "opacity-60")}
      style={{ gridTemplateColumns: `${labelWidth}px repeat(${totalWeeks}, minmax(48px, 1fr))` }}
      onDoubleClick={openInNotion}
      onContextMenu={e => { if (task.notion_url) { e.preventDefault(); openInNotion(); } }}
      title={task.notion_url ? "Double/right click to open in Notion" : undefined}
    >
      <div className="px-4 py-2.5 pl-10 flex items-center gap-2 min-w-0">
        <span className="relative group/title flex-1 min-w-0">
          <span className={clsx("block text-sm truncate", isComplete ? "text-gray-400 line-through" : "text-gray-700")}>
            {task.title}
          </span>
          <span className="pointer-events-none absolute top-full left-0 mt-1 z-30 hidden group-hover/title:block max-w-md whitespace-normal break-words rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-lg leading-snug">
            {task.title}
          </span>
        </span>
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
        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border shrink-0", STATUS_STYLE[state] ?? STATUS_STYLE.todo)}>
          {STATUS_LABEL[state] ?? state}
        </span>
        <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">{completionPct}%</span>
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
              className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full overflow-hidden"
              style={{
                left: `calc(${(startWeek / totalWeeks) * 100}% + 4px)`,
                width: `calc(${((endWeek - startWeek + 1) / totalWeeks) * 100}% - 8px)`,
                backgroundColor: `${barColor}33`, // 20% opacity track
                border: `1px solid ${barColor}55`,
              }}
              title={`${task.title} — ${completionPct}%${due ? ` · due ${formatLong(due)}` : ""}`}
            >
              <div
                className="h-full transition-all"
                style={{ width: `${completionPct}%`, backgroundColor: barColor }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
