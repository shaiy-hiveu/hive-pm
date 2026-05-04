import { Goal } from "@/types";
import { format } from "date-fns";

type Props = { goals: (Goal & { pillar?: { name: string; color: string } | null })[] };

const statusLabel = {
  not_started: "Not Started",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

const statusStyle = {
  not_started: "bg-gray-700 text-gray-300",
  in_progress: "bg-indigo-700 text-indigo-200",
  done: "bg-emerald-700 text-emerald-200",
  blocked: "bg-red-700 text-red-200",
};

export default function GoalList({ goals }: Props) {
  if (goals.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No goals yet — add them in Supabase or the Settings page.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400">
          <tr>
            <th className="text-left px-4 py-3">Goal</th>
            <th className="text-left px-4 py-3">Pillar</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Progress</th>
            <th className="text-left px-4 py-3">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {goals.map((g) => (
            <tr key={g.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{g.title}</td>
              <td className="px-4 py-3 text-gray-400">{g.pillar?.name ?? "—"}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[g.status]}`}>
                  {statusLabel[g.status]}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full w-24">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${g.progress}%` }}
                    />
                  </div>
                  <span className="text-gray-400 text-xs">{g.progress}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-400">
                {g.end_date ? format(new Date(g.end_date), "MMM d, yyyy") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
