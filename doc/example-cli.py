
"""

Test steps
  - Flushing
    - Static flushing
    - Dynamic flushing
  - Run-in
    - Cut-in speed
    - Nominal speed
  - Contact patterns
  ...
  - Non-testing events
    - Emergency stop
    - Hardware / software issue
    - ...

Definitions
  - Inputs
    - Output speed
    - Output torque
    - Manifold temperature
    - Manifold pressure
    - GenericString # Something for input, but flexible
  - Measurements
    - LDM
    - Vibration
    - GenericString # for example, take a photo, leave a comment, ...
  - Criteria
    - Warmup
    - Stable
    - Cleanliness requirement
    - Minimum running time # can also be part of "stable" criteria
  - Gearbox
    - G123_01
    - TRA_Intermediate
  - Parameters
    - XXX efficiency
    - ...
  - Reflector
    - ...
"""

template = Project(name="Scorpion V1", description="Check whether oil flow through bearings.")

gearbox = drivetrain.Gearbox("G123_01", stages=[(), (), (),])

pres_input_type = AbsoluteInput("Inlet pressure")
flow_input_type = AbsoluteInput("Inlet flow")
temp_input_type = AbsoluteInput("Manifold Temperature")

log_step_type = StepGroupType("Logging type step")
warmup_step_type = StepGroupType("Warmup type step", inputs=[], measurements=[], criteria=[])

non_test_group = StepGroup("Non-testing events")
nt_es_step = non_test_group.add_step("Emergency stop")
nt_wi_step = non_test_group.add_step("Hardware / software issue")
nt_np_step = non_test_group.add_step("No test planned / waiting")

setup_step = GeneralStep("Setup", measurements=[GeneralMeasurement("Take a photo"), GeneralMeasurement("Check sensors")])

flushing_step = GeneralStep("Flushing", inputs=[pres_input_type(), temp_input_type(),])

step_template = StepTemplate("Static standard", input_types=[pres_input_type, temp_input_type,], measurement_types=[], criterion_types=[])


# InputDefinition: "Inputs"
# InputType: the input channel
# InputInstance: the concrete value for input