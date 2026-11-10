"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { hasAnyPermission, hasPermission } from "./permissions";
import type { AccessContext } from "./menu";

const NO_PERMISSIONS: string[] = [];
const NO_ROLES: string[] = [];

/** True when the signed-in user holds the permission ("ar.invoice.*" matches any action). */
export function usePermission(permission: string): boolean {
  const permissions = useSession((s) => s.user?.permissions ?? NO_PERMISSIONS);
  return hasPermission(permissions, permission);
}

export function useAnyPermission(required: readonly string[]): boolean {
  const permissions = useSession((s) => s.user?.permissions ?? NO_PERMISSIONS);
  return hasAnyPermission(permissions, required);
}

export function useAccessContext(): AccessContext {
  const roles = useSession((s) => s.user?.roles ?? NO_ROLES);
  const permissions = useSession((s) => s.user?.permissions ?? NO_PERMISSIONS);
  return { roles, permissions, flags: { inventory: config.featureInventory } };
}

interface CanProps {
  /** One permission, or several of which any one is enough. */
  permission: string | readonly string[];
  children: ReactNode;
  /** Shown instead when the user lacks the permission (default: nothing, i.e. the action is hidden). */
  fallback?: ReactNode;
}

/**
 * Hide actions the user cannot do (prompt §5). The backend still enforces every permission
 * (SRS FR-RBAC-009); this is for usability only.
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const required = typeof permission === "string" ? [permission] : permission;
  const allowed = useAnyPermission(required);
  return <>{allowed ? children : fallback}</>;
}
