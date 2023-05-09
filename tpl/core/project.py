from tpl.core.task import Node
from tpl.core.definition import DefinitionGroup, DefinitionItem

class PlannerProject:
    def __init__(self) -> None:
        self.tasks: list[Node] = []
        self.definitions: list[DefinitionGroup] = []

    @classmethod
    def parse_config(cls, config: dict) -> "PlannerProject":
        project = PlannerProject()
        project.tasks = Node.parse_config(config.get("tasks", []))

        project.definitions = [DefinitionGroup.parse_config(group_config) for group_config in config.get("definitions", [])]

        return project

class LoggerProject:
    ...