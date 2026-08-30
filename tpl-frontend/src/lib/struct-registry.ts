import type { StructTypeDef } from "../types/plan";

const _structTypes = new Map<string, StructTypeDef>();

export function registerStructType(def: StructTypeDef) {
  _structTypes.set(def.id, def);
}

export function getStructType(id: string): StructTypeDef | undefined {
  return _structTypes.get(id);
}

export function getAllStructTypes(): StructTypeDef[] {
  return Array.from(_structTypes.values());
}

export function loadStructTypesFromDoc(structTypes: StructTypeDef[]) {
  for (const st of structTypes) _structTypes.set(st.id, st);
}

registerStructType({
  id: "gearbox",
  name: "Gearbox",
  description: "Gearbox structure with gear stages and ratios",
  category: "mechanical",
  params_schema: [
    { key: "stages", label: "Number of stages", type: "number", default: 2 },
    { key: "ratio_ls", label: "Low speed stage ratio", type: "number" },
    { key: "ratio_is", label: "Intermediate speed stage ratio", type: "number" },
    { key: "ratio_hs", label: "High speed stage ratio", type: "number" },
    { key: "model", label: "Model / type name", type: "text" },
  ],
});

registerStructType({
  id: "test_rig",
  name: "Test Rig Setup",
  description: "Test rig configuration",
  category: "mechanical",
  params_schema: [
    { key: "motor_type", label: "Motor type", type: "select", options: ["servo", "induction", "DC"] },
    { key: "max_speed_rpm", label: "Max speed (rpm)", type: "number" },
    { key: "max_torque_nm", label: "Max torque (Nm)", type: "number" },
    { key: "cooling_type", label: "Cooling system", type: "select", options: ["oil", "water", "air"] },
  ],
});

registerStructType({
  id: "bearing",
  name: "Bearing",
  description: "Bearing specifications",
  category: "mechanical",
  params_schema: [
    { key: "type", label: "Type", type: "select", options: ["ball", "roller", "plain", "journal"] },
    { key: "inner_diameter_mm", label: "Inner Ø (mm)", type: "number" },
    { key: "outer_diameter_mm", label: "Outer Ø (mm)", type: "number" },
    { key: "clearance_um", label: "Clearance (µm)", type: "number" },
    { key: "model", label: "Model", type: "text" },
  ],
});
