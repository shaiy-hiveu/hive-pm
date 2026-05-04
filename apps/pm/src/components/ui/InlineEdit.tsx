"use client";
import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";

type Props = {
  value: string | undefined;
  placeholder: string;
  onSave: (val: string) => void;
  className?: string;
  textClassName?: string;
  multiline?: boolean;
};

export default function InlineEdit({ value, placeholder, onSave, className = "", textClassName = "", multiline = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function save() {
    onSave(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            className="w-full bg-gray-800 border border-gray-600 focus:border-indigo-500 rounded-lg p-2 text-sm text-gray-200 resize-none focus:outline-none"
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            className="w-full bg-gray-800 border border-gray-600 focus:border-indigo-500 rounded-lg p-2 text-sm text-gray-200 focus:outline-none"
          />
        )}
        <div className="flex gap-1.5">
          <button onClick={save} className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-md">
            <Check size={11} /> Save
          </button>
          <button onClick={cancel} className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-md">
            <X size={11} /> Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group/edit flex items-start gap-1.5 cursor-pointer ${className}`} onClick={() => { setDraft(value ?? ""); setEditing(true); }}>
      <span className={`flex-1 ${!value ? "text-gray-600 italic" : ""} ${textClassName}`}>
        {value || placeholder}
      </span>
      <Pencil size={12} className="opacity-0 group-hover/edit:opacity-50 shrink-0 mt-0.5 text-gray-400" />
    </div>
  );
}
