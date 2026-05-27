import { writable } from "svelte/store";
import type { PlanTree, PlanGroup, PlanStep } from "../types";
import { planApi } from "../lib/api";

function createPlanStore() {
  const { subscribe, set, update } = writable<{
    tree: PlanTree | null;
    loading: boolean;
    isDirty: boolean;
    selectedStep: PlanStep | null;
    error: string | null;
  }>({
    tree: null,
    loading: false,
    isDirty: false,
    selectedStep: null,
    error: null,
  });

  async function load(projectId: string) {
    update((s) => ({ ...s, loading: true, error: null }));
    try {
      const tree = await planApi.get(projectId);
      update((s) => ({ ...s, tree, loading: false, isDirty: false }));
    } catch (e) {
      update((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }

  async function initialize(projectId: string): Promise<PlanTree | null> {
    try {
      const tree = await planApi.initialize(projectId);
      update((s) => ({ ...s, tree, isDirty: true }));
      return tree;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  function selectStep(step: PlanStep | null) {
    update((s) => ({ ...s, selectedStep: step }));
  }

  return { subscribe, load, initialize, selectStep };
}

export const planStore = createPlanStore();
