"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  Search,
  Settings,
  Archive,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/upload", icon: Upload, label: "Upload/Archive" },
  { href: "/search", icon: Search, label: "Search & Retrieve" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-col border-r border-border bg-muted/20 p-4 pt-6 flex">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 px-4 mb-6"
      >
        <Archive className="h-7 w-7 text-primary" />
        <span className="text-xl font-bold">ArchiveService</span>
      </Link>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-lg transition-all hover:bg-accent hover:text-accent-foreground",
              pathname === item.href
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                : "text-muted-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}