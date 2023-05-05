from tpl.core.task import Node

class PlannerProject:
    def __init__(self) -> None:
        self.tasks: list[Node] = []
        self.definitions: dict = {}

    @classmethod
    def parse_config(self, config: dict) -> "PlannerProject":
        project = PlannerProject()
        project.tasks = Node.parse_config(config.get("tasks", []))
        return project

class LoggerProject:
    ...