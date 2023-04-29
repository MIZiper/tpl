from tpl.core.task import Node

class PlannerProject:
    def __init__(self) -> None:
        self.tasks: list[Node] = []
        self.definitions: dict = {}

class LoggerProject:
    ...