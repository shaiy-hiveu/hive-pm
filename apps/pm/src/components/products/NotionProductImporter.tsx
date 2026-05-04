"use client";
import { useEffect, useState } from "react";
import { Download, Check, Trash2, RefreshCw, Loader2 } from "lucide-react";
import clsx from "clsx";

type SavedProduct = { id: string; name: string; icon: string; area: string };

const AREAS = ["core", "research", "production", "other"] as const;
const AREA_COLORS: Record<string, string> = {
  core: "bg-indigo-700 text-indigo-200",
  research: "bg-emerald-700 text-emerald-200",
  production: "bg-amber-700 text-amber-200",
  other: "bg-gray-700 text-gray-300",
};

export default function NotionProductImporter() {
  const [notionProducts, setNotionProducts] = useState<string[]>([]);
  const [notionProjects, setNotionProjects] = useState<string[]>([]);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [areaMap, setAreaMap] = useState<Record<string, (typeof AREAS)[number]>>({});
  const [iconMap, setIconMap] = useState<Record<string, string>>({});

  const savedNames = new Set(savedProducts.map((p) => p.name));

  async function load() {
    setLoading(true);
    const [np, sp] = await Promise.all([
      fetch("/api/notion/products").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
    ]);
    setNotionProducts(np.products ?? []);
    setNotionProjects(np.projects ?? []);
    setSavedProducts(sp.products ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function importProduct(name: string) {
    setSaving(name);
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        icon: iconMap[name] || "📦",
        area: areaMap[name] || "core",
      }),
    });
    await load();
    setSaving(null);
  }

  async function removeProduct(name: string) {
    setDeleting(name);
    await fetch(`/api/products?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    await load();
    setDeleting(null);
  }

  function renderRow(name: string) {
    const isSaved = savedNames.has(name);
    return (
      <div
        key={name}
        className={clsx(
          "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
          isSaved ? "border-indigo-500/50 bg-indigo-950/30" : "border-gray-800 bg-gray-900"
        )}
      >
        <input
          type="text"
          value={iconMap[name] ?? "📦"}
          onChange={(e) => setIconMap((m) => ({ ...m, [name]: e.target.value }))}
          className="w-10 text-center bg-gray-800 rounded-lg border border-gray-700 text-lg py-0.5"
          disabled={isSaved}
          title="Emoji icon"
        />
        <span className="flex-1 text-white font-medium">{name}</span>
        <select
          value={areaMap[name] ?? "core"}
          onChange={(e) => setAreaMap((m) => ({ ...m, [name]: e.target.value as any }))}
          disabled={isSaved}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-2 py-1"
        >
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {isSaved && (
          <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", AREA_COLORS[savedProducts.find(p => p.name === name)?.area ?? "core"])}>
            {savedProducts.find(p => p.name === name)?.area}
          </span>
        )}
        {isSaved ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-emerald-400"><Check size={14} /> Tracking</span>
            <button onClick={() => removeProduct(name)} disabled={deleting === name} className="p-1.5 rounded-lg hover:bg-red-900/40 text-gray-500 hover:text-red-400 transition-colors" title="Remove">
              {deleting === name ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        ) : (
          <button onClick={() => importProduct(name)} disabled={saving === name} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50">
            {saving === name ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Add to Dashboard
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Products from Notion</h2>
          <p className="text-sm text-gray-400">Select which products to track in the dashboard</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading from Notion…
        </div>
      ) : (
        <>
          {/* Products (multi_select "Product") */}
          {notionProducts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                📦 Products <span className="text-gray-600 normal-case font-normal">(from "Product" field)</span>
              </h3>
              <div className="space-y-2">
                {notionProducts.map((name) => renderRow(name))}
              </div>
            </div>
          )}

          {/* Projects (select "Project") */}
          {notionProjects.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                🗂️ Projects <span className="text-gray-600 normal-case font-normal">(from "Project" field)</span>
              </h3>
              <div className="space-y-2">
                {notionProjects.map((name) => renderRow(name))}
              </div>
            </div>
          )}

          {notionProducts.length === 0 && notionProjects.length === 0 && (
            <div className="text-center py-12 text-gray-500 border border-gray-800 rounded-xl">
              No products or projects found in Notion.
            </div>
          )}
        </>
      )}
    </div>
  );
}
