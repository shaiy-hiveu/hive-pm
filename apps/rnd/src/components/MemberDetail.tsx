"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, ExternalLink, Loader2, Save, CheckCircle2, Circle, LogIn, LogOut, Clock } from "lucide-react";

type MemberSkill = { skill_id: string; level: number; notes: string | null };
type MemberRepo = { repo_id: string; role: string | null; started_at: string | null; ended_at: string | null };
type Member = {
  id: string;
  handle: string;
  full_name: string;
  notion_assignee_name?: string | null;
  email: string;
  role: string | null;
  slack_user_id: string | null;
  active: boolean;
  is_admin: boolean;
  joined_at: string | null;
  notes: string | null;
  rnd_member_skills?: MemberSkill[];
  rnd_member_repos?: MemberRepo[];
};
type Skill = { id: string; name: string; category_id: string | null; order_index: number };
type Category = { id: string; name: string; order_index: number; color: string | null };
type Repo = { id: string; name: string; slug: string; color: string | null; status: string; order_index: number };

type NotionTask = {
  id: string;
  page_url: string;
  notion_id: number | null;
  name: string;
  status: string | null;
  product: string | null;
};

const LEVELS: Array<0 | 1 | 2 | 3 | 4 | 5> = [0, 1, 2, 3, 4, 5];
const LEVEL_LABEL: Record<number, string> = {
  0: "—", 1: "Familiar", 2: "Working", 3: "Solid", 4: "Strong", 5: "Expert",
};

