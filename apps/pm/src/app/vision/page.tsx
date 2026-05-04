"use client";
import { useState, useEffect, useRef } from "react";
import { Plus, Loader2, Pencil, Check } from "lucide-react";
import PillarBlock from "@/components/vision/PillarBlock";
import RefreshDataButton from "@/components/RefreshDataButton";

type Task = {
  id: string; title: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  source: "manual" | "notion"; notion_url?: string;
  assignee?: string; sprint_name?: string; due_date?: string;
  tags?: string[]; product?: string | null;
};

type Pillar = {
  id: string; name: string; description?: string; color?: string; icon?: string;
  order_index?: number; what_it_means?: string; our_advantage?: string;
  success_metrics?: string; vision_text?: string; tasks?: Task[];
};

const COLOR_OPTIONS = [
  { name: "indigo",  hex: "#6366f1" },
  { name: "emerald", hex: "#10b981" },
  { name: "amber",   hex: "#f59e0b" },
  { name: "red",     hex: "#ef4444" },
  { name: "sky",     hex: "#0ea5e9" },
  { name: "purple",  hex: "#8b5cf6" },
  { name: "pink",    hex: "#ec4899" },
  { name: "gray",    hex: "#6b7280" },
];

function resolveColor(color?: string): string {
  if (!color) return "#6366f1";
  if (color.startsWith("#")) return color;
  return COLOR_OPTIONS.find(c => c.name === color)?.hex ?? "#6366f1";
}

function PillarCard({ pillar, index, isSelected, onClick, onColorChange }: {
  pillar: Pillar; index: number; isSelected: boolean;
  onClick: () => void; onColorChange: (hex: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const hex = resolveColor(pillar.color);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker]);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={`relative w-36 text-left rounded-xl border transition-all duration-150 overflow-hidden bg-white
          ${isSelected ? "border-gray-300 shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
        style={isSelected ? { boxShadow: `0 0 0 2px ${hex}40, 0 4px 12px rgba(0,0,0,0.08)` } : {}}
      >
        <div className="px-3 pt-3 pb-2">
          <p className="text-xs text-gray-400 font-mono mb-1">{String(index + 1).padStart(2, "0")}</p>
          <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2 min-h-[2.5rem]">
            {pillar.icon && <span className="mr-1">{pillar.icon}</span>}{pillar.name}
          </p>
        </div>
        <div
          className="h-1.5 w-full cursor-pointer hover:opacity-75 transition-opacity"
          style={{ backgroundColor: hex }}
          onClick={e => { e.stopPropagation(); setShowPicker(p => !p); }}
          title="לחץ לשינוי צבע"
        />
      </button>

      {showPicker && (
        <div ref={pickerRef} className="absolute bottom-full mb-2 left-0 z-50 bg-white border border-gray-200 rounded-xl p-3 shadow-xl w-40">
          <p className="text-xs text-gray-500 mb-2">צבע קטגוריה</p>
          <div className="grid grid-cols-4 gap-2">
            {COLOR_OPTIONS.map(c => (
              <button key={c.name} onClick={e => { e.stopPropagation(); onColorChange(c.hex); setShowPicker(false); }}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: c.hex, outline: resolveColor(pillar.color) === c.hex ? `2px solid ${c.hex}` : "none", outlineOffset: "2px" }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VisionPage() {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingVision, setEditingVision] = useState(false);
  const [visionText, setVisionText] = useState(
    "Become a core intelligence infrastructure for campaigns — a unified, AI-driven platform that replaces fragmented campaign research with a single operating system."
  );

  async function load() {
    setLoading(true);
    const res = await fetch("/api/pillars");
    const data = await res.json();
    const list: Pillar[] = data.pillars ?? [];
    setPillars(list);
    if (list.length > 0) setSelectedId(prev => prev ?? list[0].id);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addPillar() {
    setAdding(true);
    const res = await fetch("/api/pillars", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Pillar", color: "#6366f1", icon: "🎯", order_index: pillars.length }),
    });
    const data = await res.json();
    const newPillar = data.pillar ?? data;
    setPillars(prev => [...prev, newPillar]);
    setSelectedId(newPillar.id);
    setAdding(false);
  }

  async function updatePillar(id: string, updates: Partial<Pillar>) {
    setPillars(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    await fetch(`/api/pillars/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }

  async function deletePillar(id: string) {
    await fetch(`/api/pillars/${id}`, { method: "DELETE" });
    const remaining = pillars.filter(p => p.id !== id);
    setPillars(remaining);
    setSelectedId(remaining[0]?.id ?? null);
  }

  const selectedPillar = pillars.find(p => p.id === selectedId) ?? null;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 gap-2"><Loader2 size={20} className="animate-spin" /> Loading…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-end">
        <RefreshDataButton />
      </div>

      {/* Vision */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-widest text-indigo-500 mb-2">VISION</p>
            {editingVision ? (
              <textarea className="w-full text-gray-700 text-sm leading-relaxed resize-none focus:outline-none bg-transparent border-b border-indigo-300 pb-1" rows={3}
                value={visionText} onChange={e => setVisionText(e.target.value)} autoFocus />
            ) : (
              <p className="text-gray-700 text-sm leading-relaxed cursor-text" onClick={() => setEditingVision(true)}>{visionText}</p>
            )}
          </div>
          <button onClick={() => setEditingVision(e => !e)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0">
            {editingVision ? <Check size={15} /> : <Pencil size={15} />}
          </button>
        </div>
      </div>

      {/* Pillar cards */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-gray-400 mb-3">STRATEGIC PILLARS · לחץ על פס הצבע לשינוי קטגוריה</p>
        <div className="flex gap-3 flex-wrap items-start">
          {pillars.map((pillar, idx) => (
            <PillarCard key={pillar.id} pillar={pillar} index={idx}
              isSelected={selectedId === pillar.id}
              onClick={() => setSelectedId(pillar.id)}
              onColorChange={hex => updatePillar(pillar.id, { color: hex })}
            />
          ))}
          <button onClick={addPillar} disabled={adding}
            className="w-36 h-[4.5rem] rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors flex items-center justify-center gap-1.5 text-sm bg-white">
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} הוסף
          </button>
        </div>
      </div>

      {/* Selected pillar detail */}
      {selectedPillar && (
        <div key={selectedPillar.id}>
          <PillarBlock
            pillar={selectedPillar}
            index={pillars.findIndex(p => p.id === selectedPillar.id)}
            onUpdate={(updates: Partial<Pillar>) => updatePillar(selectedPillar.id, updates)}
            onDelete={() => deletePillar(selectedPillar.id)}
          />
        </div>
      )}
    </div>
  );
}
