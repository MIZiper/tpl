import type { AuthState } from "./auth";
import type { Document } from "../types/document";

export const TPL_CREATE_ROLE = "nodes:create";
export const TPL_EDIT_ANY_ROLE = "nodes:edit_any";
export const TPL_ADMIN_ROLE = "tap:admin";

export function canCreate(auth: AuthState): boolean {
  if (!auth.enabled) return true;
  if (!auth.authenticated || !auth.sub) return false;
  return auth.roles.includes(TPL_CREATE_ROLE) || auth.roles.includes(TPL_ADMIN_ROLE);
}

export function canEdit(document: Document, auth: AuthState): boolean {
  if (!auth.enabled) return true;
  if (!auth.authenticated || !auth.sub) return false;
  if (auth.roles.includes(TPL_ADMIN_ROLE) || auth.roles.includes(TPL_EDIT_ANY_ROLE)) return true;
  if (!document.creator_sub) return true;
  return document.creator_sub === auth.sub;
}

export function canDelete(document: Document, auth: AuthState): boolean {
  if (!auth.enabled) return true;
  if (!auth.authenticated || !auth.sub) return false;
  if (auth.roles.includes(TPL_ADMIN_ROLE)) return true;
  if (!document.creator_sub) return false;
  if (auth.roles.includes(TPL_EDIT_ANY_ROLE)) return true;
  return document.creator_sub === auth.sub;
}
