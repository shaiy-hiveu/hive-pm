"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, Plus, Minus, ExternalLink, Check, Loader2, Pencil } from "lucide-react";
import clsx from "clsx";
import { loadNotionMetaMap } from "@/lib/notion-id-map";
import PillarMenu from "@/components/PillarMenu";
import { explicitSprintIndex, currentSprintIndex, isSprintCleared, progressOverride, sprintIndexAt } from "@/lib/sprints";

type Task = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  source: "manual" | "notion";
  notion_url?: string | null;
  notion_page_id?: string | null;
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
  // DB tasks with `pillar_id = null` — pinned-into-Others rows. Folded into
  // the synthetic Others row at runtime so the gantt has one Others view.
  orphanTasks?: Task[];
};

const BASE_DATE = new Date(2026, 3, 19); // 19 April 2026 (month is 0-indexed)
const SPRINT_DAYS = 14;
const DEFAULT_SPRINT_COUNT = 4;
const SPRINT_STORAGE_KEY = "gantt:sprintCount";
const VISIBLE_SPRINTS_KEY = "gantt:visibleSprints";
const LABEL_WIDTH_KEY = "gantt:labelWidth";
const EXPANDED_KEY = "gantt:expandedPillars";
const NORMALIZED_KEY = "gantt:normalized";
const DETAILED_KEY = "gantt:detailed";
const SORT_KEY = "gantt:sortBy";

type SortBy = "id" | "completion";

type SprintGoal = { text: string; completion: number };
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
  const state = taskState(task);
  // Manual override is honored only while the task is "in_progress". Any other
  // state ignores the override and shows the status default — so flipping
  // status visually resets the bar back to the canonical weight.
  if (state === "in_progress") {
    const override = progressOverride(task.tags ?? null);
    if (override != null) return override / 100;
  }
  return COMPLETION[state] ?? 0;
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

