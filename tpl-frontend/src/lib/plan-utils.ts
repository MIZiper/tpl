import type {
  PlanNode,
  PlanDocument,
  PlanDefinitions,
  PlanFieldDef,
  FieldBinding,
  TransformDef,
  TransformOutputBinding,
} from "../types/plan";
import { createStructValue, createBindingValue, type Value } from "./values";
import { getTransform } from "./transforms";

let _counter = 0;
const prefix = Math.random().toString(36).slice(2, 8);

export function generateId(): string {
  _counter++;
  return `${prefix}-${_counter}-${Date.now().toString(36)}`;
}

export function createDefaultDocument(): PlanDocument {
  return {
    version: 3,
    definitions: {
      input_conditions: [],
      collection_items: [],
      completion_criteria: [],
      custom: [],
    },
    root: [],
    templates: [],
    transforms: [],
  };
}

export function createStepNode(title: string = "New Step"): PlanNode {
  return {
    id: generateId(),
    type: "step",
    title,
    children: [],
    description: null,
    duration_minutes: 60,
    changeover_minutes: 0,
    input_conditions: [],
    collection_items: [],
    completion_criteria: [],
    required_executions: 1,
    step_template_id: null,
    solution_step_id: null,
  };
}

export function createGroupNode(title: string = "New Group"): PlanNode {
  return {
    id: generateId(),
    type: "group",
    title,
    children: [],
    description: null,
    duration_minutes: 60,
    changeover_minutes: 0,
    input_conditions: [],
    collection_items: [],
    completion_criteria: [],
    required_executions: 1,
    step_template_id: null,
    solution_step_id: null,
  };
}

