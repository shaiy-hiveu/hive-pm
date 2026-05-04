"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, Flame, Rocket, Loader2, Check } from "lucide-react";
import clsx from "clsx";
import { explicitSprintIndex, currentSprintIndex } from "@/lib/sprints";

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
  tags?: string[] | null;
};

const SPRINT_COUNT_KEY = "gantt:sprintCount";
const DEFAULT_SPRINT_COUNT = 4;

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

const HOT_SCOPE_KEY = "notionTasks:hotScope";
const HOT_OPEN_KEY = "notionTasks:hotOpen";
const PRODUCTION_OPEN_KEY = "notionTasks:productionOpen";
const PRODUCTION_NOT_DONE_KEY = "notionTasks:productionNotDone";

function readBoolFromStorage(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch { /* noop */ }
  return fallback;
}

function readScopeFromStorage(): HotScope {
  if (typeof window === "undefined") return "urgent_high";
  try {
    const v = localStorage.getItem(HOT_SCOPE_KEY);
    if (v === "urgent" || v === "urgent_high") return v;
  } catch { /* noop */ }
  return "urgent_high";
}

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

function isDoneStatus(s: string | null): boolean {
  const v = (s ?? "").toLowerCase();
  return v === "done" || v === "complete" || v === "approved";
}

export default function NotionTasksSummary({ pillars }: Props) {
  const router = useRouter();
  const [tasks, setTasks] = useState<NotionTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hotScope, setHotScope] = useState<HotScope>("urgent_high");
  const [productionNotDone, setProductionNotDone] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);

  // Read prefs on mount (client-only)
  useEffect(() => {
    setHotScope(readScopeFromStorage());
    setProductionNotDone(readBoolFromStorage(PRODUCTION_NOT_DONE_KEY, false));
    setHydrated(true);
  }, []);

  // Persist scope after hydration so the initial default doesn't overwrite the saved value
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(HOT_SCOPE_KEY, hotScope); } catch { /* noop */ }
  }, [hydrated, hotScope]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(PRODUCTION_NOT_DONE_KEY, String(productionNotDone)); } catch { /* noop */ }
  }, [hydrated, productionNotDone]);

  // Local mutable copy of the assignment map so optimistic updates show immediately
  const initialMap = useMemo(() => {
    const map = new Map<string, Pillar>();
    for (const p of pillars) {
      for (const t of p.tasks ?? []) {
        if (t.notion_page_id) map.set(t.notion_page_id, p);
      }
    }
    return map;
  }, [pillars]);
  const [pillarByPageId, setPillarByPageId] = useState<Map<string, Pillar>>(initialMap);

  useEffect(() => { setPillarByPageId(initialMap); }, [initialMap]);

  // Sprint count (mirrors the Gantt's localStorage value so the dropdown
  // shows the same set of sprints).
  const [sprintCount, setSprintCount] = useState<number>(DEFAULT_SPRINT_COUNT);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SPRINT_COUNT_KEY);
      const n = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(n) && n > 0) setSprintCount(n);
    } catch { /* noop */ }
  }, []);

  // Map: notion_page_id -> explicit sprint index (only if the DB row carries
  // a sprint:N tag). Tasks without a DB row, or without an explicit tag,
  // show as "Unassigned" in the dropdown.
  const sprintByPageId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pillars) {
      for (const t of p.tasks ?? []) {
        if (!t.notion_page_id) continue;
        const idx = explicitSprintIndex(t.tags ?? null);
        if (idx != null) map.set(t.notion_page_id, idx);
      }
    }
    return map;
  }, [pillars]);
  const [sprintByPageIdLocal, setSprintByPageIdLocal] = useState<Map<string, number>>(sprintByPageId);
  useEffect(() => { setSprintByPageIdLocal(sprintByPageId); }, [sprintByPageId]);

  async function assignTask(notionPageId: string, pillarId: string | null): Promise<void> {
    const prev = pillarByPageId;
    const next = new Map(prev);
    if (!pillarId) next.delete(notionPageId);
    else {
      const target = pillars.find(p => p.id === pillarId);
      if (target) next.set(notionPageId, target);
    }
    setPillarByPageId(next);
    try {
      const res = await fetch("/api/tasks/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notion_page_id: notionPageId, pillar_id: pillarId }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      setPillarByPageId(prev); // rollback
    }
  }

  async function assignSprint(notionPageId: string, sprintIdx: number): Promise<void> {
    const prev = sprintByPageIdLocal;
    const next = new Map(prev);
    next.set(notionPageId, sprintIdx);
    setSprintByPageIdLocal(next);
    try {
      const res = await fetch("/api/tasks/pin-notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notion_page_id: notionPageId, sprintIndex: sprintIdx }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      setSprintByPageIdLocal(prev);
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Don't refetch on every page mount; reuse the cached payload from
    // the previous visit so navigating between pages stays free of
    // Notion API calls. Refresh Data clears this and triggers a fresh
    // fetch on the next remount.
    try {
      const cached = localStorage.getItem("notion:tasks-cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.tasks) {
          setTasks(parsed.tasks);
          return () => { cancelled = true; };
        }
      }
    } catch { /* noop */ }

    fetch("/api/notion/tasks?includeAssigned=true")
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else {
          setTasks(data.tasks ?? []);
          try { localStorage.setItem("notion:tasks-cache", JSON.stringify({ tasks: data.tasks ?? [] })); } catch { /* noop */ }
        }
      })
      .catch(err => { if (!cancelled) setError(String(err?.message ?? err)); });
    return () => { cancelled = true; };
  }, []);

  const hot = useMemo(
    () => (tasks ?? []).filter(t => isHotTask(t, hotScope)).sort(sortByPriority),
    [tasks, hotScope]
  );
  const production = useMemo(
    () => (tasks ?? [])
      .filter(t => isProductionTask(t) && (!productionNotDone || !isDoneStatus(t.status)))
      .sort(sortByPriority),
    [tasks, productionNotDone]
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
        pillars={pillars}
        sprintByPageId={sprintByPageIdLocal}
        sprintCount={sprintCount}
        onAssign={assignTask}
        onAssignSprint={assignSprint}
        storageKey={HOT_OPEN_KEY}
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
        pillars={pillars}
        sprintByPageId={sprintByPageIdLocal}
        sprintCount={sprintCount}
        onAssign={assignTask}
        onAssignSprint={assignSprint}
        storageKey={PRODUCTION_OPEN_KEY}
        toolbar={
          <label
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-800 cursor-pointer select-none px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
            title="הסתר משימות שכבר Done / Complete / Approved">
            <input type="checkbox"
              checked={productionNotDone}
              onChange={e => setProductionNotDone(e.target.checked)}
              className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
            <span>Not done</span>
          </label>
        }
      />
    </div>
  );
}

