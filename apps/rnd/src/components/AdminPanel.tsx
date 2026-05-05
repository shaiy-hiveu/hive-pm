"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, Plus, Trash2 } from "lucide-react";

type Member = {
  id: string; handle: string; full_name: string; email: string;
  role: string | null; slack_user_id: string | null; is_admin: boolean; active: boolean;
  notion_assignee_name: string | null;
};
type SkillCategory = { id: string; name: string; order_index: number; color: string | null };
type Skill = {
  id: string; name: string; category_id: string | null;
  description: string | null; order_index: number;
  category?: { id: string; name: string; color: string | null } | null;
};
type Repo = {
  id: string; name: string; slug: string;
  description: string | null; tech_summary: string | null;
  status: string; color: string | null; order_index: number;
};

type Tab = "members" | "skills" | "repos";

export default function AdminPanel({ members, skills, categories, repos }: {
  members: Member[]; skills: Skill[]; categories: SkillCategory[]; repos: Repo[];
}) {
  const [tab, setTab] = useState<Tab>("members");
  return (
    <div>
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {(["members", "skills", "repos"] as Tab[]).map(t => (
            <button key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"
              )}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === "members" && <MembersTab members={members} />}
      {tab === "skills" && <SkillsTab skills={skills} categories={categories} />}
      {tab === "repos" && <ReposTab repos={repos} />}
    </div>
  );
}

