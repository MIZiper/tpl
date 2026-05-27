import { writable } from "svelte/store";
import type { StepExecution, ExecutionStats } from "../types";
import { loggingApi } from "../lib/api";

function createLoggingStore() {
  const { subscribe, set, update } = writable<{
    currentProjectId: string | null;
    currentExecution: StepExecution | null;
    executions: StepExecution[];
    incidentActive: boolean;
    stats: ExecutionStats | null;
    loading: boolean;
    error: string | null;
  }>({
    currentProjectId: null,
    currentExecution: null,
    executions: [],
    incidentActive: false,
    stats: null,
    loading: false,
    error: null,
  });

  async function loadProject(projectId: string) {
    update((s) => ({ ...s, currentProjectId: projectId, loading: true, error: null }));
    try {
      const [executions, current] = await Promise.all([
        loggingApi.list(projectId),
        loggingApi.current(projectId).catch(() => null),
      ]);
      update((s) => ({
        ...s,
        executions,
        currentExecution: current,
        incidentActive: current?.type === "incident" && current.status === "in_progress",
        loading: false,
      }));
    } catch (e) {
      update((s) => ({ ...s, loading: false, error: String(e) }));
    }
  }

  async function loadStats(projectId: string) {
    try {
      const stats = await loggingApi.stats(projectId);
      update((s) => ({ ...s, stats }));
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  }

  async function startStep(projectId: string, planStepId: string, executionNumber = 1): Promise<StepExecution | null> {
    try {
      const execution = await loggingApi.start(projectId, { plan_step_id: planStepId, execution_number: executionNumber });
      await loadProject(projectId);
      return execution;
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
      return null;
    }
  }

  async function completeStep(projectId: string, executionId: string, completionCheck?: string, notes?: string) {
    try {
      await loggingApi.complete(projectId, executionId, { completion_check: completionCheck, notes });
      await loadProject(projectId);
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
    }
  }

  async function skipStep(projectId: string, executionId: string, notes?: string) {
    try {
      await loggingApi.skip(projectId, executionId, { notes });
      await loadProject(projectId);
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
    }
  }

  async function createIncident(projectId: string, planStepId?: string, notes?: string) {
    try {
      await loggingApi.incident.create(projectId, { plan_step_id: planStepId, notes });
      await loadProject(projectId);
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
    }
  }

  async function resolveIncident(projectId: string, incidentId: string, reason: string, category?: string, notes?: string) {
    try {
      await loggingApi.incident.resolve(projectId, incidentId, { reason, category, notes });
      await loadProject(projectId);
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
    }
  }

  async function createAdhoc(projectId: string, title: string, description?: string, notes?: string) {
    try {
      await loggingApi.adhoc(projectId, { title, description, notes });
      await loadProject(projectId);
    } catch (e) {
      update((s) => ({ ...s, error: String(e) }));
    }
  }

  return {
    subscribe,
    loadProject,
    loadStats,
    startStep,
    completeStep,
    skipStep,
    createIncident,
    resolveIncident,
    createAdhoc,
  };
}

export const loggingStore = createLoggingStore();