function DigestPanel({ title, subtitle, icon, tasks, loading, error, pillarByPageId, pillars, sprintByPageId, sprintCount, onAssign, onAssignSprint, toolbar, storageKey }: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tasks: NotionTask[];
  loading: boolean;
  error: string | null;
  pillarByPageId: Map<string, Pillar>;
  pillars: Pillar[];
  sprintByPageId: Map<string, number>;
  sprintCount: number;
  onAssign: (notionPageId: string, pillarId: string | null) => Promise<void>;
  onAssignSprint: (notionPageId: string, sprintIdx: number) => Promise<void>;
  toolbar?: React.ReactNode;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (storageKey) setOpen(readBoolFromStorage(storageKey, false));
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || !storageKey) return;
    try { localStorage.setItem(storageKey, String(open)); } catch { /* noop */ }
  }, [hydrated, storageKey, open]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
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
                  <PillarMenu
                    current={pillar}
                    pillars={pillars}
                    onPick={pid => onAssign(task.id, pid)}
                  />
                  <SprintMenu
                    current={sprintByPageId.get(task.id) ?? null}
                    count={sprintCount}
                    onPick={idx => onAssignSprint(task.id, idx)}
                  />
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

function PillarMenu({ current, pillars, onPick }: {
  current: Pillar | undefined;
  pillars: Pillar[];
  onPick: (pillarId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hex = current?.color && current.color.startsWith("#") ? current.color : "#9ca3af";
  const MENU_W = 192; // matches w-48
  const ROW_H = 28;
  const MENU_H_ESTIMATE = pillars.length * ROW_H + 40; // rows + separator + unassign

  function computePos() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const goUp = spaceBelow < MENU_H_ESTIMATE + 12;
    const top = goUp ? Math.max(8, r.top - MENU_H_ESTIMATE - 4) : r.bottom + 4;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos({ top, right });
  }

  function toggle() {
    if (!open) computePos();
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScrollOrResize() { computePos(); }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  async function pick(pid: string | null) {
    setBusy(true);
    try { await onPick(pid); } finally { setBusy(false); setOpen(false); }
  }

  const menu = open && pos && (
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, right: pos.right, width: MENU_W, zIndex: 60 }}
      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1"
      onClick={e => e.stopPropagation()}
    >
      {pillars.map(p => {
        const phex = p.color && p.color.startsWith("#") ? p.color : "#9ca3af";
        const isCurrent = current?.id === p.id;
        return (
          <button key={p.id} onClick={() => pick(p.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-right">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: phex }} />
            <span className="flex-1 truncate">{p.name}</span>
            {isCurrent && <Check size={12} className="text-indigo-500" />}
          </button>
        );
      })}
      <div className="my-1 border-t border-gray-100" />
      <button onClick={() => pick(null)}
        className="w-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 text-right disabled:opacity-50"
        disabled={!current}>
        ביטול שיוך
      </button>
    </div>
  );

  return (
    <>
      <button ref={triggerRef} onClick={toggle}
        className={clsx("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors",
          current ? "border-gray-200 text-gray-600 hover:border-gray-400"
                  : "border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400")}>
        {current ? (
          <>
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: hex }} />
            {current.name}
          </>
        ) : "Unassigned"}
        {busy ? <Loader2 size={10} className="animate-spin" /> : <ChevronDown size={10} className="opacity-60" />}
      </button>
      {typeof window !== "undefined" && menu && createPortal(menu, document.body)}
    </>
  );
}

