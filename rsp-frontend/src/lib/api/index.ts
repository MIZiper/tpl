import api from "./client";
import type {
  Risk,
  RiskCategory,
  RiskCause,
  RiskTag,
  RiskWithDetails,
  Solution,
  SolutionStep,
  SolutionWithDetails,
  Project,
  ProjectWithDetails,
  ProjectRisk,
  ProductModel,
  DesignPhase,
  AppliedSolution,
  AppliedSolutionWithDetails,
  Effectiveness,
  LessonsLearned,
} from "../../types";

export const riskCategoriesApi = {
  list: () => api.get<RiskCategory[]>("/api/risk-categories"),
  create: (data: Partial<RiskCategory>) => api.post<RiskCategory>("/api/risk-categories", data),
};

export const riskTagsApi = {
  list: () => api.get<RiskTag[]>("/api/risk-tags"),
  create: (data: Partial<RiskTag>) => api.post<RiskTag>("/api/risk-tags", data),
  addToRisk: (riskId: string, tagId: string) =>
    api.post(`/api/risks/${riskId}/tags`, { tag_id: tagId }),
  removeFromRisk: (riskId: string, tagId: string) =>
    api.delete<void>(`/api/risks/${riskId}/tags/${tagId}`),
};

export const risksApi = {
  list: (search?: string, categoryId?: string) =>
    api.get<Risk[]>(
      `/api/risks?${new URLSearchParams({
        ...(search ? { search } : {}),
        ...(categoryId ? { category_id: categoryId } : {}),
      })}`,
    ),
  get: (id: string) => api.get<RiskWithDetails>(`/api/risks/${id}`),
  create: (data: Partial<Risk>) => api.post<Risk>("/api/risks", data),
  update: (id: string, data: Partial<Risk>) => api.put<Risk>(`/api/risks/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/risks/${id}`),
  causes: {
    list: (riskId: string) => api.get<RiskCause[]>(`/api/risks/${riskId}/causes`),
    create: (riskId: string, data: Partial<RiskCause>) =>
      api.post<RiskCause>(`/api/risks/${riskId}/causes`, data),
    delete: (riskId: string, causeId: string) =>
      api.delete<void>(`/api/risks/${riskId}/causes/${causeId}`),
  },
};

export const solutionsApi = {
  list: (search?: string) =>
    api.get<Solution[]>(`/api/solutions${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  get: (id: string) => api.get<SolutionWithDetails>(`/api/solutions/${id}`),
  create: (data: Partial<Solution>) => api.post<Solution>("/api/solutions", data),
  update: (id: string, data: Partial<Solution>) => api.put<Solution>(`/api/solutions/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/solutions/${id}`),
  steps: {
    list: (solutionId: string) => api.get<SolutionStep[]>(`/api/solutions/${solutionId}/steps`),
    create: (solutionId: string, data: Record<string, unknown>) =>
      api.post<SolutionStep>(`/api/solutions/${solutionId}/steps`, data),
    update: (solutionId: string, stepId: string, data: Record<string, unknown>) =>
      api.put<SolutionStep>(`/api/solutions/${solutionId}/steps/${stepId}`, data),
    delete: (solutionId: string, stepId: string) =>
      api.delete<void>(`/api/solutions/${solutionId}/steps/${stepId}`),
  },
  risks: {
    list: (solutionId: string) => api.get<Risk[]>(`/api/solutions/${solutionId}/risks`),
    link: (solutionId: string, riskId: string, recommendationLevel?: number) =>
      api.post(`/api/solutions/${solutionId}/risks`, {
        risk_id: riskId,
        recommendation_level: recommendationLevel,
      }),
    unlink: (solutionId: string, riskId: string) =>
      api.delete<void>(`/api/solutions/${solutionId}/risks/${riskId}`),
  },
};

export const designPhasesApi = {
  list: () => api.get<DesignPhase[]>("/api/design-phases"),
  create: (data: Partial<DesignPhase>) => api.post<DesignPhase>("/api/design-phases", data),
};

export const projectsApi = {
  list: () => api.get<Project[]>("/api/projects"),
  get: (id: string) => api.get<ProjectWithDetails>(`/api/projects/${id}`),
  create: (data: Partial<Project>) => api.post<Project>("/api/projects", data),
  update: (id: string, data: Partial<Project>) => api.put<Project>(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/projects/${id}`),
  risks: {
    add: (projectId: string, data: Partial<ProjectRisk>) =>
      api.post<ProjectRisk>(`/api/projects/${projectId}/risks`, data),
    update: (projectId: string, projectRiskId: string, data: Partial<ProjectRisk>) =>
      api.put<ProjectRisk>(`/api/projects/${projectId}/risks/${projectRiskId}`, data),
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
  models: {
    list: (projectId: string) => api.get<ProductModel[]>(`/api/projects/${projectId}/models`),
    create: (projectId: string, data: Partial<ProductModel>) =>
      api.post<ProductModel>(`/api/projects/${projectId}/models`, data),
    delete: (projectId: string, modelId: string) =>
      api.delete<void>(`/api/projects/${projectId}/models/${modelId}`),
  },
  recommendations: (riskIds: string[]) =>
    api.get<Solution[]>(`/api/recommendations?risk_ids=${riskIds.join(",")}`),
};

export const fmeaApi = {
  applied: {
    list: (projectId: string, projectRiskId: string) =>
      api.get<AppliedSolutionWithDetails[]>(
        `/api/projects/${projectId}/risks/${projectRiskId}/applied-solutions`,
      ),
    create: (projectId: string, projectRiskId: string, data: Partial<AppliedSolution>) =>
      api.post<AppliedSolution>(
        `/api/projects/${projectId}/risks/${projectRiskId}/applied-solutions`,
        data,
      ),
    update: (appliedId: string, data: Partial<AppliedSolution>) =>
      api.put<AppliedSolution>(`/api/applied-solutions/${appliedId}`, data),
    delete: (appliedId: string) => api.delete<void>(`/api/applied-solutions/${appliedId}`),
  },
  effectiveness: {
    create: (appliedId: string, data: Partial<Effectiveness>) =>
      api.post<Effectiveness>(`/api/applied-solutions/${appliedId}/effectiveness`, data),
  },
  lessons: {
    list: (projectId: string, projectRiskId: string) =>
      api.get<LessonsLearned[]>(`/api/projects/${projectId}/risks/${projectRiskId}/lessons`),
    create: (projectId: string, projectRiskId: string, data: Partial<LessonsLearned>) =>
      api.post<LessonsLearned>(
        `/api/projects/${projectId}/risks/${projectRiskId}/lessons`,
        data,
      ),
    update: (lessonId: string, data: Partial<LessonsLearned>) =>
      api.put<LessonsLearned>(`/api/lessons/${lessonId}`, data),
    delete: (lessonId: string) => api.delete<void>(`/api/lessons/${lessonId}`),
  },
};
