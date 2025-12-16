class Node:
    def __init__(self, name: str) -> None:
        self.name = name
        self.comment = ""
        self.is_hidden: bool = False # The internal steps (won't export to customer graph)

    @classmethod
    def parse_config(self, task_configs: list[dict]) -> list["Node"]:
        rst = []
        for task_config in task_configs:
            if "tasks" in task_config:
                rst.append(Group.parse_config(task_config))
            else:
                rst.append(Task.parse_config(task_config))
        return rst
    
    def get_config(self) -> dict:
        return {
            "name": self.name,
        }
    
    def _repr_(self, i=0):
        return " "*i + repr(self)

class Task(Node):
    # progress / repeat times => for warming up, unlimited times; for regular, 1 cycle; for robustness test, maybe specified times.
    @classmethod
    def parse_config(self, config: dict) -> "Task":
        return Task(name=config.get("name", "Unamed_Task"))
    
    def __repr__(self) -> str:
        return f"- <Task: {self.name}>"
    
class Group(Node):
    def __init__(self, name: str) -> None:
        super().__init__(name)
        self.nodes: list[Node] = []

    @classmethod
    def parse_config(self, config: dict) -> "Group":
        grp = Group(name=config.get("name", "Unamed_Group"))
        grp.nodes = Node.parse_config(config.get("tasks", []))
        return grp
    
    def _repr_(self, i=0):
        return "\n".join([super()._repr_(i), *[node._repr_(i+2) for node in self.nodes]])
    
    def __repr__(self) -> str:
        return f"+ <Group: {self.name}>"