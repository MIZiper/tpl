type InputType = "Static" | "Dynamic"

class TestInput {
    type: InputType;
    parameter: any;
    value: any;
    apply_to: any;
}

class Gearbox {
    name: string;
}

class DriveTrain { // gearboxes in the chain, including intermediate gearbox

}

class Parameter { // torque / speed / oilcleanliness

}

// reflector: calculate parameter based on another para and components