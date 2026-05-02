"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Compass, BarChart2, RefreshCw, Plus, Minus, ChevronsUpDown,
  Flame, Rocket, MousePointerClick, Filter, ListChecks,
} from "lucide-react";
import clsx from "clsx";

type SectionId = "overview" | "vision" | "gantt-overview" | "gantt-sprints"
  | "gantt-pillars" | "gantt-tasks" | "gantt-others" | "gantt-digests"
  | "refresh" | "tips";

const sections: { id: SectionId; label: string }[] = [
  { id: "overview",        label: "Overview" },
  { id: "vision",          label: "Vision page" },
  { id: "gantt-overview",  label: "Gantt: at a glance" },
  { id: "gantt-sprints",   label: "Sprints" },
  { id: "gantt-pillars",   label: "Pillars" },
  { id: "gantt-tasks",     label: "Tasks" },
  { id: "gantt-others",    label: "Others (auto pillar)" },
  { id: "gantt-digests",   label: "Hot & Production digests" },
  { id: "refresh",         label: "Refreshing data" },
  { id: "tips",            label: "Power-user tips" },
];

export default function HelpPage() {
  const [active, setActive] = useState<SectionId>("overview");

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-8">
      <aside className="col-span-3 sticky top-8 self-start">
        <p className="text-xs font-semibold tracking-widest text-indigo-500 mb-3">USER GUIDE</p>
        <nav className="space-y-0.5">
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`}
              onClick={() => setActive(s.id)}
              className={clsx(
                "block px-3 py-2 rounded-lg text-sm transition-colors",
                active === s.id
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}>
              {s.label}
            </a>
          ))}
        </nav>
        <div className="mt-6 text-xs text-gray-400 space-y-2">
          <p>Hive PM is an internal tool for the Hive Urban product team.</p>
          <p>Sign in with <code className="bg-gray-100 px-1 rounded">@hiveurban.com</code> Google account.</p>
        </div>
      </aside>

      <main className="col-span-9 space-y-12">
        <h1 className="text-3xl font-bold text-gray-900">Hive PM — How to use it</h1>

        <Section id="overview" title="Overview" icon={<MousePointerClick className="text-indigo-500" />}>
          <p>Hive PM has two pages that matter day-to-day:</p>
          <ul>
            <li><Link href="/vision" className="text-indigo-600 underline">Vision</Link> — long-term direction. Edit the vision statement, define strategic pillars, and curate the tasks that belong to each pillar.</li>
            <li><Link href="/gantt" className="text-indigo-600 underline">Gantt</Link> — tactical planning. Lay out sprints, drop tasks into them, watch progress in real time.</li>
          </ul>
          <p>Notion is the source of truth for tasks. Hive PM syncs them on demand and lets you organise them into pillars and sprints.</p>
        </Section>

        <Section id="vision" title="Vision page" icon={<Compass className="text-indigo-500" />}>
          <h3>What you see</h3>
          <ul>
            <li><strong>Vision statement</strong> — top of the page. Click the pencil to edit, click the check-mark to save.</li>
            <li><strong>Strategic Pillars</strong> — colored cards in a row. Click a card to make it active; click the colored bar to change its color.</li>
            <li><strong>Selected pillar</strong> — its full detail card sits below: name, the three text blocks (<em>What it means</em> / <em>Our advantage</em> / <em>Success metrics</em>), and the task list.</li>
          </ul>

          <h3>Working with tasks inside a pillar</h3>
          <ul>
            <li>Click <strong>Import from Notion</strong> to open the picker. Search by title or by <code>#ID</code>; tasks already linked to any pillar are hidden by default.</li>
            <li>Filter pills (Type, Priority, Product, Status) are multi-select. <strong>None</strong> matches tasks missing that field. ID search bypasses every filter.</li>
            <li>The <strong>All / Active / Done</strong> tabs above the list filter the visible tasks. Active = anything that&apos;s not done/approved.</li>
            <li>Each row shows <code>#ID</code>, the task title, product chip, type tag, and current status. <strong>Double-click or right-click</strong> a row to open it in Notion.</li>
            <li>To add a free-form task that doesn&apos;t live in Notion, type into the <em>+ הוסף משימה...</em> box at the bottom and press Enter.</li>
          </ul>

          <h3>Counts</h3>
          <p>The pillar header shows <code>active / total</code> tasks and a colored progress bar driven by completion weights (see Gantt → Tasks).</p>
        </Section>

        <Section id="gantt-overview" title="Gantt: at a glance" icon={<BarChart2 className="text-indigo-500" />}>
          <p>The Gantt is a single chart with three layers stacked top to bottom:</p>
          <ol>
            <li><strong>Sprint selector</strong> — choose which sprints are visible, see each sprint&apos;s completion %.</li>
            <li><strong>Chart</strong> — pillars as rows, sprints as columns, each task is a small bar inside its sprint.</li>
            <li><strong>Digest panels</strong> — collapsible <em>Hot</em> and <em>Production</em> task lists pulled from Notion.</li>
          </ol>
          <p>The sprint timeline is fixed: it starts on <strong>19 April 2026</strong> and every sprint is two calendar weeks. You can add or remove sprints from that base.</p>
        </Section>

        <Section id="gantt-sprints" title="Sprints" icon={<Filter className="text-indigo-500" />}>
          <h3>Sprint chips</h3>
          <ul>
            <li>Each chip shows <code>Sprint N · DD/MM–DD/MM · X%</code>. The <strong>%</strong> is the average completion of every task currently assigned to that sprint.</li>
            <li><strong>Click</strong> a chip to toggle its visibility. Hidden sprints disappear from the chart.</li>
            <li><strong>Right-click</strong> a chip → confirmation modal → <em>נקה ספרינט</em>. This empties the sprint of every task. Cleared tasks do <em>not</em> auto-fall back to the current sprint; they stay invisible until you reassign them.</li>
          </ul>

          <h3>Adding / removing sprints</h3>
          <ul>
            <li><Plus className="inline" size={12} /> <strong>+ ספרינט</strong> appends another two-week slot to the timeline.</li>
            <li><Minus className="inline" size={12} /> shrinks the timeline by one sprint (will not go below 1).</li>
            <li>Sprint count, visibility, and the column width all persist in your browser.</li>
          </ul>

          <h3>Default sprint behavior</h3>
          <p>A task created in Hive PM (manually or imported from Notion) is automatically tagged with <strong>the current sprint</strong> only — never future ones. To put a task in a future sprint you must move it explicitly.</p>
        </Section>

        <Section id="gantt-pillars" title="Pillars" icon={<ListChecks className="text-indigo-500" />}>
          <p>Each pillar is a row in the chart. The header shows the pillar name, color swatch, active/total counts, and a per-pillar completion bar.</p>

          <h3>Drawer controls</h3>
          <ul>
            <li>Click the row to expand or collapse the drawer.</li>
            <li>The <strong>X פילרים <ChevronsUpDown className="inline" size={12} /></strong> toolbar at the top of the chart toggles every drawer at once. If any drawer is open, clicking closes them all; otherwise it opens them all.</li>
          </ul>

          <h3><Plus className="inline" size={14} /> Adding tasks to the active sprint</h3>
          <ul>
            <li>Each pillar header has a small <strong>+</strong> button. Clicking it expands the drawer and shows a flat list of <em>candidates</em>.</li>
            <li>Candidates = pillar tasks whose status is not Done/Approved and that aren&apos;t already in the visible sprint(s).</li>
            <li>Each candidate row shows <code>#ID · Title · Type · Product · Status · Priority · % · Due · current location</code>.</li>
            <li>Click a candidate to move it into the <strong>active sprint</strong> (the visible current sprint, or the lowest visible if the current isn&apos;t in view). It immediately appears in the drawer above and disappears from the candidate list.</li>
          </ul>

          <h3>Drawer state persistence</h3>
          <p>Open / closed state is saved per browser. Closing or opening drawers is purely a viewing preference; nothing is lost.</p>
        </Section>

        <Section id="gantt-tasks" title="Tasks" icon={<MousePointerClick className="text-indigo-500" />}>
          <p>Inside an open pillar drawer, every task is one row plus a horizontal bar in the chart area. The row contains:</p>
          <ul>
            <li><strong>#ID</strong> — the Notion auto-ID (only for Notion-sourced tasks).</li>
            <li><strong>Title</strong> — hover to see the full text in a dark tooltip.</li>
            <li><strong>Type</strong> — Bug / Feature / Production / Research / Tech Depth.</li>
            <li><strong>Product</strong> — sky-blue chip.</li>
            <li><strong>Status</strong> — To-do / In progress / Done / Approved (Approved = pulled from a Notion <em>Approved</em> state and counted as 100% complete).</li>
            <li><strong>S{`{N}`}</strong> — the sprint picker chip. Click to move the task to a different sprint (replaces its <code>sprint:N</code> tag).</li>
            <li><strong>%</strong> — completion weight. Defaults: To-do 0%, In progress 30%, Done 80%, Approved 100%. Only <em>In progress</em> tasks expose an editable chip — click it to choose 30 / 40 / 50 / 60 / 70%, overriding the default. The override is stored on the task. Any status change automatically resets the value to the new status&apos; default.</li>
            <li><strong>📅 Due date</strong> — if the task has one in Notion.</li>
            <li><strong>External-link icon</strong> — opens the task in Notion. <strong>Double-click or right-click</strong> the row does the same thing.</li>
          </ul>

          <h3>The bar</h3>
          <p>The colored bar to the right is the task in chart form. The bar lives in the sprint the task is assigned to; its fill represents the task&apos;s own completion percentage.</p>

          <h3>Normalized view</h3>
          <p>Tick the <strong>Normalized</strong> checkbox in the chart toolbar to hide tasks whose creation date falls in the last 7 days of their sprint. This filters out late-added work so you can see the chart against the original plan.</p>

          <h3>Resizing the task column</h3>
          <p>Drag the right edge of the <em>משימה / Pillar</em> header column to make more or less room for task titles. Double-click to reset.</p>
        </Section>

        <Section id="gantt-others" title="Others — the auto-collected pillar" icon={<ListChecks className="text-indigo-500" />}>
          <p>A virtual pillar named <strong>Others</strong> appears at the bottom of the chart whenever there are completed Notion tasks (Done / Complete / Approved) that:</p>
          <ul>
            <li>were finished within the active sprint window (sprint start − 2 days through today), and</li>
            <li>are not assigned to any of your real pillars.</li>
          </ul>
          <p>It exists so unplanned delivery isn&apos;t invisible on the chart. Others is hidden when the current sprint isn&apos;t in the visible-sprints selection — by definition it&apos;s a current-sprint summary.</p>
        </Section>

        <Section id="gantt-digests" title="Hot & Production digests" icon={<Flame className="text-rose-500" />}>
          <p>Below the chart, two collapsible panels surface tasks that need attention regardless of pillar:</p>
          <ul>
            <li><Flame className="inline" size={14} /> <strong>משימות חמות (Hot tasks)</strong> — High/Urgent priority + status Not Started / In Progress. Toggle <em>Urgent</em> ↔ <em>Urgent + High</em> from the chip in the panel header. Sorted urgent → high → medium → low.</li>
            <li><Rocket className="inline" size={14} /> <strong>משימות Production</strong> — every Notion task whose Bug/Feature field is Production.</li>
          </ul>

          <h3>Per-row pillar assignment</h3>
          <p>Every row has a small chip showing the current pillar (or <em>Unassigned</em>). Click the chip to open a menu of pillars and either reassign or unassign the task. The change is immediate and reflected back into the Gantt above.</p>

          <h3>Open in Notion</h3>
          <p>Double-click or right-click a row to open the task in Notion. The external-link icon is also there for a regular click.</p>
        </Section>

        <Section id="refresh" title="Refreshing data" icon={<RefreshCw className="text-indigo-500" />}>
          <p>Hive PM does <strong>not</strong> hit Notion automatically. Navigating between pages reuses cached data so the experience stays instant.</p>
          <p>To pull fresh statuses, due dates, and completion flags from Notion:</p>
          <ol>
            <li>Click <strong>Refresh Data</strong> (top-right of the Gantt and Vision pages).</li>
            <li>The button shows a spinner while syncing, then a green confirmation with the number of rows that were updated.</li>
            <li>The page automatically re-renders with the fresh values; cached Notion calls are invalidated so digests and #ID maps also pick up changes.</li>
          </ol>
          <p>If a sync fails, the button turns red briefly and your old data stays visible — nothing is lost.</p>
        </Section>

        <Section id="tips" title="Power-user tips" icon={<MousePointerClick className="text-indigo-500" />}>
          <ul>
            <li><strong>Move many tasks fast:</strong> open a pillar&apos;s <em>+</em> picker and click straight down the list — each click moves a task into the active sprint and the row disappears.</li>
            <li><strong>Plan a future sprint:</strong> select only that sprint chip → all pillar drawers will be empty → use each pillar&apos;s <em>+</em> to pull tasks in. Switching back to the current sprint shows your existing work untouched.</li>
            <li><strong>Reset historical sprint:</strong> right-click an old sprint and clear it. Tasks come off without falling into the current sprint, so old plans stay archived in your head, not on the chart.</li>
            <li><strong>Compare planned vs ongoing:</strong> tick <em>Normalized</em>. Tasks added in the last week of a sprint vanish, leaving only what was planned ≥ 7 days before the sprint ended.</li>
            <li><strong>Find a task fast in the picker:</strong> type the Notion ID (e.g. <code>213</code> or <code>#213</code>) — it bypasses every other filter.</li>
            <li><strong>Browser tooltip vs. instant tooltip:</strong> on the Gantt, hover the title cell to see the full task name immediately in a dark bubble. The browser&apos;s native tooltip kicks in on the bar itself, with completion % and due date.</li>
            <li><strong>Status colors:</strong> Done is green at 80%, Approved is violet at 100%. Both are excluded from <em>Active</em>.</li>
          </ul>
        </Section>
      </main>
    </div>
  );
}

function Section({ id, title, icon, children }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900 mb-4">
        <span className="shrink-0">{icon}</span>
        {title}
      </h2>
      <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-headings:font-semibold prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2 prose-ul:my-2 prose-li:my-1 prose-p:my-2 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none">
        {children}
      </div>
    </section>
  );
}
