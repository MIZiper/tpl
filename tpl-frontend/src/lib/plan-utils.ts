import type { PlanNode, PlanDocument, PlanDefinitions, PlanFieldDef, FieldBinding, TransformDef } from "../types/plan";
import type { ExecutionReading } from "../types/execution";
import { evaluateTransform } from "./transform-registry";

let _counter = 0;
const prefix = Math.random().toString(36).slice(2, 8);

export function generateId(): string {
  _counter++;
  return `${prefix}-${_counter}-${Date.now().toString(36)}`;
}

export function createDefaultDocument(): PlanDocument {
  return {
    version: 2,
    definitions: {
      input_conditions: [],
      collection_items: [],
      completion_criteria: [],
      custom: [],
    },
    root: [],
    templates: [],
    transforms: [],
    dynamic_types: [],
    transform_methods: [],
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
    system_config: null,
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
    system_config: null,
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

export function computeDerivedValues(
  transforms: TransformDef[],
  sourceReadings: ExecutionReading[],
  definitions: PlanDefinitions
): ExecutionReading[] {
  if (!transforms.length) return [];

  const allDefs: PlanFieldDef[] = [
    ...definitions.input_conditions,
    ...definitions.collection_items,
    ...definitions.completion_criteria,
    ...definitions.custom,
  ];

  const defById = new Map<string, PlanFieldDef>();
  for (const d of allDefs) defById.set(d.id, d);

  const readingByDefId: Record<string, unknown> = {};
  for (const r of sourceReadings) readingByDefId[r.definition_id] = r.value;

  const results: ExecutionReading[] = [];
  for (const t of transforms) {
    const sourceValues: Record<string, unknown> = {};
    for (const sid of t.source_definition_ids) {
      sourceValues[sid] = readingByDefId[sid] ?? null;
    }

    const computed = evaluateTransform(t.method_id, sourceValues, t.params);
    const defName = t.derived_name || defById.get(t.derived_definition_id)?.name || t.name;
    results.push({
      definition_id: t.id,
      definition_name: defName,
      value: computed,
    });
  }

  return results;
}