function SprintMenu({ current, count, onPick }: {
  current: number | null;
  count: number;
  onPick: (idx: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_W = 140;
  const ROW_H = 28;
  const MENU_H = count * ROW_H + 8;
  const todayCurrent = currentSprintIndex(count);

  function computePos() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const spaceBelow = window.innerHeight - r.bottom;
    const goUp = spaceBelow < MENU_H + 12;
    const top = goUp ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos({ top, right });
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onMove() { computePos(); }
    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  async function pick(idx: number) {
    if (idx === current) { setOpen(false); return; }
    setBusy(true);
    try { await onPick(idx); } finally { setBusy(false); setOpen(false); }
  }

  function toggle() {
    if (!open) computePos();
    setOpen(o => !o);
  }

  const menu = open && pos && (
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, right: pos.right, width: MENU_W, zIndex: 60 }}
      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1"
      onClick={e => e.stopPropagation()}>
      {Array.from({ length: count }, (_, i) => i + 1).map(n => (
        <button key={n} onClick={() => pick(n)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-right">
          <span>Sprint {n}{n === todayCurrent && <span className="text-[9px] text-gray-400 mr-1">· today</span>}</span>
          {n === current && <Check size={12} className="text-indigo-500" />}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button ref={triggerRef}
        onClick={e => { e.stopPropagation(); toggle(); }}
        onDoubleClick={e => e.stopPropagation()}
        onContextMenu={e => e.stopPropagation()}
        className={clsx("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors",
          current ? "border-gray-200 text-gray-600 hover:border-gray-400"
                  : "border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400")}
        title={current ? `Sprint ${current} — לחיצה כדי לשנות` : "שייך משימה לספרינט"}>
        {current ? `S${current}` : "Sprint?"}
        {busy ? <Loader2 size={10} className="animate-spin" /> : <ChevronDown size={10} className="opacity-60" />}
      </button>
      {typeof window !== "undefined" && menu && createPortal(menu, document.body)}
    </>
  );
}
