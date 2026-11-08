import {
  Archive,
  CheckSquare,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The product is an approve queue. Old desk routes stay in the repo but leave the menu. */
export const primaryNav: NavItem[] = [
  { href: "/", label: "Approve", icon: CheckSquare },
  { href: "/published", label: "Published", icon: Archive },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const libraryNav: NavItem[] = [];

export const systemNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];

export const navItems: NavItem[] = [...primaryNav];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
