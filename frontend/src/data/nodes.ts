type NodeStatus = "NotStarted" | "Ongoing" | "Completed" | "Aborted";

class StepGroup {
    name: string;
    subnodes: (StepGroup | StepItem)[]; // the group can be nested
    
    public get status() : NodeStatus | undefined {
        // based on status of subnodes, return the status
        // note: subnode "Aborted" is also considered as "Completed"
        return
    }
    
    add_step_like(step: StepItem) {
        
    }
}

class StepItem {
    name: string;

    _estimated_running_time: number;
    _estimated_operation_time: number;
    repeat_times: number; // if a test step needs to be performed several times

    _status: NodeStatus; // + measurement status + criteria status
    _inputs: Input[];
    _measurements: Measurement[]; // the specified measurements, + display global in dashboard
    _criteria: Criterion[]; // the specified criteria, + display global dashboard

    constructor(name: string, measurements: DefinitionItem[], criteria: DefinitionItem[]) {
        
    }
}

class LogGroup {
    items: LogItem[];
    test_step: StepItem;

    // measurement status: if test_step.repeat_times is 1, but got interrupted, measurement can be in one log but not others
}

class LogItem {
    start_time: Date;
    stop_time: Date;
    comment: string;
    
    public get duration() : string {
        return "";
    }

    constructor(start_time: Date, stop_time: Date, comment: string) {
        
    }
}