class DefinitionGroup {
    constructor(name: string) {
        
    }
}

class DefinitionItem {
    name: string;
    description: string;
    _value: any;
    trigger_time: Date; // the time when triggered. For measurement, it's done time; for criteria, it's met time.

    constructor(name: string, value: string="", uuid: string="") {
        
    }
}

class BaseDefinition {
    static subclasses: typeof BaseDefinition[] = [];
    static CAPTION = "Generic"

    constructor() {
        if (!BaseDefinition.subclasses.includes(this.constructor as typeof BaseDefinition)) {
            BaseDefinition.subclasses.push(this.constructor as typeof BaseDefinition);
        }
    }
}

class StaticDefinition extends BaseDefinition { // Gearbox, reflector, ...

}

class InteractiveDefinition extends BaseDefinition { // Input, Measurement, Criterion

}

class InputDefinition extends BaseDefinition {
    static CAPTION = "Inputs"
    
}

class BasicInput {}
class AbsoluteInput {}
class RelativeInput {}

class MeasurementDefinition extends BaseDefinition {
    static CAPTION = "Measurements"

}

class BasicMeasurement {}
class GeneralMeasurement {}

class CriterionDefinition extends BaseDefinition {
    static CAPTION: string = "Criteria"
}

class BasicCriterion {}

class ReflectorDefinition extends BaseDefinition {
    
}

// In drivetrain plugin
class GearboxDefinition extends BaseDefinition {

}