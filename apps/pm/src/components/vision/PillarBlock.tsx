"use client";
import { useEffect, useState } from "react";
import { Trash2, Plus, Loader2, ExternalLink, Check, RefreshCw } from "lucide-react";
import InlineEdit from "@/components/ui/InlineEdit";
import NotionTaskPicker from "@/components/vision/NotionTaskPicker";
import clsx from "clsx";

type Task = {
  id: string; title: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  source: "manual" | "notion"; notion_url?: string;
  notion_page_id?: string | null;
  assignee?: string; sprint_name?: string; tags?: string[];
  product?: string | null;
};

import { loadNotionIdMap } from "@/lib/notion-id-map";

type Pillar = {
  id: string; name: string; color?: string; icon?: string;
  what_it_means?: string; our_advantage?: string; success_metrics?: string;
  tasks?: Task[];
};

const STATUS_COLOR = {
  todo: "bg-gray-100 text-gray-500",
  in_progress: "bg-indigo-100 text-indigo-600",
  done: "bg-emerald-100 text-emerald-600",
  blocked: "bg-red-100 text-red-500",
};

const TYPE_STYLE: Record<string, string> = {
  bug: "bg-red-100 text-red-600 border border-red-200",
  feature: "bg-indigo-100 text-indigo-600 border border-indigo-200",
  production: "bg-amber-100 text-amber-600 border border-amber-200",
  research: "bg-emerald-100 text-emerald-600 border border-emerald-200",
  "tech depth": "bg-purple-100 text-purple-600 border border-purple-200",
};

function resolveColor(color?: string): string {
  const map: Record<string, string> = {
    indigo: "#6366f1", emerald: "#10b981", amber: "#f59e0b",
    red: "#ef4444", sky: "#0ea5e9", purple: "#8b5cf6", pink: "#ec4899", gray: "#6b7280",
  };
  if (!color) return "#6366f1";
  if (color.startsWith("#")) return color;
  return map[color] ?? "#6366f1";
}

