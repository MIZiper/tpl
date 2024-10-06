export class ItemBase {}

export class DefinitionBase {
    _item_creator: typeof ItemBase;

    constructor(item_creator: typeof ItemBase) {
        this._item_creator = item_creator;
    }

    createItem(): ItemBase {
        return new this._item_creator();
    }
}

export class DefinitionCategory {
    static registered_categories: DefinitionCategory[] = [];

    name: string;
    registered_types: typeof DefinitionBase[] = [];
    definitions: DefinitionBase[] = [];

    constructor(name: string) {
        this.name = name;
        DefinitionCategory.registered_categories.push(this);
    }

    registerDefinitionType(definition_type: typeof DefinitionBase) {
        this.registered_types.push(definition_type);
    }

    addDefinition(definition: DefinitionBase) {
        this.definitions.push(definition);
    }
}

export const InputCategory = new DefinitionCategory("Inputs");
export const MeasurementCategory = new DefinitionCategory("Measurements");
export const CriterionCategory = new DefinitionCategory("Criteria")

class GeneralDefinition extends DefinitionBase {}
class AbsoluteInputDefinition extends DefinitionBase {}

InputCategory.registerDefinitionType(GeneralDefinition);
InputCategory.registerDefinitionType(AbsoluteInputDefinition);