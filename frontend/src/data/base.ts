class DefinitionItem {
    name: string;
    description: string;
    _value: any;
    trigger_time: Date; // the time when triggered. For measurement, it's done time; for criteria, it's met time.

    constructor(name: string, value: string="", uuid: string="") {
        
    }
}



export class BaseDefinition {
    static definitionCategories: typeof BaseDefinition[] = [];
    static CAPTION = "Generic"

    categoryTypes: any[] = [];
    categoryObjects = [];

    static registerDefinition(definitionClass: typeof BaseDefinition) {
        BaseDefinition.definitionCategories.push(definitionClass);
    }
    static getRegisteredDefinitions(): typeof BaseDefinition[] {
        return BaseDefinition.definitionCategories;
    }

    registerType(categoryTypeClass: any) {
        this.categoryTypes.push(categoryTypeClass);
        return this;
    }
}
function RegisterDefinition(definitionCategory: typeof BaseDefinition) {
    BaseDefinition.registerDefinition(definitionCategory);
}

class StaticDefinition extends BaseDefinition { // Gearbox, reflector, ...

}

class InteractiveDefinition extends BaseDefinition { // Input, Measurement, Criterion

}


@RegisterDefinition
export class InputDefinition extends BaseDefinition {
    static CAPTION = "Inputs"
    
    static availableTypes = [];
    static possesObjects = [];
}
class BasicInput {}
class AbsoluteInput {
    name: string;
    value: any;
    description: string; // [unit]; description of the input.
}
class RelativeInput {
    name: string;
    value: any;
    description: string;
}
InputDefinition.registerType(BasicInput).registerType(AbsoluteInput).registerType(RelativeInput);

@RegisterDefinition
export class MeasurementDefinition extends BaseDefinition {
    static CAPTION = "Measurements"

}
class BasicMeasurement {}
class GeneralMeasurement {}

@RegisterDefinition
class CriterionDefinition extends BaseDefinition {
    static CAPTION: string = "Criteria"
}
class BasicCriterion {}

class ReflectorDefinition extends BaseDefinition {
    
}

// In drivetrain plugin
@RegisterDefinition
class GearboxDefinition extends BaseDefinition {
    static CAPTION: string = "Gearbox";
}

export const InputCategory = new BaseDefinition();