export function findNode(root: PlanNode[], nodeId: string): PlanNode | null {
  for (const node of root) {
    if (node.id === nodeId) return node;
    if (node.type === "group") {
      const found = findNode(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function findParentNode(root: PlanNode[], nodeId: string): PlanNode | null {
  for (const node of root) {
    if (node.type === "group") {
      if (node.children.some((c: PlanNode) => c.id === nodeId)) return node;
      const found = findParentNode(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function findNodePath(root: PlanNode[], nodeId: string): PlanNode[] {
  function walk(nodes: PlanNode[], path: PlanNode[]): PlanNode[] | null {
    for (const node of nodes) {
      const current = [...path, node];
      if (node.id === nodeId) return current;
      if (node.type === "group") {
        const found = walk(node.children, current);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(root, []) ?? [];
}

export function insertNode(
  root: PlanNode[],
  node: PlanNode,
  parentId: string | null,
  index: number
): PlanNode[] {
  if (parentId === null) {
    const copy = [...root];
    copy.splice(Math.max(0, Math.min(index, copy.length)), 0, node);
    return copy;
  }
  return root.map((n) => {
    if (n.id === parentId && n.type === "group") {
      const children = [...n.children];
      children.splice(Math.max(0, Math.min(index, children.length)), 0, node);
      return { ...n, children };
    }
    if (n.type === "group") {
      return { ...n, children: insertNode(n.children, node, parentId, index) };
    }
    return n;
  });
}

export function removeNode(root: PlanNode[], nodeId: string): PlanNode[] {
  return root
    .filter((n) => n.id !== nodeId)
    .map((n) => {
      if (n.type === "group") {
        return { ...n, children: removeNode(n.children, nodeId) };
      }
      return n;
    });
}

export function updateNode(root: PlanNode[], nodeId: string, patch: Partial<PlanNode>): PlanNode[] {
  return root.map((n) => {
    if (n.id === nodeId) {
      return { ...n, ...patch };
    }
    if (n.type === "group") {
      return { ...n, children: updateNode(n.children, nodeId, patch) };
    }
    return n;
  });
}

export function moveNodeUp(root: PlanNode[], nodeId: string): PlanNode[] {
  const parent = findParentNode(root, nodeId);
  const siblings = parent ? parent.children : root;
  const idx = siblings.findIndex((n: PlanNode) => n.id === nodeId);
  if (idx <= 0) return root;
  const newSiblings = [...siblings];
  [newSiblings[idx - 1], newSiblings[idx]] = [newSiblings[idx], newSiblings[idx - 1]];
  if (parent) {
    return updateNode(root, parent.id, { children: newSiblings });
  }
  return newSiblings;
}

export function moveNodeDown(root: PlanNode[], nodeId: string): PlanNode[] {
  const parent = findParentNode(root, nodeId);
  const siblings = parent ? parent.children : root;
  const idx = siblings.findIndex((n: PlanNode) => n.id === nodeId);
  if (idx < 0 || idx >= siblings.length - 1) return root;
  const newSiblings = [...siblings];
  [newSiblings[idx], newSiblings[idx + 1]] = [newSiblings[idx + 1], newSiblings[idx]];
  if (parent) {
    return updateNode(root, parent.id, { children: newSiblings });
  }
  return newSiblings;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function parseNum(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function parseNumInt(v: string, fallback: number): number {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

export function duplicateNode(root: PlanNode[], nodeId: string): PlanNode[] {
  const node = findNode(root, nodeId);
  if (!node) return root;
  const clone = deepClone(node);
  clone.id = generateId();
  if (clone.type === "group") {
    const reId = (n: PlanNode) => {
      n.id = generateId();
      if (n.type === "group") n.children.forEach(reId);
    };
    clone.children.forEach(reId);
  }
  const parent = findParentNode(root, nodeId);
  const siblings = parent ? parent.children : root;
  const idx = siblings.findIndex((n: PlanNode) => n.id === nodeId);
  return insertNode(root, clone, parent?.id ?? null, idx + 1);
}

export function addDefinition(
  defs: PlanDefinitions,
  category: keyof PlanDefinitions,
  field: PlanFieldDef
): PlanDefinitions {
  return {
    ...defs,
    [category]: [...defs[category], { ...field, id: field.id || generateId() }],
  };
}

export function removeDefinition(
  defs: PlanDefinitions,
  category: keyof PlanDefinitions,
  fieldId: string
): PlanDefinitions {
  return {
    ...defs,
    [category]: defs[category].filter((f: PlanFieldDef) => f.id !== fieldId),
  };
}

export function updateDefinition(
  defs: PlanDefinitions,
  category: keyof PlanDefinitions,
  field: PlanFieldDef
): PlanDefinitions {
  return {
    ...defs,
    [category]: defs[category].map((f: PlanFieldDef) => (f.id === field.id ? { ...f, ...field } : f)),
  };
}

export function flattenAllSteps(root: PlanNode[]): PlanNode[] {
  const result: PlanNode[] = [];
  for (const node of root) {
    if (node.type === "step") result.push(node);
    if (node.type === "group") result.push(...flattenAllSteps(node.children));
  }
  return result;
}

export function downloadJSON(doc: PlanDocument, filename: string = "plan.json") {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readJSONFile(file: File): Promise<PlanDocument> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(reader.result as string) as PlanDocument;
        resolve(doc);
      } catch {
        reject(new Error("Invalid JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function definitionsToFieldBindings(defs: PlanFieldDef[]): FieldBinding[] {
  return defs.map((d) => ({
    definition_id: d.id,
    value: null,
  }));
}

export function getDerivedDefinitions(defs: PlanDefinitions): PlanFieldDef[] {
  const all: PlanFieldDef[] = [
    ...defs.input_conditions,
    ...defs.collection_items,
    ...defs.completion_criteria,
    ...defs.custom,
  ];
  return all.filter((d) => d.derived === true);
}

export function allDefinitions(defs: PlanDefinitions): PlanFieldDef[] {
  return [
    ...defs.input_conditions,
    ...defs.collection_items,
    ...defs.completion_criteria,
    ...defs.custom,
  ];
}

export function findDefinition(defs: PlanDefinitions, id: string): PlanFieldDef | undefined {
  return allDefinitions(defs).find((d) => d.id === id);
}

export interface StepOutputs {
  byTransform: Record<string, Record<string, Value>>;
  byDef: Record<string, Value>;
}

// Resolve a transform's output bindings, falling back to the legacy single
// `derivedDefId` field for documents written before multi-output existed.
export function outputsOf(t: TransformDef): TransformOutputBinding[] {
  if (t.outputs && t.outputs.length) return t.outputs;
  if (t.derivedDefId) {
    const cls = getTransform(t.typeId);
    const role = cls?.outputs()[0]?.role ?? "value";
    return [{ role, definitionId: t.derivedDefId }];
  }
  return [];
}

// Build the bound Value map for a step from its non-derived input/collection
// bindings — the source values transforms read from.
export function nodeBindingValues(
  definitions: PlanDefinitions,
  node: { input_conditions: FieldBinding[]; collection_items: FieldBinding[] }
): Record<string, Value> {
  const map: Record<string, Value> = {};
  for (const b of [...node.input_conditions, ...node.collection_items]) {
    const def = findDefinition(definitions, b.definition_id);
    if (!def || def.derived === true) continue;
    map[b.definition_id] = createBindingValue(b, def);
  }
  return map;
}

// Evaluate all transforms for a step. `valuesByDefId` maps definition id ->
// the bound Value (built from the step's bindings). Returns the computed
// outputs keyed both by transform id and by derived definition id.
export function computeStepOutputs(
  transforms: TransformDef[],
  definitions: PlanDefinitions,
  valuesByDefId: Record<string, Value>
): StepOutputs {
  const byTransform: Record<string, Record<string, Value>> = {};
  const byDef: Record<string, Value> = {};
  if (!transforms.length) return { byTransform, byDef };

  const sorted = topologicalSortTransforms(transforms);
  const outByDefId = new Map<string, Value>();

  for (const t of sorted) {
    const cls = getTransform(t.typeId);
    if (!cls) continue;
    const inputs: Record<string, Value> = {};
    let resolved = true;
    for (const inb of t.inputs) {
      let src = outByDefId.get(inb.definitionId) ?? valuesByDefId[inb.definitionId];
      if (!src) {
        const def = findDefinition(definitions, inb.definitionId);
        if (def?.typeId === "struct") src = createStructValue(def);
      }
      if (!src) { resolved = false; break; }
      inputs[inb.role] = src;
    }
    if (!resolved) continue;
    const outs = outputsOf(t);
    const firstDef = outs.length ? findDefinition(definitions, outs[0].definitionId) : undefined;
    const derivedUnit = firstDef?.params?.unit != null ? String(firstDef.params.unit) : null;
    const applied = cls.apply(inputs, { ...t.params, derived_unit: derivedUnit });
    const row: Record<string, Value> = {};
    for (const ob of outs) {
      const out = applied[ob.role];
      if (!out) continue;
      row[ob.role] = out;
      outByDefId.set(ob.definitionId, out);
      byDef[ob.definitionId] = out;
    }
    byTransform[t.id] = row;
  }

  return { byTransform, byDef };
}

function topologicalSortTransforms(transforms: TransformDef[]): TransformDef[] {
  const tfById = new Map<string, TransformDef>();
  const incoming = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const t of transforms) {
    tfById.set(t.id, t);
    incoming.set(t.id, 0);
    adjacency.set(t.id, []);
  }

  for (const t of transforms) {
    for (const inb of t.inputs) {
      const srcTf = transforms.find(tf => outputsOf(tf).some(o => o.definitionId === inb.definitionId));
      if (srcTf && tfById.has(srcTf.id)) {
        const deps = adjacency.get(srcTf.id)!;
        deps.push(t.id);
        incoming.set(t.id, (incoming.get(t.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, count] of incoming) {
    if (count === 0) queue.push(id);
  }

  const result: TransformDef[] = [];
  while (queue.length > 0) {
    const tid = queue.shift()!;
    const tf = tfById.get(tid);
    if (tf) result.push(tf);
    for (const nextId of adjacency.get(tid) ?? []) {
      const newCount = (incoming.get(nextId) ?? 1) - 1;
      incoming.set(nextId, newCount);
      if (newCount === 0) queue.push(nextId);
    }
  }

  return result;
}