// A task's sprint is whichever sprint it has been assigned to via the
// "sprint:N" tag. Tasks without an explicit tag default to the current
// sprint (the one whose date range contains today). This way future
// sprints stay empty unless the user explicitly drops tasks into them.
function sprintForTask(task: Task, sprints: Sprint[], now: Date = new Date()): Sprint | null {
  // Tasks that were explicitly cleared from a sprint stay hidden.
  if (isSprintCleared(task.tags ?? null)) return null;
  let idx = explicitSprintIndex(task.tags ?? null);
  if (idx == null) {
    // No explicit tag → anchor to the sprint that was current at the task's
    // creation time, NOT today. Without this, untagged tasks "migrate"
    // forward as time passes, ending up in whichever sprint happens to be
    // current — even though they were planned in a much earlier sprint.
    const created = task.created_at ? new Date(task.created_at) : null;
    const reference = (created && !Number.isNaN(created.getTime())) ? created : now;
    idx = sprintIndexAt(reference, sprints.length);
  }
  return sprints.find(s => s.index === idx) ?? null;
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

export default function GanttChart({ pillars, orphanTasks = [] }: Props) {
  const router = useRouter();
  const [sprintCount, setSprintCount] = useState<number>(DEFAULT_SPRINT_COUNT);
  const [hydrated, setHydrated] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleSprints, setVisibleSprints] = useState<Set<number>>(new Set());
  const [labelWidth, setLabelWidth] = useState<number>(LABEL_WIDTH_DEFAULT);
  const [normalized, setNormalized] = useState<boolean>(false);
  const [detailed, setDetailed] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<SortBy>("id");
  const [notionIdMap, setNotionIdMap] = useState<Record<string, number>>({});
  const [notionPriorityMap, setNotionPriorityMap] = useState<Record<string, string>>({});
  const [sprintMeta, setSprintMeta] = useState<Record<number, { name: string | null; comment: string | null; goals: SprintGoal[] }>>({});
  const [editingMeta, setEditingMeta] = useState<{ idx: number; name: string; comment: string; goals: SprintGoal[] } | null>(null);
  // DEBUG: override "today" to simulate a different date. Empty string = use real today.
  const [debugDate, setDebugDate] = useState<string>("");
  const now = useMemo<Date>(() => {
    if (!debugDate) return new Date();
    const d = new Date(debugDate);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [debugDate]);

  useEffect(() => {
    let cancelled = false;
    loadNotionMetaMap().then(meta => {
      if (cancelled) return;
      setNotionIdMap(meta.ids);
      setNotionPriorityMap(meta.priorities);
    });
    return () => { cancelled = true; };
  }, []);

  const reloadSprintMeta = async () => {
    try {
      const r = await fetch("/api/sprints/metadata");
      const data = await r.json();
      const map: Record<number, { name: string | null; comment: string | null; goals: SprintGoal[] }> = {};
      for (const item of data.items ?? []) {
        map[item.sprint_index] = {
          name: item.name,
          comment: item.comment,
          goals: Array.isArray(item.goals) ? item.goals : [],
        };
      }
      setSprintMeta(map);
    } catch { /* swallow */ }
  };

  useEffect(() => {
    void reloadSprintMeta();
  }, []);

  function defaultSprintName(idx: number): string {
    return `Sprint ${idx}`;
  }
  function sprintDisplayName(idx: number): string {
    return sprintMeta[idx]?.name?.trim() || defaultSprintName(idx);
  }
  function sprintComment(idx: number): string | null {
    return sprintMeta[idx]?.comment ?? null;
  }
  function sprintGoalsList(idx: number): SprintGoal[] {
    return sprintMeta[idx]?.goals ?? [];
  }
  function sprintTooltip(idx: number): string {
    const name = sprintDisplayName(idx);
    const lines: string[] = [name];
    const c = sprintComment(idx);
    if (c) lines.push(c);
    const goals = sprintGoalsList(idx);
    if (goals.length > 0) {
      lines.push("");
      lines.push("Goals:");
      for (const g of goals) lines.push(`• ${g.text} (${g.completion}%)`);
    }
    return lines.join("\n");
  }

  async function saveSprintMeta(idx: number, name: string, comment: string, goals: SprintGoal[]): Promise<void> {
    try {
      await fetch(`/api/sprints/${idx}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || null, comment: comment || null, goals }),
      });
      await reloadSprintMeta();
    } catch { /* swallow */ }
  }

  async function setTaskSprint(taskId: string, sprintIdx: number | null): Promise<void> {
    try {
      await fetch(`/api/tasks/${taskId}/sprint`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintIndex: sprintIdx }),
      });
      router.refresh();
    } catch { /* ignore */ }
  }

  // Pins every task currently shown in the *now*-current sprint without an
  // explicit `sprint:N` tag — i.e., every auto-assigned task — by giving it
  // an explicit tag. After this, those tasks won't migrate forward when the
  // calendar (or debug date) advances. Also handles Others-pillar synthetic
  // rows: they don't have DB rows yet, so we create one with pillar_id=null
  // and the explicit sprint tag via /api/tasks/pin-notion.
  const [pinningSprint, setPinningSprint] = useState(false);
  const [pinResult, setPinResult] = useState<string | null>(null);
  async function pinAutoAssignedToCurrentSprint(): Promise<void> {
    setPinningSprint(true);
    setPinResult(null);
    try {
      const targetIdx = currentSprintIndex(allSprints.length, now);

      // Real DB tasks (any pillar): tag-update via /api/tasks/[id]/sprint.
      const dbCandidateIds: string[] = [];
      for (const p of pillars) {
        for (const t of p.tasks ?? []) {
          if (explicitSprintIndex(t.tags ?? null) != null) continue;
          if (isSprintCleared(t.tags ?? null)) continue;
          const resolved = sprintForTask(t, allSprints, now);
          if (resolved?.index === targetIdx) dbCandidateIds.push(t.id);
        }
      }

      // Others-pillar synthetic tasks (no DB row, no pillar): create row +
      // tag via /api/tasks/pin-notion. Use notion_page_id since synthetic
      // ids are `others:<notion_page_id>` and not addressable as DB rows.
      const othersCandidatePageIds: string[] = [];
      for (const t of othersPillar?.tasks ?? []) {
        if (!t.notion_page_id) continue;
        if (explicitSprintIndex(t.tags ?? null) != null) continue;
        if (isSprintCleared(t.tags ?? null)) continue;
        othersCandidatePageIds.push(t.notion_page_id);
      }

      const total = dbCandidateIds.length + othersCandidatePageIds.length;
      if (total === 0) {
        setPinResult("No auto-assigned tasks to pin in this sprint.");
        return;
      }

      await Promise.all([
        ...dbCandidateIds.map(id => fetch(`/api/tasks/${id}/sprint`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sprintIndex: targetIdx }),
        })),
        ...othersCandidatePageIds.map(pageId => fetch(`/api/tasks/pin-notion`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notion_page_id: pageId, sprintIndex: targetIdx }),
        })),
      ]);

      const parts: string[] = [];
      if (dbCandidateIds.length) parts.push(`${dbCandidateIds.length} pillar`);
      if (othersCandidatePageIds.length) parts.push(`${othersCandidatePageIds.length} Others`);
      setPinResult(`Pinned ${total} task${total === 1 ? "" : "s"} (${parts.join(" + ")}) to Sprint ${targetIdx}.`);
      router.refresh();
    } catch (err) {
      setPinResult(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setPinningSprint(false);
    }
  }

  async function setTaskProgress(taskId: string, pct: number | null): Promise<void> {
    try {
      await fetch(`/api/tasks/${taskId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: pct }),
      });
      router.refresh();
    } catch { /* ignore */ }
  }

  // For Others-pillar synthetic rows: assign by notion_page_id (creates a
  // DB row pointing at the chosen pillar) — same flow as the digest panel.
  async function assignOthersTask(notionPageId: string, pillarId: string | null): Promise<void> {
    try {
      await fetch("/api/tasks/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notion_page_id: notionPageId, pillar_id: pillarId }),
      });
      try { localStorage.removeItem("notion:tasks-cache"); } catch { /* noop */ }
      router.refresh();
    } catch { /* ignore */ }
  }

  const [clearingSprint, setClearingSprint] = useState<number | null>(null);
  const [clearBusy, setClearBusy] = useState(false);

  async function clearSprint(idx: number): Promise<void> {
    setClearBusy(true);
    try {
      await fetch(`/api/sprints/${idx}/clear`, { method: "POST" });
      router.refresh();
    } catch { /* ignore */ }
    setClearBusy(false);
    setClearingSprint(null);
  }

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
      const vsRaw = localStorage.getItem(VISIBLE_SPRINTS_KEY);
      let visible: Set<number> | null = null;
      if (vsRaw) {
        try {
          const arr = JSON.parse(vsRaw);
          if (Array.isArray(arr)) {
            const cleaned = arr
              .map(x => Number(x))
              .filter(x => Number.isFinite(x) && x >= 1 && x <= n);
            if (cleaned.length > 0) visible = new Set(cleaned);
          }
        } catch { /* fall through */ }
      }
      setVisibleSprints(visible ?? new Set(Array.from({ length: n }, (_, i) => i + 1)));
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
      const nRaw = localStorage.getItem(NORMALIZED_KEY);
      if (nRaw === "true") setNormalized(true);
      const dRaw = localStorage.getItem(DETAILED_KEY);
      if (dRaw === "false") setDetailed(false);
      const sRaw = localStorage.getItem(SORT_KEY);
      if (sRaw === "completion" || sRaw === "id") setSortBy(sRaw);
    } catch {
      /* noop */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(NORMALIZED_KEY, String(normalized)); } catch { /* noop */ }
  }, [hydrated, normalized]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(DETAILED_KEY, String(detailed)); } catch { /* noop */ }
  }, [hydrated, detailed]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(SORT_KEY, sortBy); } catch { /* noop */ }
  }, [hydrated, sortBy]);

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
    try {
      localStorage.setItem(VISIBLE_SPRINTS_KEY, JSON.stringify(Array.from(visibleSprints).sort((a, b) => a - b)));
    } catch { /* noop */ }
  }, [hydrated, visibleSprints]);

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

  // Build a virtual "Others" pillar from Notion completions across past +
  // current sprints (no future — by definition nothing has happened yet).
  // Each synthetic task carries its real `created_at`, so sprintForTask
  // places it under the correct sprint via the creation-time anchor.
  const [othersPillar, setOthersPillar] = useState<Pillar | null>(null);

  useEffect(() => {
    if (allSprints.length === 0) return;
    let cancelled = false;
    // Tasks already represented elsewhere — skip them when synthesizing
    // from Notion. Includes pillar-assigned rows AND orphan DB rows
    // (pillar_id = null pinned-to-Others tasks), so we don't show the
    // same notion task twice.
    const assigned = new Set<string>();
    for (const p of pillars) {
      for (const t of p.tasks ?? []) {
        if (t.notion_page_id) assigned.add(t.notion_page_id);
      }
    }
    for (const t of orphanTasks) {
      if (t.notion_page_id) assigned.add(t.notion_page_id);
    }
    // Orphan DB tasks are real rows with explicit sprint:N tags. They
    // belong in Others as the "pinned" portion. Include them up-front.
    const fromOrphans: Task[] = orphanTasks.map(t => ({ ...t }));

    fetch("/api/notion/tasks?includeAssigned=true")
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const tasks: Array<{
          id: string; name: string; status: string | null; product: string | null;
          page_url: string; type: string | null; due_date: string | null;
          created_at?: string | null; notion_id?: number | null;
        }> = data.tasks ?? [];
        // Window covers from the very first sprint start (-2d grace) through
        // "today" (real or debug). Future sprints are excluded — by
        // definition there's nothing completed there yet.
        const windowStart = addDays(allSprints[0].start, -2);
        const windowEnd = now;
        const filtered = tasks.filter(t => {
          if (assigned.has(t.id)) return false;
          const s = (t.status ?? "").toLowerCase();
          const isDone = s === "done" || s === "complete" || s === "approved";
          if (!isDone) return false;
          if (!t.created_at) return false;
          const created = new Date(t.created_at);
          if (Number.isNaN(created.getTime())) return false;
          return created >= windowStart && created <= windowEnd;
        });
        const synthesized: Task[] = filtered.map(t => {
          const tags: string[] = [];
          if (t.type) tags.push(t.type);
          if ((t.status ?? "").toLowerCase() === "approved") tags.push("notion:approved");
          // Due date defaults to the end of the sprint that contains
          // creation time, so the bar lands inside the right sprint column.
          const created = new Date(t.created_at!);
          const sIdx = sprintIndexAt(created, allSprints.length);
          const matchingSprint = allSprints.find(s => s.index === sIdx) ?? allSprints[0];
          return {
            id: `others:${t.id}`,
            title: t.name,
            status: "done",
            source: "notion",
            notion_url: t.page_url,
            notion_page_id: t.id,
            product: t.product,
            tags,
            due_date: matchingSprint.end.toISOString(),
            created_at: t.created_at ?? null,
          };
        });
        const allOthers = [...fromOrphans, ...synthesized];
        if (allOthers.length === 0) { setOthersPillar(null); return; }
        setOthersPillar({
          id: "__others__",
          name: "Others",
          color: "#9ca3af",
          icon: null,
          tasks: allOthers,
        });
      })
      .catch(() => { /* swallow */ });
    return () => { cancelled = true; };
  }, [allSprints, pillars, orphanTasks, now]);

  const allPillars = useMemo<Pillar[]>(() => {
    // Show Others whenever any of its synthesized tasks belongs to a sprint
    // currently visible — that way past sprints get their Others bucket too.
    if (!othersPillar) return pillars;
    const hasVisibleTask = (othersPillar.tasks ?? []).some(t => {
      const sprint = sprintForTask(t, allSprints, now);
      return sprint != null && visibleSprints.has(sprint.index);
    });
    return hasVisibleTask ? [...pillars, othersPillar] : pillars;
  }, [pillars, othersPillar, allSprints, visibleSprints, now]);

  // 1) Filter each pillar's tasks to those whose assigned sprint is currently
  //    visible. Tasks without an explicit sprint:N tag fall back to current.
  // 2) When normalized: also drop tasks whose created_at is in the LAST WEEK
  //    of their sprint (planning view, not ongoing).
  const displayPillars = useMemo<Pillar[]>(() => {
    return allPillars.map(p => {
      const filtered = (p.tasks ?? []).filter(t => {
        const sprint = sprintForTask(t, allSprints, now);
        if (!sprint) return false;
        if (!visibleSprints.has(sprint.index)) return false;
        if (normalized) {
          const created = toDate(t.created_at ?? null);
          if (created) {
            const cutoff = addDays(sprint.end, -7);
            // Hide late additions only if they are still open. If a late
            // task is already done/approved, count it — it's real delivery.
            if (created >= cutoff) {
              const state = taskState(t);
              if (state !== "done" && state !== "approved") return false;
            }
          }
        }
        return true;
      });
      const sorted = [...filtered].sort((a, b) => {
        if (sortBy === "completion") {
          // Highest completion first; ties → fall through to id.
          const diff = taskCompletion(b) - taskCompletion(a);
          if (diff !== 0) return diff;
        }
        // "By ID" — ascending Notion auto-id; manual tasks (no notion id) push
        // to the end so the visible #IDs read as a clean sequence.
        const aId = a.notion_page_id ? notionIdMap[a.notion_page_id] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
        const bId = b.notion_page_id ? notionIdMap[b.notion_page_id] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
        if (aId !== bId) return aId - bId;
        return a.id.localeCompare(b.id);
      });
      return { ...p, tasks: sorted };
    });
  }, [allPillars, allSprints, visibleSprints, normalized, sortBy, notionIdMap, now]);

  // Completion % per sprint — weighted average across pillars where each
  // task from a real pillar contributes weight 1, but Others-pillar tasks
  // contribute weight 1/3 (they represent unplanned/auto-collected work and
  // shouldn't dominate the sprint metric just by volume).
  const OTHERS_TASK_WEIGHT = 1 / 3;
  const sprintCompletion = useMemo(() => {
    const map = new Map<number, number>();
    for (const s of allSprints) {
      let weightedSum = 0;
      let weightTotal = 0;
      for (const p of displayPillars) {
        const pillarWeight = p.id === "__others__" ? OTHERS_TASK_WEIGHT : 1;
        for (const t of p.tasks ?? []) {
          if (sprintForTask(t, allSprints, now)?.index !== s.index) continue;
          weightedSum += taskCompletion(t) * pillarWeight;
          weightTotal += pillarWeight;
        }
      }
      map.set(s.index, weightTotal === 0 ? 0 : weightedSum / weightTotal);
    }
    return map;
  }, [allSprints, displayPillars, now]);

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

  // Sprint to which "Add task" pulls in hidden tasks. Prefer the current
  // sprint when it's visible, otherwise the lowest-index visible sprint.
  const targetSprintIdx = useMemo<number | null>(() => {
    if (visibleSprints.size === 0) return null;
    const currentIdx = currentSprintIndex(allSprints.length, now);
    if (visibleSprints.has(currentIdx)) return currentIdx;
    return Math.min(...Array.from(visibleSprints));
  }, [visibleSprints, allSprints.length, now]);

  const [addPanelOpen, setAddPanelOpen] = useState<Set<string>>(new Set());
  function toggleAddPanel(pillarId: string) {
    setAddPanelOpen(prev => {
      const next = new Set(prev);
      next.has(pillarId) ? next.delete(pillarId) : next.add(pillarId);
      return next;
    });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const debugActive = !!debugDate && debugDate !== todayIso;

  return (
    <div className="space-y-4">
      {/* DEBUG: pretend "today" is a different date so the gantt re-computes
          current sprint, Others window, and untagged-task fallback. */}
      <div className={clsx(
        "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs",
        debugActive ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-gray-50 border-gray-200 text-gray-600"
      )}>
        <span className="font-semibold uppercase tracking-wider text-[10px]">Debug · Today =</span>
        <input
          type="date"
          value={debugDate || todayIso}
          onChange={e => setDebugDate(e.target.value)}
          className="text-xs px-2 py-1 rounded border border-gray-200 bg-white focus:outline-none focus:border-indigo-400"
        />
        {debugActive && (
          <button onClick={() => setDebugDate("")}
            className="text-[11px] text-amber-700 hover:text-amber-900 underline">
            Reset to real today ({todayIso})
          </button>
        )}
        <span className="mx-1 text-gray-300">|</span>
        <button
          onClick={() => void pinAutoAssignedToCurrentSprint()}
          disabled={pinningSprint}
          title="Adds an explicit `sprint:N` tag to every auto-assigned task currently shown in the (debug-)current sprint, so they stop migrating forward as today advances."
          className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
          {pinningSprint ? <Loader2 size={11} className="animate-spin" /> : <Pencil size={11} />}
          Pin auto-assigned → Sprint {currentSprintIndex(allSprints.length, now)}
        </button>
        {pinResult && <span className="text-[10px] opacity-80">{pinResult}</span>}
        {debugActive && <span className="text-[10px] opacity-70 ml-auto">⚠️ simulated date — gantt is not in real time</span>}
      </div>

      {/* Sprint selector */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-500">ספרינטים — לחץ/י לשינוי הנוכחי · קליק-ימני לניקוי משימות</p>
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
            const name = sprintDisplayName(s.index);
            const comment = sprintComment(s.index);
            const goals = sprintGoalsList(s.index);
            const hasMeta = !!sprintMeta[s.index]?.name || !!comment || goals.length > 0;
            return (
              <div key={s.index} className="relative inline-flex items-center group/sprint">
                <button
                  onClick={() => toggleSprint(s.index)}
                  onContextMenu={e => { e.preventDefault(); setClearingSprint(s.index); }}
                  title={sprintTooltip(s.index)}
                  className={clsx("inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs border transition-colors",
                    isOn ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                         : "bg-white border-gray-200 text-gray-500 hover:border-gray-300")}>
                  <span className="font-medium max-w-[180px] truncate">{name}</span>
                  <span className="text-[10px] opacity-70 shrink-0">{formatShort(s.start)}–{formatShort(addDays(s.end, -1))}</span>
                  <span className="text-[10px] font-semibold tabular-nums shrink-0">{pct}%</span>
                  {comment && <span className="text-[10px] shrink-0" aria-label="comment">💬</span>}
                  {goals.length > 0 && (
                    <span
                      title={`${goals.length} ${goals.length === 1 ? "goal" : "goals"}`}
                      className="inline-flex items-center justify-center text-[10px] font-semibold rounded-full bg-emerald-100 text-emerald-700 w-4 h-4 shrink-0 tabular-nums">
                      {goals.length}
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => {
                      e.stopPropagation();
                      setEditingMeta({
                        idx: s.index,
                        name: sprintMeta[s.index]?.name ?? "",
                        comment: sprintMeta[s.index]?.comment ?? "",
                        goals: sprintMeta[s.index]?.goals ?? [],
                      });
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingMeta({
                          idx: s.index,
                          name: sprintMeta[s.index]?.name ?? "",
                          comment: sprintMeta[s.index]?.comment ?? "",
                          goals: sprintMeta[s.index]?.goals ?? [],
                        });
                      }
                    }}
                    title="Edit name, comment, and goals"
                    className={clsx(
                      "ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full transition-opacity cursor-pointer",
                      hasMeta ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover/sprint:opacity-60 hover:!opacity-100"
                    )}>
                    <Pencil size={10} />
                  </span>
                </button>
              </div>
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
          {/* Toolbar: collapse/expand all pillars + Normalized */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-white">
            {(() => {
              const anyOpen = displayPillars.some(p => expanded.has(p.id));
              const Icon = anyOpen ? ChevronsDownUp : ChevronsUpDown;
              return (
                <button
                  onClick={() =>
                    setExpanded(anyOpen ? new Set() : new Set(displayPillars.map(p => p.id)))
                  }
                  disabled={displayPillars.length === 0}
                  className="group flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 -mx-1 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                  title={anyOpen ? "סגור הכל" : "פתח הכל"}>
                  <Icon size={14} className="text-gray-400 group-hover:text-gray-700 transition-colors" />
                  <span>{displayPillars.length} פילרים</span>
                </button>
              );
            })()}
            <label className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 cursor-pointer select-none px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
              title="הסתר משימות שנוספו בשבוע האחרון של הספרינט — משקף תכנון, לא Ongoing">
              <input type="checkbox"
                checked={normalized}
                onChange={e => setNormalized(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
              <span>Normalized</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 cursor-pointer select-none px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
              title="הצג צ׳יפים נוספים בשורת המשימה (סוג, מוצר, סטטוס, ספרינט, אחוז סיום)">
              <input type="checkbox"
                checked={detailed}
                onChange={e => setDetailed(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" />
              <span>Detailed</span>
            </label>
            <div className="flex items-center gap-1 text-xs text-gray-500 px-2 py-1 rounded-md select-none">
              <span className="text-gray-400">Sort:</span>
              <button
                onClick={() => setSortBy("id")}
                className={clsx(
                  "px-2 py-0.5 rounded text-[11px] transition-colors",
                  sortBy === "id"
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                    : "text-gray-600 hover:bg-gray-50 border border-transparent"
                )}>
                By ID
              </button>
              <button
                onClick={() => setSortBy("completion")}
                className={clsx(
                  "px-2 py-0.5 rounded text-[11px] transition-colors",
                  sortBy === "completion"
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                    : "text-gray-600 hover:bg-gray-50 border border-transparent"
                )}>
                By Completion (%)
              </button>
            </div>
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
                <div key={s.index} className="col-span-2 border-l border-gray-200 px-3 py-2 text-center" title={sprintTooltip(s.index)}>
                  <div className="text-[11px] text-indigo-600 font-semibold truncate">{sprintDisplayName(s.index)}</div>
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
          {displayPillars.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-400">אין פילרים להצגה</div>
          )}
          {displayPillars.map((pillar, idx) => {
            const allTasks = pillar.tasks ?? [];
            // Counter shows tasks that reached at least 70% completion out of
            // the total. Approved/done count as 100%/80%; In progress with a
            // manual override at 70% also counts.
            const tasksAt70 = allTasks.filter(t => taskCompletion(t) >= 0.7);
            const openTasks = allTasks; // show every task; completion shows via bar/label
            const isOpen = expanded.has(pillar.id);
            const pillarPct = allTasks.length === 0
              ? 0
              : Math.round((allTasks.reduce((acc, t) => acc + taskCompletion(t), 0) / allTasks.length) * 100);
            const pillarHex = pillar.color && pillar.color.startsWith("#") ? pillar.color : "#6366f1";
            return (
              <div key={pillar.id} className="border-b border-gray-100 last:border-0">
                <div onClick={() => toggleExpand(pillar.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(pillar.id); } }}
                  className="w-full grid items-center hover:bg-gray-50 transition-colors cursor-pointer"
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
                    {pillar.id !== "__others__" && targetSprintIdx != null && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (!isOpen) toggleExpand(pillar.id);
                          if (!addPanelOpen.has(pillar.id)) toggleAddPanel(pillar.id);
                        }}
                        title={`הוסף משימה ל-Sprint ${targetSprintIdx}`}
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-colors shrink-0">
                        <Plus size={11} />
                      </button>
                    )}
                    {pillar.id === "__others__" && (
                      <span className="text-[10px] text-gray-400">משימות שהושלמו בספרינט הנוכחי וטרם שויכו</span>
                    )}
                    <span className="text-xs text-gray-400" title="משימות שהגיעו ל-70% ומעלה מתוך כלל המשימות">· {tasksAt70.length}/{allTasks.length}</span>
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
                </div>

                {isOpen && openTasks.length > 0 && (
                  <div>
                    {openTasks.map(task => <TaskRow key={task.id} task={task} sprints={shownSprints} allSprintsCount={sprintCount} totalWeeks={totalWeeks} labelWidth={labelWidth} pillarColor={pillar.color} notionIdMap={notionIdMap} onSetSprint={setTaskSprint} onSetProgress={setTaskProgress} isSyntheticOthers={pillar.id === "__others__"} realPillars={pillars} onAssignPillar={assignOthersTask} detailed={detailed} now={now} />)}
                  </div>
                )}
                {isOpen && openTasks.length === 0 && (
                  <div className="px-12 py-3 text-xs text-gray-400">אין משימות פעילות בפילר זה</div>
                )}

                {isOpen && pillar.id !== "__others__" && targetSprintIdx != null && addPanelOpen.has(pillar.id) && (() => {
                  // Candidate set: every task in this pillar that is NOT
                  // already shown in the active sprint AND whose state is
                  // not done/approved. The user picks which to pull in.
                  const original = allPillars.find(p => p.id === pillar.id);
                  const visibleIds = new Set((pillar.tasks ?? []).map(t => t.id));
                  const candidates = (original?.tasks ?? []).filter(t => {
                    if (visibleIds.has(t.id)) return false;
                    const state = taskState(t);
                    return state !== "done" && state !== "approved";
                  });
                  return (
                    <div className="border-t border-gray-100 bg-gray-50/50">
                      <div className="flex items-center justify-between px-12 py-2">
                        <span className="text-xs text-indigo-700 font-medium">
                          הוסף ל-Sprint {targetSprintIdx}
                          <span className="text-gray-400 font-normal"> · {candidates.length} זמינות</span>
                        </span>
                        <button onClick={() => toggleAddPanel(pillar.id)}
                          className="text-xs text-gray-400 hover:text-gray-700">סגור</button>
                      </div>
                      {candidates.length === 0 ? (
                        <p className="px-12 pb-3 text-xs text-gray-400">אין משימות פתוחות נוספות בפילר זה</p>
                      ) : (
                        <div className="px-12 pb-3 space-y-1">
                          {candidates.map(t => {
                            const tNotionId = t.notion_page_id ? notionIdMap[t.notion_page_id] : undefined;
                            const sIdx = explicitSprintIndex(t.tags ?? null);
                            const isCleared = isSprintCleared(t.tags ?? null);
                            const where = isCleared ? "Cleared" : (sIdx ? `Sprint ${sIdx}` : "—");
                            const tState = taskState(t);
                            const tPct = Math.round(taskCompletion(t) * 100);
                            const tTag = t.tags?.find(tag => !tag.includes(":"));
                            const tDue = toDate(t.due_date ?? null);
                            const tPriority = t.notion_page_id ? notionPriorityMap[t.notion_page_id] : undefined;
                            const meta = [
                              tTag,
                              t.product,
                              STATUS_LABEL[tState] ?? tState,
                              tPriority,
                              `${tPct}%`,
                              tDue ? formatLong(tDue) : null,
                              where,
                            ].filter(Boolean) as string[];
                            return (
                              <button key={t.id}
                                onClick={() => setTaskSprint(t.id, targetSprintIdx)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-600 hover:bg-white border border-transparent hover:border-gray-200 transition-colors text-right group/cand">
                                {tNotionId != null && (
                                  <span className="text-[10px] font-mono text-gray-400 tabular-nums shrink-0 w-10 text-left">#{tNotionId}</span>
                                )}
                                <span className="flex-1 truncate text-gray-700">{t.title}</span>
                                <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
                                  {meta.join(" · ")}
                                </span>
                                <Plus size={11} className="text-indigo-500 shrink-0 opacity-40 group-hover/cand:opacity-100" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {editingMeta != null && (
        <SprintMetaEditor
          idx={editingMeta.idx}
          initialName={editingMeta.name}
          initialComment={editingMeta.comment}
          initialGoals={editingMeta.goals}
          defaultName={defaultSprintName(editingMeta.idx)}
          onClose={() => setEditingMeta(null)}
          onSave={async (name, comment, goals) => {
            await saveSprintMeta(editingMeta.idx, name, comment, goals);
            setEditingMeta(null);
          }}
        />
      )}

      {clearingSprint != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !clearBusy && setClearingSprint(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              לנקות את Sprint {clearingSprint}?
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              כל המשימות שמשויכות ל-Sprint {clearingSprint} יוסרו ממנו.
              הן <strong>לא</strong> יחזרו אוטומטית לספרינט הנוכחי —
              יוצגו רק אחרי שיוך ידני מחדש (S{clearingSprint} בשורה של כל משימה).
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setClearingSprint(null)}
                disabled={clearBusy}
                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50">
                ביטול
              </button>
              <button onClick={() => clearSprint(clearingSprint)}
                disabled={clearBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50">
                {clearBusy && <Loader2 size={12} className="animate-spin" />}
                נקה ספרינט
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, sprints, allSprintsCount, totalWeeks, labelWidth, pillarColor, notionIdMap, onSetSprint, onSetProgress, isSyntheticOthers, realPillars, onAssignPillar, detailed, now }: {
  task: Task;
  sprints: Sprint[];
  allSprintsCount: number;
  totalWeeks: number;
  labelWidth: number;
  pillarColor?: string;
  notionIdMap: Record<string, number>;
  onSetSprint: (taskId: string, sprintIdx: number | null) => Promise<void>;
  onSetProgress: (taskId: string, pct: number | null) => Promise<void>;
  isSyntheticOthers: boolean;
  realPillars: Pillar[];
  onAssignPillar: (notionPageId: string, pillarId: string | null) => Promise<void>;
  detailed: boolean;
  now: Date;
}) {
  const notionId = task.notion_page_id ? notionIdMap[task.notion_page_id] : undefined;
  const targetSprint = sprintForTask(task, sprints, now);
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
  const tag = task.tags?.find(t => !t.includes(":"));
  const taskSprintIdx = explicitSprintIndex(task.tags ?? null) ?? (() => {
    // Same anchor-to-creation-time logic as sprintForTask — keep the chip
    // consistent with the row's actual placement on the chart.
    const c = task.created_at ? new Date(task.created_at) : null;
    return sprintIndexAt((c && !Number.isNaN(c.getTime())) ? c : now, sprints.length);
  })();

  return (
    <div
      className={clsx("grid items-center hover:bg-gray-50 transition-colors cursor-default", isComplete && "opacity-60")}
      style={{ gridTemplateColumns: `${labelWidth}px repeat(${totalWeeks}, minmax(48px, 1fr))` }}
      onDoubleClick={openInNotion}
      onContextMenu={e => { if (task.notion_url) { e.preventDefault(); openInNotion(); } }}
      title={task.notion_url ? "Double/right click to open in Notion" : undefined}
    >
      <div className="px-4 py-2.5 pl-10 flex items-center gap-2 min-w-0">
        {notionId != null && (
          <span className="text-[10px] font-mono text-gray-400 shrink-0 tabular-nums">#{notionId}</span>
        )}
        <span className="relative group/title flex-1 min-w-0">
          <span className={clsx("block text-sm truncate", isComplete ? "text-gray-400 line-through" : "text-gray-700")}>
            {task.title}
          </span>
          <span className="pointer-events-none absolute top-full left-0 mt-1 z-30 hidden group-hover/title:block max-w-md whitespace-normal break-words rounded-lg bg-gray-900 text-white text-xs px-3 py-2 shadow-lg leading-snug">
            {task.title}
          </span>
        </span>
        {detailed && tag && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 capitalize shrink-0">
            {tag}
          </span>
        )}
        {detailed && task.product && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
            {task.product}
          </span>
        )}
        {detailed && (
          <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border shrink-0", STATUS_STYLE[state] ?? STATUS_STYLE.todo)}>
            {STATUS_LABEL[state] ?? state}
          </span>
        )}
        {detailed && !isSyntheticOthers && (
          <SprintPicker
            current={taskSprintIdx}
            count={allSprintsCount}
            onPick={idx => onSetSprint(task.id, idx)}
          />
        )}
        {isSyntheticOthers && task.notion_page_id && (
          <PillarMenu
            current={undefined}
            pillars={realPillars}
            onPick={pid => onAssignPillar(task.notion_page_id!, pid)}
            allowUnassign={false}
          />
        )}
        {detailed && state === "in_progress" && (
          <ProgressPicker
            current={completionPct}
            hasOverride={progressOverride(task.tags ?? null) != null}
            onPick={pct => onSetProgress(task.id, pct)}
          />
        )}
        {detailed && state !== "in_progress" && (
          <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">{completionPct}%</span>
        )}
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

// In-progress tasks expose a discrete % picker. Allowed values 30..70 in
// steps of 10 — anything outside that range belongs to a different status
// (todo 0, done 80, approved 100).
const PROGRESS_OPTIONS = [30, 40, 50, 60, 70] as const;

function ProgressPicker({ current, hasOverride, onPick }: {
  current: number;
  hasOverride: boolean;
  onPick: (pct: number | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENU_W = 110;
  const ROW_H = 28;
  const MENU_H = PROGRESS_OPTIONS.length * ROW_H + 8;

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

  async function pick(pct: number) {
    if (pct === current && hasOverride) { setOpen(false); return; }
    setBusy(true);
    try { await onPick(pct); } finally { setBusy(false); setOpen(false); }
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
      onClick={e => e.stopPropagation()}
    >
      {PROGRESS_OPTIONS.map(n => (
        <button key={n} onClick={() => pick(n)} disabled={busy}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-right disabled:opacity-50">
          <span className="tabular-nums">{n}%</span>
          {n === current && hasOverride && <Check size={12} className="text-indigo-500" />}
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
        className={clsx(
          "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border tabular-nums shrink-0 transition-colors",
          hasOverride
            ? "bg-indigo-50 border-indigo-200 text-indigo-700 hover:border-indigo-400"
            : "border-gray-200 text-gray-600 hover:border-gray-400"
        )}
        title="לחץ כדי לערוך אחוז התקדמות (זמין רק למשימות In progress)">
        {current}%
        {busy ? <Loader2 size={9} className="animate-spin" /> : <ChevronDown size={9} className="opacity-60" />}
      </button>
      {typeof window !== "undefined" && menu && createPortal(menu, document.body)}
    </>
  );
}

const GOAL_PCT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

function SprintMetaEditor({ idx, initialName, initialComment, initialGoals, defaultName, onClose, onSave }: {
  idx: number;
  initialName: string;
  initialComment: string;
  initialGoals: SprintGoal[];
  defaultName: string;
  onClose: () => void;
  onSave: (name: string, comment: string, goals: SprintGoal[]) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [comment, setComment] = useState(initialComment);
  const [goals, setGoals] = useState<SprintGoal[]>(initialGoals.length > 0 ? initialGoals : []);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  function updateGoal(i: number, patch: Partial<SprintGoal>) {
    setGoals(prev => prev.map((g, j) => j === i ? { ...g, ...patch } : g));
  }
  function addGoal() {
    setGoals(prev => [...prev, { text: "", completion: 10 }]);
  }
  function removeGoal(i: number) {
    setGoals(prev => prev.filter((_, j) => j !== i));
  }

  async function commit() {
    setBusy(true);
    try {
      const cleanedGoals = goals
        .map(g => ({ text: g.text.trim(), completion: Math.max(0, Math.min(100, Math.round(g.completion))) }))
        .filter(g => g.text.length > 0);
      await onSave(name.trim(), comment.trim(), cleanedGoals);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-gray-900">Edit Sprint {idx}</h3>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Sprint metadata</span>
        </div>
        <p className="text-xs text-gray-500 mb-5">The sprint date range stays visible under the name.</p>

        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); void commit(); }
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }}
          placeholder={defaultName}
          className="w-full px-3 py-2 mb-4 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
        />

        <label className="block text-xs font-medium text-gray-600 mb-1">Comment</label>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
          placeholder="Free-text note (shows in tooltip)"
          rows={2}
          className="w-full px-3 py-2 mb-5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none"
        />

        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-600">Goals</label>
          <span className="text-[10px] text-gray-400">{goals.length} {goals.length === 1 ? "goal" : "goals"}</span>
        </div>
        <div className="space-y-2 mb-3">
          {goals.length === 0 && (
            <div className="text-xs text-gray-400 italic px-1">No goals yet. Add one to track progress for this sprint.</div>
          )}
          {goals.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={g.text}
                onChange={e => updateGoal(i, { text: e.target.value })}
                placeholder={`Goal ${i + 1}`}
                className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
              />
              <select
                value={g.completion}
                onChange={e => updateGoal(i, { completion: Number(e.target.value) })}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-indigo-400 cursor-pointer tabular-nums">
                {GOAL_PCT_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>
              <button
                onClick={() => removeGoal(i)}
                title="Remove goal"
                className="text-gray-300 hover:text-red-500 transition-colors px-1">
                <Minus size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addGoal}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium mb-5">
          <Plus size={12} /> Add goal
        </button>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => void commit()} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50">
            {busy && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SprintPicker({ current, count, onPick }: {
  current: number;
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
      onClick={e => e.stopPropagation()}
    >
      {Array.from({ length: count }, (_, i) => i + 1).map(n => (
        <button key={n} onClick={() => pick(n)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-right">
          <span>Sprint {n}</span>
          {n === current && <Check size={12} className="text-indigo-500" />}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button ref={triggerRef} onClick={toggle}
        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors shrink-0"
        title={`Sprint ${current} — לחיצה כדי לשנות`}>
        S{current}
        {busy ? <Loader2 size={9} className="animate-spin" /> : <ChevronDown size={9} className="opacity-60" />}
      </button>
      {typeof window !== "undefined" && menu && createPortal(menu, document.body)}
    </>
  );
}
