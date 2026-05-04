"use client";
import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";

const DEFAULT_VISION = "Become a core intelligence infrastructure for campaigns — a unified, AI-driven platform that replaces fragmented campaign research with a single operating system.";

export default function VisionHeader() {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(DEFAULT_VISION);
  const [draft, setDraft] = useState(text);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">Strategic Vision · Hive</p>
          <h1 className="text-3xl font-bold text-white mt-1">Strategic Pillars</h1>
        </div>
      </div>

      {/* Vision statement */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 relative group">
        <p className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-2">Vision</p>
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full bg-gray-800 rounded-lg p-3 text-gray-200 text-sm resize-none border border-gray-600 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => { setText(draft); setEditing(false); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg transition-colors">
                <Check size={12} /> Save
              </button>
              <button onClick={() => { setDraft(text); setEditing(false); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors">
                <X size={12} /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
            <button onClick={() => { setDraft(text); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 shrink-0">
              <Pencil size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
