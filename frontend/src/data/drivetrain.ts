type InputType = "Static" | "Dynamic"

class TestInput {
    type: InputType;
    parameter: any;
    value: any;
    apply_to: any;
}

class Gearbox {
    name: string;

    _ipt_speed_abs;
    _ipt_speed_percent;
    _ipt_speed_nominal;

    export2inputs() { // export objects for inputs, e.g. torque/speed, torque%/speed, speed%/torque
        // e.g.: [ ("mode", "GM"), ("speed_hss", 200), ("torque_hss%", 10), ... ]

    }
    export2monitors() { // export objects for monitoring

    }
}

class DriveTrain { // gearboxes in the chain, including intermediate gearbox

}

class Parameter { // torque / speed / oilcleanliness

}

// reflector: calculate parameter based on another para and components