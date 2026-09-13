import api from "./client";
import type { Document } from "../../types/document";
import type { PlanDocument } from "../../types/plan";
import type { ExecutionDoc } from "../../types/execution";

export const documentsApi = {
  list: () => api.get<Document[]>("/api/documents"),
  get: (id: string) => api.get<Document>(`/api/documents/${id}`),
  create: (data: Partial<Document>) => api.post<Document>("/api/documents", data),
  update: (id: string, data: Partial<Document>) => api.put<Document>(`/api/documents/${id}`, data),
  delete: (id: string) => api.delete<void>(`/api/documents/${id}`),
};

export const planApi = {
  getDocument: (id: string) => api.get<PlanDocument>(`/api/documents/${id}/plan-document`),
  saveDocument: (id: string, document: PlanDocument) =>
    api.put<void>(`/api/documents/${id}/plan-document`, { document }),
};

export const executionApi = {
  getDoc: (id: string) => api.get<ExecutionDoc>(`/api/documents/${id}/execution-document`),
  saveDoc: (id: string, document: ExecutionDoc) =>
    api.put<void>(`/api/documents/${id}/execution-document`, { document }),
  initialize: (id: string) =>
    api.post<ExecutionDoc>(`/api/documents/${id}/execution-document/initialize`),
  adhoc: (id: string, title: string, notes?: string) =>
    api.post<ExecutionDoc>(`/api/documents/${id}/execution-document/adhoc`, { title, notes }),
};
