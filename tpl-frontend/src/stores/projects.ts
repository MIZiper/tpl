import { writable } from "svelte/store";
import type { Project, ProjectWithDetails } from "../types";
import { projectsApi } from "../lib/api";
import { getAllItems, putItem, deleteItem } from "../lib/db";

function createProjectStore() {
  const { subscribe, set, update } = writable<{
    items: Project[];
    current: ProjectWithDetails | null;
    loading: boolean;
    error: string | null;
  }>({
    items: [],
    current: null,
    loading: false,
    error: null,
  });

  async function load() {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      let items: Project[];
      if (window.navigator.onLine) {
        items = await projectsApi.list();
        for (const item of items) {
          await putItem("projects", item as unknown as Record<string, unknown>);
        }
      } else {
        items = await getAllItems<Project>("projects");
      }
      update((s) => ({ ...s, items, loading: false }));
    } catch (e) {
      try {
        const items = await getAllItems<Project>("projects");
        update((s) => ({ ...s, items, loading: false }));
      } catch {
        update((s) => ({ ...s, loading: false, error: String(e) }));
      }
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
      await putItem("projects", result as unknown as Record<string, unknown>);
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
      await putItem("projects", result as unknown as Record<string, unknown>);
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
      await deleteItem("projects", id);
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
