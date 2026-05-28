import api from "./client";
import type {
  Risk,
  Solution,
  SolutionWithDetails,
  Project,
  ProjectWithDetails,
  PlanTree,
  PlanGroup,
  PlanStep,
  StepExecution,
  ExecutionStats,
  SyncPayload,
} from "../../types";
import type { PlanDocument } from "../../types/plan";

export const risksApi = {
  list: (search?: string) =>
    api.get<Risk[]>(`/api/risks${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  get: (id: string) => api.get<Risk>(`/api/risks/${id}`),
  create: (data: Partial<Risk>) => api.post<Risk>("/api/risks", data),
  update: (id: string, data: Partial<Risk>) => api.put<Risk>(`/api/risks/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/risks/${id}`),
};

export const solutionsApi = {
  list: (search?: string) =>
    api.get<Solution[]>(`/api/solutions${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  get: (id: string) => api.get<SolutionWithDetails>(`/api/solutions/${id}`),
  create: (data: Partial<Solution>) => api.post<Solution>("/api/solutions", data),
  update: (id: string, data: Partial<Solution>) => api.put<Solution>(`/api/solutions/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/solutions/${id}`),
  steps: {
    list: (solutionId: string) => api.get<SolutionWithDetails["steps"]>(`/api/solutions/${solutionId}/steps`),
    create: (solutionId: string, data: Record<string, unknown>) =>
      api.post(`/api/solutions/${solutionId}/steps`, data),
    update: (solutionId: string, stepId: string, data: Record<string, unknown>) =>
      api.put(`/api/solutions/${solutionId}/steps/${stepId}`, data),
    delete: (solutionId: string, stepId: string) =>
      api.delete<void>(`/api/solutions/${solutionId}/steps/${stepId}`),
    reorder: (solutionId: string, stepIds: string[]) =>
      api.put(`/api/solutions/${solutionId}/steps/reorder`, { items: stepIds.map((id, i) => ({ id, order_index: i })) }),
  },
  risks: {
    list: (solutionId: string) => api.get<Risk[]>(`/api/solutions/${solutionId}/risks`),
    link: (solutionId: string, riskId: string) =>
      api.post(`/api/solutions/${solutionId}/risks`, { risk_id: riskId }),
    unlink: (solutionId: string, riskId: string) =>
      api.delete<void>(`/api/solutions/${solutionId}/risks/${riskId}`),
  },
};

export const projectsApi = {
  list: () => api.get<Project[]>("/api/projects"),
  get: (id: string) => api.get<ProjectWithDetails>(`/api/projects/${id}`),
  create: (data: Partial<Project>) => api.post<Project>("/api/projects", data),
  update: (id: string, data: Partial<Project>) => api.put<Project>(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/projects/${id}`),
  risks: {
    list: (projectId: string) => api.get(`/api/projects/${projectId}/risks`),
    add: (projectId: string, data: { risk_id: string; covered_by_previous?: boolean; covering_solution_id?: string }) =>
      api.post(`/api/projects/${projectId}/risks`, data),
    remove: (projectId: string, riskId: string) =>
      api.delete<void>(`/api/projects/${projectId}/risks/${riskId}`),
  },
  solutions: {
    list: (projectId: string) => api.get<Solution[]>(`/api/projects/${projectId}/solutions`),
    add: (projectId: string, solutionId: string) =>
      api.post(`/api/projects/${projectId}/solutions`, { solution_id: solutionId }),
    remove: (projectId: string, solutionId: string) =>
      api.delete<void>(`/api/projects/${projectId}/solutions/${solutionId}`),
  },
  recommendations: (riskIds: string[]) =>
    api.get<Solution[]>(`/api/recommendations?risk_ids=${riskIds.join(",")}`),
};

export const planApi = {
  get: (projectId: string) => api.get<PlanTree>(`/api/projects/${projectId}/plan`),
  initialize: (projectId: string) => api.post<PlanTree>(`/api/projects/${projectId}/plan/initialize`),

  getDocument: (projectId: string) => api.get<PlanDocument>(`/api/projects/${projectId}/plan-document`),
  saveDocument: (projectId: string, document: PlanDocument) =>
    api.put<void>(`/api/projects/${projectId}/plan-document`, { document }),

  groups: {
    create: (projectId: string, data: Partial<PlanGroup>) =>
      api.post<PlanGroup>(`/api/projects/${projectId}/plan/groups`, data),
    update: (projectId: string, groupId: string, data: Partial<PlanGroup>) =>
      api.put<PlanGroup>(`/api/projects/${projectId}/plan/groups/${groupId}`, data),
    delete: (projectId: string, groupId: string) =>
      api.delete<void>(`/api/projects/${projectId}/plan/groups/${groupId}`),
  },
  steps: {
    create: (projectId: string, data: Partial<PlanStep>) =>
      api.post<PlanStep>(`/api/projects/${projectId}/plan/steps`, data),
    update: (projectId: string, stepId: string, data: Partial<PlanStep>) =>
      api.put<PlanStep>(`/api/projects/${projectId}/plan/steps/${stepId}`, data),
    delete: (projectId: string, stepId: string) =>
      api.delete<void>(`/api/projects/${projectId}/plan/steps/${stepId}`),
  },
  reorder: (projectId: string, items: { id: string; group_id?: string; order_index: number }[]) =>
    api.put(`/api/projects/${projectId}/plan/reorder`, { items }),
};

export const loggingApi = {
  list: (projectId: string) => api.get<StepExecution[]>(`/api/projects/${projectId}/executions`),
  current: (projectId: string) => api.get<StepExecution>(`/api/projects/${projectId}/executions/current`),
  start: (projectId: string, data: { plan_step_id: string; execution_number?: number }) =>
    api.post<StepExecution>(`/api/projects/${projectId}/executions/start`, data),
  complete: (projectId: string, executionId: string, data: { completion_check?: string; notes?: string }) =>
    api.post<StepExecution>(`/api/projects/${projectId}/executions/${executionId}/complete`, data),
  skip: (projectId: string, executionId: string, data: { notes?: string }) =>
    api.post<StepExecution>(`/api/projects/${projectId}/executions/${executionId}/skip`, data),
  incident: {
    create: (projectId: string, data: { plan_step_id?: string; notes?: string }) =>
      api.post<StepExecution>(`/api/projects/${projectId}/executions/incident`, data),
    resolve: (
      projectId: string,
      incidentId: string,
      data: { reason: string; category?: string; notes?: string }
    ) =>
      api.post<StepExecution>(`/api/projects/${projectId}/executions/incident/${incidentId}/resolve`, data),
  },
  adhoc: (projectId: string, data: { title: string; description?: string; notes?: string }) =>
    api.post<StepExecution>(`/api/projects/${projectId}/executions/adhoc`, data),
  stats: (projectId: string) => api.get<ExecutionStats>(`/api/projects/${projectId}/executions/stats`),
};

export const syncApi = {
  sync: (data: SyncPayload) => api.post("/api/sync", data),
  exportProject: (projectId: string) => api.get(`/api/export/projects/${projectId}`),
  exportRisk: (riskId: string) => api.get(`/api/export/risks/${riskId}`),
  exportSolution: (solutionId: string) => api.get(`/api/export/solutions/${solutionId}`),
};