export default function MemberDetail({ member, skills, categories, repos }: {
  member: Member;
  skills: Skill[];
  categories: Category[];
  repos: Repo[];
}) {
  const router = useRouter();
  const initialSkillMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const ms of member.rnd_member_skills ?? []) m.set(ms.skill_id, ms.level);
    return m;
  }, [member.rnd_member_skills]);

  const initialRepoMap = useMemo(() => {
    const m = new Set<string>();
    for (const mr of member.rnd_member_repos ?? []) m.add(mr.repo_id);
    return m;
  }, [member.rnd_member_repos]);

  const [skillLevels, setSkillLevels] = useState<Map<string, number>>(initialSkillMap);
  const [repoSelected, setRepoSelected] = useState<Set<string>>(initialRepoMap);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // Live Notion task lookup keyed off full_name (matches Notion `Assigned to`).
  const [tasks, setTasks] = useState<{ active: NotionTask[]; done: NotionTask[] } | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [workActive, setWorkActive] = useState<boolean>(false);
  const [workStartedAt, setWorkStartedAt] = useState<string | null>(null);
  const [autoEndHour, setAutoEndHour] = useState(20);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [clockBusy, setClockBusy] = useState(false);

  const loadStatus = useCallback(() => {
    fetch("/api/notion-tasks-by-member")
      .then(r => r.json())
      .then(data => {
        // Tolerate case/whitespace differences. Prefer the explicit
        // notion_assignee_name override (used when Notion shows e.g. "Max"
        // or an email instead of the human-readable full name).
        const wantedRaw = member.notion_assignee_name || member.full_name;
        const wantedNorm = (wantedRaw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
        let bucket: { active: NotionTask[]; done: NotionTask[] } | undefined;
        for (const [name, b] of Object.entries(data.byAssignee ?? {})) {
          const norm = name.trim().toLowerCase().replace(/\s+/g, " ");
          if (norm === wantedNorm) { bucket = b as typeof bucket; break; }
        }
        setTasks(bucket ?? { active: [], done: [] });
      })
      .catch(() => setTasks({ active: [], done: [] }));
    fetch(`/api/task-checks?member_id=${member.id}`)
      .then(r => r.json())
      .then(data => {
        const ids = new Set<string>((data.items ?? []).map((c: { notion_page_id: string }) => c.notion_page_id));
        setCheckedIds(ids);
      });
    fetch("/api/work-sessions")
      .then(r => r.json())
      .then(data => {
        const status = data.byMember?.[member.id];
        setWorkActive(!!status?.active);
        setWorkStartedAt(status?.started_at ?? null);
        if (data.autoEndHour) setAutoEndHour(data.autoEndHour);
      });
  }, [member.full_name, member.id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function toggleCheck(t: NotionTask) {
    setTaskBusyId(t.id);
    const isChecked = checkedIds.has(t.id);
    if (isChecked) {
      await fetch(`/api/task-checks?member_id=${member.id}&notion_page_id=${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      }).catch(() => {});
    } else {
      await fetch("/api/task-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: member.id,
          notion_page_id: t.id,
          notion_id: t.notion_id,
          notion_name: t.name,
        }),
      }).catch(() => {});
    }
    loadStatus();
    setTaskBusyId(null);
  }

  async function clockIn() {
    setClockBusy(true);
    await fetch("/api/work-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: member.id }),
    }).catch(() => {});
    loadStatus();
    setClockBusy(false);
  }
  async function clockOut() {
    setClockBusy(true);
    await fetch("/api/work-sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: member.id }),
    }).catch(() => {});
    loadStatus();
    setClockBusy(false);
  }

  const skillsByCategory = useMemo(() => {
    const map = new Map<string, Skill[]>();
    for (const s of skills) {
      const key = s.category_id ?? "_uncat";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [skills]);

  function setLevel(skillId: string, level: number) {
    setSkillLevels(prev => {
      const next = new Map(prev);
      if (level === 0) next.delete(skillId);
      else next.set(skillId, level);
      return next;
    });
  }

  function toggleRepo(repoId: string) {
    setRepoSelected(prev => {
      const next = new Set(prev);
      if (next.has(repoId)) next.delete(repoId);
      else next.add(repoId);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setSaved(null);
    try {
      // Build skills payload: keep current levels + explicit removals for
      // skills the user removed (had level previously, now 0).
      const previousIds = new Set(initialSkillMap.keys());
      const currentIds = new Set(skillLevels.keys());
      const removedIds = [...previousIds].filter(id => !currentIds.has(id));
      const skillsPayload = [
        ...[...skillLevels.entries()].map(([skill_id, level]) => ({ skill_id, level })),
        ...removedIds.map(skill_id => ({ skill_id, level: 0 })),
      ];
      await fetch("/api/member-skills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: member.id, skills: skillsPayload }),
      });

      // Repos: send keep flag for every repo so server can add or remove.
      const reposPayload = repos.map(r => ({
        repo_id: r.id,
        keep: repoSelected.has(r.id),
      }));
      await fetch("/api/member-repos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: member.id, repos: reposPayload }),
      });
      setSaved("Saved.");
      router.refresh();
      setTimeout(() => setSaved(null), 2200);
    } catch (err) {
      setSaved("Error: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link href="/team" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft size={12} /> Team
      </Link>

      <header className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={clsx("w-2.5 h-2.5 rounded-full shrink-0", workActive ? "bg-emerald-500" : "bg-gray-300")}
                title={workActive ? `Clocked in at ${formatHM(workStartedAt)}` : "Not clocked in"} />
              <h1 className="text-2xl font-bold text-gray-900">@{member.handle}</h1>
            </div>
            <p className="text-sm text-gray-500 mt-1">{member.full_name} · {member.email}</p>
            {member.role && <p className="text-sm text-gray-700 mt-1">{member.role}</p>}
            <div className="flex items-center gap-2 mt-2">
              {member.is_admin && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  Admin
                </span>
              )}
              {workActive && workStartedAt && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                  <Clock size={11} /> Working since {formatHM(workStartedAt)}
                  <span className="text-gray-400">· auto-out at {String(autoEndHour).padStart(2, "0")}:00</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {workActive ? (
              <button onClick={clockOut} disabled={clockBusy}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                {clockBusy ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                Clock out
              </button>
            ) : (
              <button onClick={clockIn} disabled={clockBusy}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50">
                {clockBusy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                Clock in
              </button>
            )}
            <button onClick={save} disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes
            </button>
          </div>
        </div>
        {saved && <p className="text-xs text-emerald-700 mt-3">{saved}</p>}
      </header>

      {/* Working on (live from Notion) */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Working on</h2>
        <p className="text-xs text-gray-500 mb-4">Live from Notion (matched by &quot;Assigned to = {member.full_name}&quot;).</p>
        {tasks === null ? (
          <p className="text-xs text-gray-400 inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" /> loading…</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-2">
                Active ({tasks.active.length})
                {checkedIds.size > 0 && <span className="text-emerald-600 font-normal ml-1">· {checkedIds.size} checked</span>}
              </h3>
              <p className="text-[10px] text-gray-400 mb-2">Check the tasks you&apos;re currently working on.</p>
              {tasks.active.length === 0
                ? <p className="text-xs text-gray-400 italic">No active tasks.</p>
                : (
                  <ul className="space-y-1">
                    {tasks.active.map(t => {
                      const isChecked = checkedIds.has(t.id);
                      const itemBusy = taskBusyId === t.id;
                      return (
                        <li key={t.id} className="flex items-center gap-2">
                          <button onClick={() => toggleCheck(t)}
                            disabled={itemBusy}
                            title={isChecked ? "Stop working" : "I'm working on this"}
                            className="text-gray-400 hover:text-emerald-600 disabled:opacity-50 shrink-0">
                            {itemBusy
                              ? <Loader2 size={14} className="animate-spin" />
                              : isChecked
                                ? <CheckCircle2 size={14} className="text-emerald-500" />
                                : <Circle size={14} />}
                          </button>
                          <a href={t.page_url} target="_blank" rel="noopener noreferrer"
                            className={clsx(
                              "flex items-center gap-1.5 text-[13px] hover:text-indigo-700 flex-1 min-w-0",
                              isChecked ? "text-emerald-700 font-medium" : "text-gray-700"
                            )}>
                            {t.notion_id != null && (
                              <span className={clsx(
                                "text-[10px] font-mono tabular-nums shrink-0",
                                isChecked ? "text-emerald-500" : "text-gray-400"
                              )}>#{t.notion_id}</span>
                            )}
                            <span className="flex-1 truncate">{t.name}</span>
                            {t.status && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 shrink-0">{t.status}</span>}
                            <ExternalLink size={10} className="text-gray-300 shrink-0" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-2">Done ({tasks.done.length})</h3>
              {tasks.done.length === 0
                ? <p className="text-xs text-gray-400 italic">No done tasks yet.</p>
                : (
                  <ul className="space-y-1 max-h-72 overflow-y-auto">
                    {tasks.done.slice(0, 50).map(t => (
                      <li key={t.id}>
                        <a href={t.page_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-indigo-700">
                          {t.notion_id != null && <span className="text-[10px] font-mono text-gray-300 tabular-nums shrink-0">#{t.notion_id}</span>}
                          <span className="flex-1 truncate">{t.name}</span>
                          <ExternalLink size={10} className="text-gray-200 shrink-0" />
                        </a>
                      </li>
                    ))}
                    {tasks.done.length > 50 && (
                      <li className="text-[10px] text-gray-400 italic">+{tasks.done.length - 50} more</li>
                    )}
                  </ul>
                )}
            </div>
          </div>
        )}
      </section>

      {/* Skills editor */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Skills</h2>
        <p className="text-xs text-gray-500 mb-4">
          Pick a level 1–5 for each skill you know. — = not selected.
          Levels: 1 Familiar · 2 Working · 3 Solid · 4 Strong · 5 Expert.
        </p>
        <div className="space-y-5">
          {categories.map(cat => {
            const catSkills = skillsByCategory.get(cat.id) ?? [];
            if (catSkills.length === 0) return null;
            return (
              <div key={cat.id}>
                <div className="flex items-center gap-2 mb-2">
                  {cat.color && <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: cat.color }} />}
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{cat.name}</h3>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                  {catSkills.map(s => {
                    const current = skillLevels.get(s.id) ?? 0;
                    return (
                      <div key={s.id} className="flex items-center gap-2">
                        <span className="flex-1 text-sm text-gray-700 truncate">{s.name}</span>
                        <div className="flex items-center gap-0.5">
                          {LEVELS.map(lvl => (
                            <button key={lvl}
                              onClick={() => setLevel(s.id, lvl)}
                              title={LEVEL_LABEL[lvl]}
                              className={clsx(
                                "w-6 h-6 text-[11px] rounded transition-colors tabular-nums",
                                lvl === current
                                  ? "bg-indigo-600 text-white font-semibold"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              )}>
                              {lvl === 0 ? "—" : lvl}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Repos */}
      <section className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Repos</h2>
        <p className="text-xs text-gray-500 mb-4">Tick the projects you have experience with.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {repos.map(r => {
            const checked = repoSelected.has(r.id);
            const hex = r.color && r.color.startsWith("#") ? r.color : "#9ca3af";
            return (
              <label key={r.id}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                  checked ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-200 hover:border-gray-300"
                )}>
                <input type="checkbox" checked={checked}
                  onChange={() => toggleRepo(r.id)}
                  className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: hex }} />
                <span className="text-sm text-gray-700 flex-1 truncate">{r.name}</span>
                {r.status !== "active" && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-gray-200 text-gray-500">{r.status}</span>
                )}
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function formatHM(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
