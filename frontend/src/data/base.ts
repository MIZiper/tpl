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

class Input {
    
}

class Measurement extends DefinitionItem {

}

class Criterion extends DefinitionItem {

}

class Reflector {
    
}