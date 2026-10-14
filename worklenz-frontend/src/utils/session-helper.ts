import { ILocalSession } from '@/types/auth/local-session.types';
import { normalizeRoleName } from '@/utils/role-permissions.utils';
import { ROLE_NAMES } from '@/types/roles/role.types';

export const WORKLENZ_SESSION_ID = import.meta.env.VITE_WORKLENZ_SESSION_ID;
const storage: Storage = localStorage;

export function setSession(user: ILocalSession): void {
  storage.setItem(WORKLENZ_SESSION_ID, btoa(unescape(encodeURIComponent(JSON.stringify(user)))));
  // storage.setItem(WORKLENZ_SESSION_ID, btoa(JSON.stringify(user)));
}

export function getUserSession(): ILocalSession | null {
  try {
    // Inverse of setSession: base64 -> UTF-8 bytes -> string. Plain atob() alone
    // would yield Latin-1 and mangle non-ASCII characters (e.g. "ó" -> "Ã³").
    const binary = atob(<string>storage.getItem(WORKLENZ_SESSION_ID));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return null;
  }
}

export function hasSession() {
  return !!storage.getItem(WORKLENZ_SESSION_ID);
}

export function deleteSession() {
  storage.removeItem(WORKLENZ_SESSION_ID);
}

export function getRole() {
  const session = getUserSession();
  if (!session) return 'Unknown';
  if (session.owner) return ROLE_NAMES.OWNER;
  if (session.is_admin) return ROLE_NAMES.ADMIN;
  return normalizeRoleName(session.role_name);
}
