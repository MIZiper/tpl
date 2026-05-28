import { writable, derived, get } from "svelte/store";
import type { PlanDocument, PlanNode, PlanFieldDef, PlanDefinitions, FieldBinding } from "../types/plan";
import {
  createDefaultDocument,
  findNode,
  insertNode,
  removeNode,
  updateNode,
  duplicateNode,
  moveNodeUp,
  moveNodeDown,
  addDefinition,
  removeDefinition,
  generateId,
  deepClone,
  definitionsToFieldBindings,
} from "../lib/plan-utils";

export type DefinitionCategory = keyof PlanDefinitions;

interface PlanState {
  document: PlanDocument | null;
  selectedNodeId: string | null;
  dirty: boolean;
  loading: boolean;
  error: string | null;
}

export const planState = writable<PlanState>({
  document: null,
  selectedNodeId: null,
  dirty: false,
  loading: false,
  error: null,
});

export const selectedNode = derived(planState, ($s) => {
  if (!$s.document || !$s.selectedNodeId) return null;
  return findNode($s.document.root, $s.selectedNodeId);
});

function patch(partial: Partial<PlanState>) {
  planState.update((s) => ({ ...s, ...partial }));
}

export async function loadDoc(projectId: string, getDocument: (id: string) => Promise<PlanDocument>) {
  patch({ loading: true, error: null });
  try {
    const doc = await getDocument(projectId);
    planState.update((s) => ({ ...s, document: doc, dirty: false, loading: false }));
  } catch {
    planState.update((s) => ({ ...s, document: createDefaultDocument(), loading: false }));
  }
}

export async function saveDoc(projectId: string, saveDocument: (id: string, doc: PlanDocument) => Promise<void>) {
  const doc = get(planState).document;
  if (!doc) return;
  try {
    await saveDocument(projectId, doc);
    patch({ dirty: false });
  } catch (e: any) {
    patch({ error: String(e) });
  }
}

export async function initDoc(projectId: string, initialize: (id: string) => Promise<PlanDocument>) {
  patch({ loading: true });
  try {
    const doc = await initialize(projectId);
    planState.update((s) => ({ ...s, document: doc, dirty: true, loading: false }));
  } catch (e: any) {
    patch({ error: String(e), loading: false });
  }
}

export function selectNode(nodeId: string | null) {
  patch({ selectedNodeId: nodeId });
}

function modDoc(transform: (doc: PlanDocument) => PlanDocument) {
  planState.update((s) => {
    if (!s.document) return s;
    return { ...s, document: transform(s.document), dirty: true };
  });
}

export function addStep(parentId: string | null, index?: number) {
  planState.update((s) => {
    if (!s.document) return s;
    const step: PlanNode = {
      id: generateId(), type: "step", title: "New Step", children: [],
      description: null, duration_minutes: 60, changeover_minutes: 0,
      input_conditions: [], collection_items: [], completion_criteria: [],
      system_config: null, required_executions: 1,
      step_template_id: null, solution_step_id: null,
    };
    const parent = parentId ? findNode(s.document.root, parentId) : null;
    const siblings = parent?.children ?? s.document.root;
    const newRoot = insertNode(s.document.root, step, parentId, index ?? siblings.length);
    return { ...s, document: { ...s.document, root: newRoot }, selectedNodeId: step.id, dirty: true };
  });
}

export function addGroup(parentId: string | null, index?: number) {
  planState.update((s) => {
    if (!s.document) return s;
    const group: PlanNode = {
      id: generateId(), type: "group", title: "New Group", children: [],
      description: null, duration_minutes: 60, changeover_minutes: 0,
      input_conditions: [], collection_items: [], completion_criteria: [],
      system_config: null, required_executions: 1,
      step_template_id: null, solution_step_id: null,
    };
    const parent = parentId ? findNode(s.document.root, parentId) : null;
    const siblings = parent?.children ?? s.document.root;
    const newRoot = insertNode(s.document.root, group, parentId, index ?? siblings.length);
    return { ...s, document: { ...s.document, root: newRoot }, selectedNodeId: group.id, dirty: true };
  });
}

export function dupNode(nodeId: string) {
  modDoc((doc) => ({ ...doc, root: duplicateNode(doc.root, nodeId) }));
}

export function delNode(nodeId: string) {
  planState.update((s) => {
    if (!s.document) return s;
    return { ...s, document: { ...s.document, root: removeNode(s.document.root, nodeId) }, selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId, dirty: true };
  });
}

export function updateSelected(patchObj: Partial<PlanNode>) {
  planState.update((s) => {
    if (!s.document || !s.selectedNodeId) return s;
    return { ...s, document: { ...s.document, root: updateNode(s.document.root, s.selectedNodeId, patchObj) }, dirty: true };
  });
}

export function moveUp(nodeId: string) { modDoc((doc) => ({ ...doc, root: moveNodeUp(doc.root, nodeId) })); }
export function moveDown(nodeId: string) { modDoc((doc) => ({ ...doc, root: moveNodeDown(doc.root, nodeId) })); }

export function addDef(category: DefinitionCategory, field: Omit<PlanFieldDef, "id">) {
  modDoc((doc) => ({ ...doc, definitions: addDefinition(doc.definitions, category, { ...field, id: generateId() }) }));
}

export function removeDef(category: DefinitionCategory, fieldId: string) {
  modDoc((doc) => ({ ...doc, definitions: removeDefinition(doc.definitions, category, fieldId) }));
}

export function addTemplate(name: string, stepId: string) {
  modDoc((doc) => {
    const node = findNode(doc.root, stepId);
    if (!node || node.type !== "step") return doc;
    return { ...doc, templates: [...doc.templates, { id: generateId(), name, step: deepClone(node) }] };
  });
}

export function applyTemplate(templateId: string, parentId: string | null) {
  planState.update((s) => {
    if (!s.document) return s;
    const t = s.document.templates.find((t) => t.id === templateId);
    if (!t) return s;
    const clone = deepClone(t.step);
    clone.id = generateId();
    clone.step_template_id = templateId;
    const parent = parentId ? findNode(s.document.root, parentId) : null;
    const siblings = parent?.children ?? s.document.root;
    return { ...s, document: { ...s.document, root: insertNode(s.document.root, clone, parentId, siblings.length) }, selectedNodeId: clone.id, dirty: true };
  });
}

export function delTemplate(templateId: string) {
  modDoc((doc) => ({ ...doc, templates: doc.templates.filter((t) => t.id !== templateId) }));
}

export function exportJSON() {
  const doc = get(planState).document;
  if (!doc) return;
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plan.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(jsonString: string): boolean {
  try {
    const doc = JSON.parse(jsonString) as PlanDocument;
    planState.update((s) => ({ ...s, document: doc, dirty: true, error: null }));
    return true;
  } catch (e: any) {
    patch({ error: "Failed to parse JSON: " + String(e) });
    return false;
  }
}

export function syncFieldBindings(stepId: string) {
  modDoc((doc) => {
    const node = findNode(doc.root, stepId);
    if (!node || node.type !== "step") return doc;
    return {
      ...doc,
      root: updateNode(doc.root, stepId, {
        input_conditions: definitionsToFieldBindings(doc.definitions.input_conditions),
        collection_items: definitionsToFieldBindings(doc.definitions.collection_items),
        completion_criteria: definitionsToFieldBindings(doc.definitions.completion_criteria),
      }),
    };
  });
}