export default function PillarBlock({ pillar, index, onUpdate, onDelete }: {
  pillar: Pillar; index: number;
  onUpdate: (u: Partial<Pillar>) => void;
  onDelete: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>(pillar.tasks ?? []);
  const [newTask, setNewTask] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showNotionPicker, setShowNotionPicker] = useState(false);
  const [statusView, setStatusView] = useState<"all" | "active" | "done">("all");
  const [notionIdMap, setNotionIdMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    loadNotionIdMap().then(map => { if (!cancelled) setNotionIdMap(map); });
    return () => { cancelled = true; };
  }, []);

  async function reloadTasks() {
    const res = await fetch(`/api/pillars/${pillar.id}/tasks`);
    const data = await res.json();
    setTasks(data.tasks ?? []);
  }

  // Always fetch fresh tasks when mounted (handles pillar switch + import refresh)
  useEffect(() => {
    reloadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillar.id]);

  const done = tasks.filter(t => t.status === "done").length;
  const active = tasks.length - done;

  const sortedTasks = [...tasks].sort((a, b) => {
    const aCreated = (a as Task & { created_at?: string }).created_at ?? "";
    const bCreated = (b as Task & { created_at?: string }).created_at ?? "";
    return aCreated.localeCompare(bCreated);
  });
  const visibleTasks = sortedTasks.filter(t => {
    if (statusView === "active") return t.status !== "done";
    if (statusView === "done") return t.status === "done";
    return true;
  });
  const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const hex = resolveColor(pillar.color);

  async function addTask() {
    if (!newTask.trim()) return;
    setAddingTask(true);
    const res = await fetch(`/api/pillars/${pillar.id}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTask.trim(), status: "todo" }),
    });
    const data = await res.json();
    setTasks(prev => [data.task, ...prev]);
    setNewTask("");
    setAddingTask(false);
  }

  async function toggleTask(task: Task) {
    const next = task.status === "done" ? "todo" : "done";
    await fetch(`/api/pillars/${pillar.id}/tasks/${task.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t));
  }

  async function deleteTask(id: string) {
    await fetch(`/api/pillars/${pillar.id}/tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100" style={{ borderLeftColor: hex, borderLeftWidth: 4 }}>
        <InlineEdit value={pillar.icon} placeholder="🎯" onSave={v => onUpdate({ icon: v })}
          textClassName="text-2xl" className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 font-mono">PILLAR {String(index + 1).padStart(2, "0")}</p>
          <InlineEdit value={pillar.name} placeholder="Pillar name" onSave={v => onUpdate({ name: v })}
            textClassName="text-xl font-bold text-gray-900" />
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-xs text-gray-400">{active}/{tasks.length} tasks</p>
            <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: hex }} />
            </div>
          </div>
          <button onClick={() => { setDeleting(true); onDelete(); }} disabled={deleting}
            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-400 transition-colors">
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* 3 Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { key: "what_it_means", label: "מה זה אומר", placeholder: "Describe what this pillar means..." },
            { key: "our_advantage", label: "היתרון שלנו", placeholder: "What is our unique advantage..." },
            { key: "success_metrics", label: "מדדי הצלחה", placeholder: "How do we measure success..." },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="rounded-xl bg-gray-50 border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 mb-2 text-right">{label}</p>
              <InlineEdit
                value={(pillar as unknown as Record<string, string | undefined>)[key]}
                placeholder={placeholder}
                onSave={v => onUpdate({ [key]: v })}
                textClassName="text-sm text-gray-700 leading-relaxed text-right"
                multiline
              />
            </div>
          ))}
        </div>

        {/* Tasks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">משימות</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {([
                  { key: "all", label: "All", count: tasks.length },
                  { key: "active", label: "Active", count: active },
                  { key: "done", label: "Done", count: done },
                ] as const).map(opt => (
                  <button key={opt.key} onClick={() => setStatusView(opt.key)}
                    className={clsx("px-2.5 py-1 rounded-md text-xs transition-colors",
                      statusView === opt.key
                        ? "bg-white text-gray-800 shadow-sm"
                        : "text-gray-500 hover:text-gray-700")}>
                    {opt.label} <span className="text-gray-400">{opt.count}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowNotionPicker(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 text-xs rounded-lg transition-colors">
                <RefreshCw size={12} /> Import from Notion
              </button>
            </div>
          </div>

          {visibleTasks.length === 0 && tasks.length > 0 && (
            <p className="text-xs text-gray-400 px-3 py-4 text-center">
              {statusView === "active" ? "אין משימות פעילות" : statusView === "done" ? "אין משימות שהושלמו" : "אין משימות"}
            </p>
          )}

          {visibleTasks.map(task => {
            const openNotion = () => {
              if (task.notion_url) window.open(task.notion_url, "_blank", "noopener,noreferrer");
            };
            const notionId = task.notion_page_id ? notionIdMap[task.notion_page_id] : undefined;
            return (
            <div key={task.id} className="flex items-center gap-2 group/task px-3 py-2 rounded-lg hover:bg-gray-50"
              onDoubleClick={openNotion}
              onContextMenu={e => {
                if (task.notion_url) {
                  e.preventDefault();
                  openNotion();
                }
              }}
              title={task.notion_url ? "Double-click or right-click to open in Notion" : undefined}>
              <button onClick={() => toggleTask(task)}
                className={clsx("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  task.status === "done" ? "border-emerald-500 bg-emerald-500" : "border-gray-300 hover:border-indigo-400"
                )}>
                {task.status === "done" && <Check size={11} className="text-white" />}
              </button>
              {notionId != null && (
                <span className="text-[10px] font-mono text-gray-400 shrink-0 tabular-nums">#{notionId}</span>
              )}
              <span className={clsx("flex-1 text-sm", task.status === "done" ? "line-through text-gray-400" : "text-gray-700")}>
                {task.title}
              </span>
              {task.source === "notion" && task.notion_url && (
                <a href={task.notion_url} target="_blank" rel="noopener noreferrer"
                  className="opacity-0 group-hover/task:opacity-40 text-gray-400 hover:text-gray-700">
                  <ExternalLink size={12} />
                </a>
              )}
              {/* Product badge */}
              {task.product && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-sky-100 text-sky-600 border border-sky-200 whitespace-nowrap">
                  {task.product}
                </span>
              )}
              {/* Type badge */}
              {task.tags?.[0] && (
                <span className={clsx("text-xs px-1.5 py-0.5 rounded capitalize", TYPE_STYLE[task.tags[0].toLowerCase()] ?? "bg-gray-100 text-gray-500")}>
                  {task.tags[0]}
                </span>
              )}
              <span className={clsx("text-xs px-1.5 py-0.5 rounded", STATUS_COLOR[task.status])}>
                {task.status.replace("_", " ")}
              </span>
              {task.source === "notion" && <span className="text-xs bg-indigo-50 text-indigo-400 border border-indigo-100 px-1.5 py-0.5 rounded">N</span>}
              <button onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover/task:opacity-100 p-1 hover:text-red-400 text-gray-300 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
            );
          })}

          <div className="flex gap-2 mt-2">
            <input value={newTask} onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()}
              placeholder="+ הוסף משימה..."
              className="flex-1 bg-gray-50 border border-gray-200 focus:border-indigo-400 rounded-lg px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
            />
            <button onClick={addTask} disabled={addingTask || !newTask.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors">
              {addingTask ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>
        </div>
      </div>

      {showNotionPicker && (
        <NotionTaskPicker pillarId={pillar.id} pillarName={pillar.name} onClose={() => setShowNotionPicker(false)} onDone={reloadTasks} />
      )}
    </div>
  );
}
