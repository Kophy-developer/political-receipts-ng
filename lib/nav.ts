import {
  Archive,
  Library,
  Lightbulb,
  PenLine,
  Radio,
  Scale,
  Settings,
  SquarePen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const primaryNav: NavItem[] = [
  { href: "/desk", label: "Desk", icon: SquarePen },
  { href: "/ready", label: "Ready for You", icon: PenLine },
  { href: "/published", label: "Published", icon: Archive },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const libraryNav: NavItem[] = [
  { href: "/intelligence", label: "Intelligence", icon: Radio },
  { href: "/opportunities", label: "Opportunities", icon: Lightbulb },
  { href: "/claims", label: "Claims", icon: Scale },
  { href: "/sources", label: "Sources", icon: Library },
  { href: "/drafts", label: "Drafts", icon: PenLine },
];

export const systemNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export const navItems: NavItem[] = [...primaryNav, ...libraryNav, ...systemNav];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
