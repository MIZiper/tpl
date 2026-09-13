import { writable } from "svelte/store";
import type { Project, ProjectWithDetails } from "../types";
import { projectsApi } from "../lib/api";

function createProjectStore() {
  const { subscribe, update } = writable<{
    items: Project[];
    current: ProjectWithDetails | null;
    loading: boolean;
    error: string | null;
  }>({ items: [], current: null, loading: false, error: null });

  async function load() {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      const items = await projectsApi.list();
      update((s) => ({ ...s, items, loading: false }));
    } catch (e) {
      update((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }

  async function get(id: string): Promise<ProjectWithDetails | null> {
    try {
      const project = await projectsApi.get(id);
      update((s) => ({ ...s, current: project }));
      return project;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function create(data: Partial<Project>): Promise<Project | null> {
    try {
      const result = await projectsApi.create(data);
      update((s) => ({ ...s, items: [...s.items, result] }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function updateItem(id: string, data: Partial<Project>): Promise<Project | null> {
    try {
      const result = await projectsApi.update(id, data);
      update((s) => ({
        ...s,
        items: s.items.map((p) => (p.id === id ? result : p)),
        current: s.current?.id === id ? { ...s.current, ...result } : s.current,
      }));
      return result;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await projectsApi.delete(id);
      update((s) => ({
        ...s,
        items: s.items.filter((p) => p.id !== id),
        current: s.current?.id === id ? null : s.current,
      }));
      return true;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return false;
    }
  }

  return { subscribe, load, get, create, update: updateItem, remove };
}

export const projectStore = createProjectStore();
