import type { DynamicTypeDef, TransformParamDef, PlanDocument } from "../types/plan";

export type DynamicFormatter = (params: Record<string, unknown>) => string;

interface DynamicEntry {
  type: DynamicTypeDef;
  formatter: DynamicFormatter;
}

const registry = new Map<string, DynamicEntry>();

export function registerDynamicType(
  type: DynamicTypeDef,
  formatter: DynamicFormatter
) {
  registry.set(type.id, { type, formatter });
}

export function getDynamicTypes(): DynamicTypeDef[] {
  return Array.from(registry.values()).map((e) => e.type);
}

export function getDynamicType(id: string): DynamicTypeDef | undefined {
  return registry.get(id)?.type;
}

export function formatDynamic(
  typeId: string,
  params: Record<string, unknown>
): string {
  const entry = registry.get(typeId);
  if (!entry) return typeId;
  return entry.formatter(params);
}

export function loadDynamicTypesFromDoc(doc: PlanDocument) {
  for (const dt of doc.dynamic_types || []) {
    if (!registry.has(dt.id)) {
      const existingFormatter = registry.get(dt.id)?.formatter ?? (() => dt.name);
      registry.set(dt.id, { type: dt, formatter: existingFormatter });
    }
  }
}

registerDynamicType(
  {
    id: "constant",
    name: "Constant",
    description: "A fixed value that does not change",
    params_schema: [],
  },
  () => "Constant"
);

registerDynamicType(
  {
    id: "sinusoidal",
    name: "Sinusoidal",
    description: "A sinusoidal waveform: offset + amplitude * sin(2π * frequency * t)",
    params_schema: [
      { key: "amplitude", label: "Amplitude", type: "number", default: 0 },
      { key: "frequency", label: "Frequency (Hz)", type: "number", default: 60 },
      { key: "offset", label: "Offset (DC)", type: "number", default: 0 },
    ],
  },
  (params) => {
    const amp = Number(params.amplitude ?? 0);
    const freq = Number(params.frequency ?? 0);
    const offset = Number(params.offset ?? 0);
    if (amp === 0) return `${offset} DC`;
    const parts: string[] = [];
    if (offset !== 0) parts.push(`${offset}`);
    parts.push(`±${amp}`);
    if (freq > 0) parts.push(`${freq}Hz`);
    return parts.join(" ");
  }
);

registerDynamicType(
  {
    id: "ramp",
    name: "Ramp",
    description: "A linear ramp from start to end over duration",
    params_schema: [
      { key: "start_value", label: "Start Value", type: "number", default: 0 },
      { key: "end_value", label: "End Value", type: "number", default: 100 },
      { key: "duration_seconds", label: "Duration (s)", type: "number", default: 10 },
    ],
  },
  (params) => {
    const start = Number(params.start_value ?? 0);
    const end = Number(params.end_value ?? 0);
    const dur = Number(params.duration_seconds ?? 0);
    return `${start} → ${end}${dur > 0 ? ` over ${dur}s` : ""}`;
  }
);
