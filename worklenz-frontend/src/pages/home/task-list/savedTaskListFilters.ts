import type { Key } from 'react';

/**
 * Overview task list filters remembered per user in this browser, so they survive page changes
 * and reloads until the user resets them.
 */
export interface ISavedTaskListFilters {
  tab: string;
  projectIds: Key[];
  priorityIds: Key[];
  sortField: SavedSortField;
  sortOrder: 'asc' | 'desc';
}

export type SavedSortField = 'name' | 'project_name' | 'end_date' | 'priority' | null;

export const DEFAULT_TASK_LIST_FILTERS: ISavedTaskListFilters = {
  tab: 'All',
  projectIds: [],
  priorityIds: [],
  sortField: null,
  sortOrder: 'asc',
};

const storageKey = (userId?: string) => `worklenz.home.taskFilters.${userId || 'anonymous'}`;

export const readSavedTaskListFilters = (userId?: string): ISavedTaskListFilters => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_TASK_LIST_FILTERS;
    const parsed = JSON.parse(raw) as Partial<ISavedTaskListFilters>;
    return {
      tab: typeof parsed.tab === 'string' ? parsed.tab : DEFAULT_TASK_LIST_FILTERS.tab,
      projectIds: Array.isArray(parsed.projectIds) ? parsed.projectIds : [],
      priorityIds: Array.isArray(parsed.priorityIds) ? parsed.priorityIds : [],
      sortField: SORT_FIELDS.includes(parsed.sortField ?? null) ? (parsed.sortField ?? null) : null,
      sortOrder: parsed.sortOrder === 'desc' ? 'desc' : 'asc',
    };
  } catch {
    return DEFAULT_TASK_LIST_FILTERS;
  }
};

export const writeSavedTaskListFilters = (
  userId: string | undefined,
  filters: ISavedTaskListFilters
) => {
  try {
    if (hasActiveTaskListFilters(filters)) {
      localStorage.setItem(storageKey(userId), JSON.stringify(filters));
    } else {
      localStorage.removeItem(storageKey(userId));
    }
  } catch {
    // Storage unavailable (private mode): filters then last until the page is left.
  }
};

/** True when anything differs from the defaults, i.e. there is something to reset. */
export const hasActiveTaskListFilters = (filters: ISavedTaskListFilters) =>
  filters.tab !== DEFAULT_TASK_LIST_FILTERS.tab ||
  filters.projectIds.length > 0 ||
  filters.priorityIds.length > 0 ||
  filters.sortField !== null;

const SORT_FIELDS: SavedSortField[] = ['name', 'project_name', 'end_date', 'priority', null];
