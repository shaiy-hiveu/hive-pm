import Link from "next/link";
import { Compass, Package, BarChart2 } from "lucide-react";

const cards = [
  {
    href: "/vision",
    icon: Compass,
    title: "Vision & Strategy",
    desc: "Strategic pillars, goals and progress tracking",
    color: "from-indigo-600 to-indigo-800",
  },
  {
    href: "/products",
    icon: Package,
    title: "Products",
    desc: "Active products, features & current sprint from Notion",
    color: "from-emerald-600 to-emerald-800",
  },
  {
    href: "/gantt",
    icon: BarChart2,
    title: "Gantt",
    desc: "Timeline view across goals and sprints",
    color: "from-amber-600 to-amber-800",
  },
];

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Welcome back 👋</h1>
        <p className="text-gray-400 mt-1">Hive Product Manager — your single source of truth</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cards.map(({ href, icon: Icon, title, desc, color }) => (
          <Link
            key={href}
            href={href}
            className={`bg-gradient-to-br ${color} rounded-2xl p-6 hover:scale-105 transition-transform cursor-pointer shadow-lg`}
          >
            <Icon size={28} className="mb-3 text-white/80" />
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="text-white/70 text-sm mt-1">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
