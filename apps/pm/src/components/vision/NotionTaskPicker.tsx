"use client";
import { useState, useEffect } from "react";
import { X, Search, Loader2, Check, ExternalLink, SlidersHorizontal, ChevronUp } from "lucide-react";
import clsx from "clsx";

type NotionTask = {
  id: string; name: string; type: string | null;
  status: string | null; priority: string | null; product: string | null;
  sprint: string | null; assignee: string | null; page_url: string;
  notion_id?: number | null;
  created_at?: string;
};

const TYPE_STYLE: Record<string, string> = {
  bug: "bg-red-900/50 text-red-300 border-red-700/50",
  feature: "bg-indigo-900/50 text-indigo-300 border-indigo-700/50",
  production: "bg-amber-900/50 text-amber-300 border-amber-700/50",
  research: "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
  "tech depth": "bg-purple-900/50 text-purple-300 border-purple-700/50",
};

const PRIORITY_STYLE: Record<string, string> = {
  urgent: "bg-rose-900/50 text-rose-300 border-rose-700/50",
  high: "bg-red-900/50 text-red-300 border-red-700/50",
  medium: "bg-amber-900/50 text-amber-300 border-amber-700/50",
  low: "bg-sky-900/50 text-sky-300 border-sky-700/50",
};

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0, high: 1, medium: 2, low: 3,
};

const STATUS_STYLE: Record<string, string> = {
  "to-do": "bg-gray-800/60 text-gray-300 border-gray-600/50",
  "todo": "bg-gray-800/60 text-gray-300 border-gray-600/50",
  "backlog": "bg-stone-800/60 text-stone-300 border-stone-600/50",
  "not started": "bg-slate-800/60 text-slate-300 border-slate-600/50",
  "in progress": "bg-blue-900/50 text-blue-300 border-blue-700/50",
  "blocked": "bg-red-900/50 text-red-300 border-red-700/50",
  "done": "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
  "complete": "bg-emerald-900/50 text-emerald-300 border-emerald-700/50",
  "approved": "bg-violet-900/50 text-violet-300 border-violet-700/50",
};

const STATUS_ORDER: Record<string, number> = {
  "to-do": 0, "todo": 0, "backlog": 1, "not started": 2,
  "in progress": 3, "blocked": 4, "done": 5, "complete": 6, "approved": 7,
};

const NONE_VALUE = "__NONE__";

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
}

function matches(filter: string[], value: string | null): boolean {
  if (filter.length === 0) return true;
  if (value === null) return filter.includes(NONE_VALUE);
  return filter.includes(value);
}

