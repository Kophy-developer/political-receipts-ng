import {
  Archive,
  BarChart3,
  LayoutDashboard,
  Library,
  PenLine,
  Radio,
  Scale,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/intelligence", label: "Live Intelligence", icon: Radio },
  { href: "/claims", label: "Claims", icon: Scale },
  { href: "/drafts", label: "Drafts", icon: PenLine },
  { href: "/published", label: "Published", icon: Archive },
  { href: "/sources", label: "Sources", icon: Library },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
