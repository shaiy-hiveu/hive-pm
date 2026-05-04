"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Compass, Package, BarChart2, Settings, BookOpen } from "lucide-react";
import clsx from "clsx";

const nav = [
  { href: "/",         label: "Dashboard",   icon: LayoutDashboard },
  { href: "/vision",   label: "Vision",      icon: Compass },
  { href: "/products", label: "Products",    icon: Package },
  { href: "/gantt",    label: "Gantt",       icon: BarChart2 },
  { href: "/help",     label: "User Guide",  icon: BookOpen },
  { href: "/settings", label: "Settings",    icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-800">
        <span className="text-xl font-bold text-indigo-400">🐝 Hive PM</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === href
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
        Hive PM v0.1
      </div>
    </aside>
  );
}
