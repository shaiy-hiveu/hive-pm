import { Pillar, Goal } from "@/types";

type Props = { pillar: Pillar; goals: Goal[] };

const statusColor = {
  not_started: "bg-gray-700",
  in_progress: "bg-indigo-500",
  done: "bg-emerald-500",
  blocked: "bg-red-500",
};

export default function PillarCard({ pillar, goals }: Props) {
  const done = goals.filter((g) => g.status === "done").length;
  const total = goals.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4"
      style={{ borderLeftColor: pillar.color, borderLeftWidth: 4 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{pillar.icon}</span>
          <h3 className="font-semibold text-white">{pillar.name}</h3>
        </div>
        <span className="text-xs text-gray-400">{done}/{total} goals</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pillar.color }}
        />
      </div>

      {/* Goals */}
      <ul className="space-y-1">
        {goals.slice(0, 4).map((g) => (
          <li key={g.id} className="flex items-center gap-2 text-sm text-gray-300">
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor[g.status]}`} />
            {g.title}
          </li>
        ))}
        {goals.length > 4 && (
          <li className="text-xs text-gray-500">+{goals.length - 4} more</li>
        )}
      </ul>
    </div>
  );
}
