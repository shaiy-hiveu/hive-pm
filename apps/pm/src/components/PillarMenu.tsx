"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import clsx from "clsx";

export type PillarLike = {
  id: string;
  name: string;
  color?: string;
};

export default function PillarMenu({ current, pillars, onPick, allowUnassign = true }: {
  current: PillarLike | undefined;
  pillars: PillarLike[];
  onPick: (pillarId: string | null) => Promise<void>;
  allowUnassign?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hex = current?.color && current.color.startsWith("#") ? current.color : "#9ca3af";

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

  function computePos() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const ROW_H = 28;
    const MENU_H = pillars.length * ROW_H + (allowUnassign ? 40 : 8);
    const spaceBelow = window.innerHeight - r.bottom;
    const goUp = spaceBelow < MENU_H + 12;
    const top = goUp ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4;
    const right = Math.max(8, window.innerWidth - r.right);
    setPos({ top, right });
  }

  function toggle() {
    if (!open) computePos();
    setOpen(o => !o);
  }

  async function pick(pid: string | null) {
    setBusy(true);
    try { await onPick(pid); } finally { setBusy(false); setOpen(false); }
  }

  const menu = open && pos && (
    <div
      ref={menuRef}
      style={{ position: "fixed", top: pos.top, right: pos.right, width: 192, zIndex: 60 }}
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
      {allowUnassign && (
        <>
          <div className="my-1 border-t border-gray-100" />
          <button onClick={() => pick(null)}
            className="w-full px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 text-right disabled:opacity-50"
            disabled={!current}>
            ביטול שיוך
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="inline-flex" onClick={e => e.stopPropagation()}>
      <button ref={triggerRef} onClick={toggle}
        className={clsx("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors shrink-0",
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
    </div>
  );
}