function MembersTab({ members }: { members: Member[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    handle: "", full_name: "", email: "", role: "", slack_user_id: "",
    notion_assignee_name: "", is_admin: false,
  });

  async function add() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed");
      setForm({ handle: "", full_name: "", email: "", role: "", slack_user_id: "", notion_assignee_name: "", is_admin: false });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!confirm("Delete this member?")) return;
    setBusy(true);
    try {
      await fetch(`/api/members/${id}`, { method: "DELETE" });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Add member</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input placeholder="handle (e.g. shai_y)" value={form.handle}
            onChange={e => setForm({ ...form, handle: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <input placeholder="Full name (matches Notion Assigned to)" value={form.full_name}
            onChange={e => setForm({ ...form, full_name: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <input placeholder="email@hiveurban.com" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <input placeholder="Role (e.g. Backend Engineer)" value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <input placeholder="Slack user id (U…)" value={form.slack_user_id}
            onChange={e => setForm({ ...form, slack_user_id: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <input placeholder="Notion assignee name (if different from Full name)"
            value={form.notion_assignee_name}
            onChange={e => setForm({ ...form, notion_assignee_name: e.target.value })}
            title="Use this when Notion's 'Assigned to' value is different from the member's display name (e.g. 'Max' or 'shai_y@hiveurban.com')"
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.is_admin}
              onChange={e => setForm({ ...form, is_admin: e.target.checked })}
              className="w-4 h-4 accent-indigo-600" />
            Admin
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={add} disabled={busy || !form.handle || !form.full_name || !form.email}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add member
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left">Handle</th>
              <th className="px-4 py-2 text-left">Full name</th>
              <th className="px-4 py-2 text-left">Notion assignee</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Slack</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No members yet.</td></tr>
            )}
            {members.map(m => (
              <MemberRowEditable key={m.id} member={m} busy={busy} onRemove={remove} />
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MemberRowEditable({ member, busy, onRemove }: {
  member: Member;
  busy: boolean;
  onRemove: (id: string) => void | Promise<void>;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(member.full_name);
  const [notionName, setNotionName] = useState(member.notion_assignee_name ?? "");
  const [saving, setSaving] = useState<"full_name" | "notion_assignee_name" | null>(null);

  async function patch(field: "full_name" | "notion_assignee_name", value: string) {
    setSaving(field);
    try {
      await fetch(`/api/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: field === "notion_assignee_name" ? (value || null) : value }),
      });
      router.refresh();
    } finally { setSaving(null); }
  }

  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 py-2 font-medium text-gray-900">@{member.handle}</td>
      <td className="px-4 py-2 text-gray-700">
        <input
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          onBlur={() => fullName !== member.full_name && patch("full_name", fullName)}
          className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1 py-0.5 text-sm focus:outline-none"
        />
        {saving === "full_name" && <Loader2 size={10} className="inline animate-spin text-gray-400" />}
      </td>
      <td className="px-4 py-2 text-gray-500">
        <input
          value={notionName}
          onChange={e => setNotionName(e.target.value)}
          onBlur={() => notionName !== (member.notion_assignee_name ?? "") && patch("notion_assignee_name", notionName)}
          placeholder="(uses Full name)"
          className="w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:bg-white rounded px-1 py-0.5 text-xs focus:outline-none"
        />
        {saving === "notion_assignee_name" && <Loader2 size={10} className="inline animate-spin text-gray-400" />}
      </td>
      <td className="px-4 py-2 text-gray-500 text-xs">{member.email}</td>
      <td className="px-4 py-2 text-gray-700">{member.role}</td>
      <td className="px-4 py-2 text-gray-500 text-xs font-mono">{member.slack_user_id ?? "—"}</td>
      <td className="px-4 py-2 text-right">
        <button onClick={() => onRemove(member.id)} disabled={busy}
          className="text-gray-300 hover:text-red-600 disabled:opacity-50">
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

function SkillsTab({ skills, categories }: { skills: Skill[]; categories: SkillCategory[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category_id: "", order_index: 0 });

  async function add() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          category_id: form.category_id || null,
          order_index: Number(form.order_index) || 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed");
      setForm({ name: "", category_id: "", order_index: 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown");
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this skill? Member-skill links will be removed.")) return;
    setBusy(true);
    try {
      await fetch(`/api/skills/${id}`, { method: "DELETE" });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Add skill</h2>
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <input placeholder="Skill name" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <select value={form.category_id}
            onChange={e => setForm({ ...form, category_id: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white">
            <option value="">— Category —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" placeholder="Order (sorting)" value={form.order_index}
            onChange={e => setForm({ ...form, order_index: Number(e.target.value) })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={add} disabled={busy || !form.name}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add skill
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left">Skill</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Order</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {skills.map(s => (
              <tr key={s.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">{s.name}</td>
                <td className="px-4 py-2 text-gray-700">
                  {s.category ? (
                    <span className="inline-flex items-center gap-1.5">
                      {s.category.color && <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.category.color }} />}
                      {s.category.name}
                    </span>
                  ) : <span className="text-gray-300 italic">—</span>}
                </td>
                <td className="px-4 py-2 text-gray-500 tabular-nums">{s.order_index}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(s.id)} disabled={busy}
                    className="text-gray-300 hover:text-red-600 disabled:opacity-50">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ReposTab({ repos }: { repos: Repo[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", slug: "", description: "", tech_summary: "", color: "#6366f1", order_index: 0,
  });

  async function add() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, order_index: Number(form.order_index) || 0 }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed");
      setForm({ name: "", slug: "", description: "", tech_summary: "", color: "#6366f1", order_index: 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown");
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm("Delete this repo? Member-repo links will be removed.")) return;
    setBusy(true);
    try {
      await fetch(`/api/repos/${id}`, { method: "DELETE" });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Add repo</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input placeholder="Name (e.g. New Project)" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <input placeholder="slug (e.g. new-project)" value={form.slug}
            onChange={e => setForm({ ...form, slug: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
          <input placeholder="Short description" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 sm:col-span-2" />
          <textarea placeholder="Tech summary (multi-line)" value={form.tech_summary}
            onChange={e => setForm({ ...form, tech_summary: e.target.value })}
            rows={3}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 sm:col-span-2 resize-none" />
          <input type="color" value={form.color}
            onChange={e => setForm({ ...form, color: e.target.value })}
            className="h-9 w-full border border-gray-200 rounded-lg cursor-pointer" />
          <input type="number" placeholder="Order" value={form.order_index}
            onChange={e => setForm({ ...form, order_index: Number(e.target.value) })}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={add} disabled={busy || !form.name || !form.slug}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add repo
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Slug</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Color</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {repos.map(r => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                <td className="px-4 py-2 text-gray-500 text-xs font-mono">{r.slug}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">{r.status}</td>
                <td className="px-4 py-2">
                  <span className="inline-block w-4 h-4 rounded-md border border-gray-200" style={{ backgroundColor: r.color ?? "#9ca3af" }} />
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(r.id)} disabled={busy}
                    className="text-gray-300 hover:text-red-600 disabled:opacity-50">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