export default function NotionTaskPicker({ pillarId, pillarName, onClose, onDone }: {
  pillarId: string;
  pillarName?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tasks, setTasks] = useState<NotionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [sinceDate, setSinceDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  useEffect(() => {
    fetch("/api/notion/tasks")
      .then(r => r.json())
      .then(d => { setTasks(d.tasks ?? []); setLoading(false); });
  }, []);

  // Load saved filters for this pillar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`notion-filters:${pillarId}`);
      if (raw) {
        const f = JSON.parse(raw);
        const asArr = (v: unknown): string[] =>
          Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
            : typeof v === "string" ? [v] : [];
        setTypeFilter(asArr(f.type));
        setPriorityFilter(asArr(f.priority));
        setStatusFilter(asArr(f.status));
        setProductFilter(asArr(f.product));
        setSinceDate(typeof f.since === "string" ? f.since : "");
      }
    } catch {
      // ignore malformed storage
    }
    setFiltersHydrated(true);
  }, [pillarId]);

  // Persist filters per pillar (only after hydration so we don't overwrite with defaults)
  useEffect(() => {
    if (!filtersHydrated) return;
    const payload = {
      type: typeFilter, priority: priorityFilter, status: statusFilter,
      product: productFilter, since: sinceDate,
    };
    try {
      localStorage.setItem(`notion-filters:${pillarId}`, JSON.stringify(payload));
    } catch {
      // storage unavailable — skip
    }
  }, [filtersHydrated, pillarId, typeFilter, priorityFilter, statusFilter, productFilter, sinceDate]);

  const labelForValue = (v: string) => v === NONE_VALUE ? "None" : v;

  const activeFilters: { label: string; value: string; clear: () => void; style?: string }[] = [];
  typeFilter.forEach(v => activeFilters.push({
    label: "Type", value: labelForValue(v),
    clear: () => setTypeFilter(prev => prev.filter(x => x !== v)),
    style: v === NONE_VALUE ? undefined : TYPE_STYLE[v.toLowerCase()],
  }));
  priorityFilter.forEach(v => activeFilters.push({
    label: "Priority", value: labelForValue(v),
    clear: () => setPriorityFilter(prev => prev.filter(x => x !== v)),
    style: v === NONE_VALUE ? undefined : PRIORITY_STYLE[v.toLowerCase()],
  }));
  productFilter.forEach(v => activeFilters.push({
    label: "Product", value: labelForValue(v),
    clear: () => setProductFilter(prev => prev.filter(x => x !== v)),
    style: v === NONE_VALUE ? undefined : "bg-sky-900/50 text-sky-300 border-sky-700/50",
  }));
  statusFilter.forEach(v => activeFilters.push({
    label: "Status", value: labelForValue(v),
    clear: () => setStatusFilter(prev => prev.filter(x => x !== v)),
    style: v === NONE_VALUE ? undefined : STATUS_STYLE[v.toLowerCase()],
  }));
  if (sinceDate) activeFilters.push({ label: "Since", value: sinceDate, clear: () => setSinceDate("") });

  function clearAllFilters() {
    setTypeFilter([]);
    setPriorityFilter([]);
    setStatusFilter([]);
    setProductFilter([]);
    setSinceDate("");
  }

  const types = Array.from(new Set(tasks.map(t => t.type).filter(Boolean))) as string[];
  const statuses = (Array.from(new Set(tasks.map(t => t.status).filter(Boolean))) as string[])
    .sort((a, b) => (STATUS_ORDER[a.toLowerCase()] ?? 99) - (STATUS_ORDER[b.toLowerCase()] ?? 99));
  const priorities = Array.from(new Set(tasks.map(t => t.priority).filter(Boolean)) as Set<string>)
    .sort((a, b) => (PRIORITY_ORDER[a.toLowerCase()] ?? 99) - (PRIORITY_ORDER[b.toLowerCase()] ?? 99));
  const products = (Array.from(new Set(tasks.map(t => t.product).filter(Boolean))) as string[])
    .sort((a, b) => a.localeCompare(b));

  const hasTypeNone = tasks.some(t => !t.type);
  const hasPriorityNone = tasks.some(t => !t.priority);
  const hasStatusNone = tasks.some(t => !t.status);
  const hasProductNone = tasks.some(t => !t.product);

  const searchTrimmed = search.trim();
  const idQuery = (() => {
    const cleaned = searchTrimmed.replace(/^#/, "").trim();
    if (cleaned === "" || !/^\d+$/.test(cleaned)) return null;
    return cleaned;
  })();

  const filtered = tasks.filter(t => {
    // ID search bypasses every other filter — you know exactly which task you want
    if (idQuery !== null) {
      return t.notion_id != null && String(t.notion_id).includes(idQuery);
    }
    const matchSearch = searchTrimmed.length === 0
      || t.name.toLowerCase().includes(searchTrimmed.toLowerCase());
    const matchType = matches(typeFilter, t.type);
    const matchPriority = matches(priorityFilter, t.priority);
    const matchStatus = matches(statusFilter, t.status);
    const matchProduct = matches(productFilter, t.product);
    const matchDate = !sinceDate || (t as any).created_at >= sinceDate;
    return matchSearch && matchType && matchPriority && matchStatus && matchProduct && matchDate;
  });

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function sync() {
    setSaving(true);
    await fetch(`/api/pillars/${pillarId}/sync-notion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notionTaskIds: Array.from(selected) }),
    });
    setSaving(false);
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-semibold">
              {pillarName ? `${pillarName}: ` : ""}Import from Notion
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{selected.size} selected</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400"><X size={16} /></button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-800 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by title or #ID…" autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500" />
          </div>

          {/* Collapsed summary bar */}
          {!filtersOpen && (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setFiltersOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-gray-700 text-gray-300 hover:border-gray-500 hover:bg-gray-800 transition-colors">
                <SlidersHorizontal size={12} />
                {activeFilters.length > 0 ? `Filters (${activeFilters.length})` : "Filters"}
              </button>
              {activeFilters.map(f => (
                <span key={`${f.label}:${f.value}`}
                  className={clsx("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border capitalize",
                    f.style ?? "border-gray-700 text-gray-400")}>
                  <span className="text-[10px] opacity-70 normal-case">{f.label}:</span>
                  {f.value}
                  <button onClick={f.clear}
                    className="opacity-60 hover:opacity-100 ml-0.5"
                    aria-label={`Clear ${f.label}`}>
                    <X size={10} />
                  </button>
                </span>
              ))}
              {activeFilters.length > 0 && (
                <button onClick={clearAllFilters}
                  className="text-xs text-gray-500 hover:text-gray-300 underline-offset-2 hover:underline">
                  clear all
                </button>
              )}
            </div>
          )}

          {/* Expanded: full filters */}
          {filtersOpen && (
            <>

          {/* Type filter */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-gray-600">Type:</span>
            <button onClick={() => setTypeFilter([])}
              className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors",
                typeFilter.length === 0 ? "bg-indigo-600 text-white border-indigo-500" : "border-gray-700 text-gray-400 hover:border-gray-500")}>
              All
            </button>
            {types.map(t => (
              <button key={t} onClick={() => setTypeFilter(prev => toggleInArray(prev, t))}
                className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors capitalize",
                  typeFilter.includes(t) ? "bg-indigo-600 text-white border-indigo-500"
                    : (TYPE_STYLE[t.toLowerCase()] ?? "border-gray-700 text-gray-400"))}>
                {t}
              </button>
            ))}
            {hasTypeNone && (
              <button onClick={() => setTypeFilter(prev => toggleInArray(prev, NONE_VALUE))}
                className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors italic",
                  typeFilter.includes(NONE_VALUE) ? "bg-indigo-600 text-white border-indigo-500" : "border-dashed border-gray-700 text-gray-500 hover:border-gray-500")}>
                None
              </button>
            )}
          </div>

          {/* Priority filter */}
          {(priorities.length > 0 || hasPriorityNone) && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-gray-600">Priority:</span>
              <button onClick={() => setPriorityFilter([])}
                className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors",
                  priorityFilter.length === 0 ? "bg-indigo-600 text-white border-indigo-500" : "border-gray-700 text-gray-400 hover:border-gray-500")}>
                All
              </button>
              {priorities.map(p => (
                <button key={p} onClick={() => setPriorityFilter(prev => toggleInArray(prev, p))}
                  className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors capitalize",
                    priorityFilter.includes(p) ? "bg-indigo-600 text-white border-indigo-500"
                      : (PRIORITY_STYLE[p.toLowerCase()] ?? "border-gray-700 text-gray-400"))}>
                  {p}
                </button>
              ))}
              {hasPriorityNone && (
                <button onClick={() => setPriorityFilter(prev => toggleInArray(prev, NONE_VALUE))}
                  className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors italic",
                    priorityFilter.includes(NONE_VALUE) ? "bg-indigo-600 text-white border-indigo-500" : "border-dashed border-gray-700 text-gray-500 hover:border-gray-500")}>
                  None
                </button>
              )}
            </div>
          )}

          {/* Product filter */}
          {(products.length > 0 || hasProductNone) && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-gray-600">Product:</span>
              <button onClick={() => setProductFilter([])}
                className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors",
                  productFilter.length === 0 ? "bg-indigo-600 text-white border-indigo-500" : "border-gray-700 text-gray-400 hover:border-gray-500")}>
                All
              </button>
              {products.map(p => (
                <button key={p} onClick={() => setProductFilter(prev => toggleInArray(prev, p))}
                  className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors",
                    productFilter.includes(p) ? "bg-indigo-600 text-white border-indigo-500"
                      : "bg-sky-900/50 text-sky-300 border-sky-700/50 hover:border-sky-500")}>
                  {p}
                </button>
              ))}
              {hasProductNone && (
                <button onClick={() => setProductFilter(prev => toggleInArray(prev, NONE_VALUE))}
                  className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors italic",
                    productFilter.includes(NONE_VALUE) ? "bg-indigo-600 text-white border-indigo-500" : "border-dashed border-gray-700 text-gray-500 hover:border-gray-500")}>
                  None
                </button>
              )}
            </div>
          )}

          {/* Status filter */}
          {(statuses.length > 0 || hasStatusNone) && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-gray-600">Status:</span>
              <button onClick={() => setStatusFilter([])}
                className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors",
                  statusFilter.length === 0 ? "bg-indigo-600 text-white border-indigo-500" : "border-gray-700 text-gray-400 hover:border-gray-500")}>
                All
              </button>
              {statuses.map(s => (
                <button key={s} onClick={() => setStatusFilter(prev => toggleInArray(prev, s))}
                  className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors capitalize",
                    statusFilter.includes(s) ? "bg-indigo-600 text-white border-indigo-500"
                      : (STATUS_STYLE[s.toLowerCase()] ?? "border-gray-700 text-gray-400"))}>
                  {s}
                </button>
              ))}
              {hasStatusNone && (
                <button onClick={() => setStatusFilter(prev => toggleInArray(prev, NONE_VALUE))}
                  className={clsx("px-2.5 py-1 rounded-full text-xs border transition-colors italic",
                    statusFilter.includes(NONE_VALUE) ? "bg-indigo-600 text-white border-indigo-500" : "border-dashed border-gray-700 text-gray-500 hover:border-gray-500")}>
                  None
                </button>
              )}
            </div>
          )}

          {/* Date filter */}
          <div className="flex gap-3 items-center flex-wrap">
            <span className="text-xs text-gray-600">Created after:</span>
            <input type="date" value={sinceDate} onChange={e => setSinceDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500" />
            {sinceDate && (
              <button onClick={() => setSinceDate("")} className="text-xs text-gray-500 hover:text-gray-300">✕ clear</button>
            )}
          </div>

          {/* Collapse controls */}
          <div className="flex items-center justify-between pt-1">
            {activeFilters.length > 0 ? (
              <button onClick={clearAllFilters}
                className="text-xs text-gray-500 hover:text-gray-300">
                clear all
              </button>
            ) : <span />}
            <button onClick={() => setFiltersOpen(false)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
              <ChevronUp size={12} /> Done
            </button>
          </div>
            </>
          )}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
              <Loader2 size={18} className="animate-spin" /> Loading from Notion…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-600">No tasks found</div>
          ) : (
            filtered.map(task => (
              <div key={task.id} onClick={() => toggle(task.id)}
                className={clsx("flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors",
                  selected.has(task.id) ? "bg-indigo-950/50 border border-indigo-500/40" : "hover:bg-gray-800 border border-transparent")}>
                {/* Checkbox */}
                <div className={clsx("mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
                  selected.has(task.id) ? "bg-indigo-500 border-indigo-500" : "border-gray-600")}>
                  {selected.has(task.id) && <Check size={10} className="text-white" />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 leading-snug">
                    {task.notion_id != null && (
                      <span className="text-[10px] font-mono text-gray-500 mr-1.5 align-middle">#{task.notion_id}</span>
                    )}
                    {task.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {task.type && (
                      <span className={clsx("text-xs px-1.5 py-0.5 rounded border capitalize",
                        TYPE_STYLE[task.type.toLowerCase()] ?? "border-gray-700 text-gray-400")}>
                        {task.type}
                      </span>
                    )}
                    {task.priority && (
                      <span className={clsx("text-xs px-1.5 py-0.5 rounded border capitalize",
                        PRIORITY_STYLE[task.priority.toLowerCase()] ?? "border-gray-700 text-gray-400")}>
                        {task.priority}
                      </span>
                    )}
                    {task.product && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-sky-900/60 text-sky-300 border border-sky-700/40">
                        {task.product}
                      </span>
                    )}
                    {task.sprint && <span className="text-xs text-gray-600">{task.sprint}</span>}
                    {task.status && (
                      <span className={clsx("text-xs px-1.5 py-0.5 rounded border capitalize",
                        STATUS_STYLE[task.status.toLowerCase()] ?? "border-gray-700 text-gray-400")}>
                        {task.status}
                      </span>
                    )}
                  </div>
                </div>

                <a href={task.page_url} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="p-1 hover:text-white text-gray-600 shrink-0 mt-0.5">
                  <ExternalLink size={12} />
                </a>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-between">
          <p className="text-sm text-gray-500">{filtered.length} tasks shown</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg">
              Cancel
            </button>
            <button onClick={sync} disabled={selected.size === 0 || saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Add {selected.size > 0 ? `${selected.size} tasks` : "tasks"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
