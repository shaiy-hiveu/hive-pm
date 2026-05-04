"use client";
import { useEffect, useState } from "react";
import { NotionTask, Product } from "@/types";
import { ExternalLink, Bug, Sparkles, CheckCircle2, Clock } from "lucide-react";

type Props = { product: Product & { pillar?: { name: string; color: string } | null } };

const statusIcon: Record<string, React.ReactNode> = {
  Done: <CheckCircle2 size={14} className="text-emerald-400" />,
  "In Progress": <Clock size={14} className="text-indigo-400" />,
};

export default function ProductCard({ product }: Props) {
  const [tasks, setTasks] = useState<NotionTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/notion/tasks?product=${encodeURIComponent(product.name)}`)
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks ?? []))
      .finally(() => setLoading(false));
  }, [product.name]);

  const bugs = tasks.filter((t) => t.type === "bug");
  const features = tasks.filter((t) => t.type === "feature" || t.type === "task");

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4 border-b border-gray-800 flex items-center justify-between"
        style={{ borderLeftColor: product.pillar?.color ?? "#6366f1", borderLeftWidth: 4 }}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{product.icon ?? "📦"}</span>
            <h3 className="font-semibold text-white">{product.name}</h3>
          </div>
          {product.pillar && (
            <span className="text-xs text-gray-400 ml-7">{product.pillar.name}</span>
          )}
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-400 capitalize">
          {product.area}
        </span>
      </div>

      {/* Tasks */}
      <div className="p-5">
        {loading ? (
          <div className="text-gray-500 text-sm text-center py-4">Loading tasks from Notion…</div>
        ) : tasks.length === 0 ? (
          <div className="text-gray-600 text-sm text-center py-4">No active tasks found</div>
        ) : (
          <div className="space-y-4">
            {/* Stats */}
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-indigo-300">
                <Sparkles size={14} /> {features.length} features
              </div>
              <div className="flex items-center gap-1.5 text-red-300">
                <Bug size={14} /> {bugs.length} bugs
              </div>
            </div>

            {/* Task list */}
            <ul className="space-y-1.5">
              {tasks.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0">{statusIcon[t.status ?? ""] ?? <span className="w-3.5 h-3.5 rounded-full bg-gray-700 inline-block mt-0.5" />}</span>
                  <a
                    href={t.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-300 hover:text-white flex items-center gap-1 group"
                  >
                    {t.name}
                    <ExternalLink size={11} className="opacity-0 group-hover:opacity-50" />
                  </a>
                </li>
              ))}
              {tasks.length > 6 && (
                <li className="text-xs text-gray-500 pl-5">+{tasks.length - 6} more tasks</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
