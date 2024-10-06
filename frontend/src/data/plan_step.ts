import { ItemBase } from "./plan_definition";

class StepItem {
    name: string;

    inputs: ItemBase[];
    measurements: ItemBase[];
    criteria: ItemBase[];
}