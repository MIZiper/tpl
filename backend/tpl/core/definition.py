from uuid import uuid4

class DefinitionGroup:
    def __init__(self, name: str) -> None:
        self.items: list[DefinitionItem] = []
        self.name = name

    @classmethod
    def parse_config(cls, config: dict):
        group = DefinitionGroup(config.get("name"))
        group.items = [DefinitionItem.parse_config(def_config) for def_config in config.get("items", [])]

        return group

class DefinitionItem:
    def __init__(self, name: str, value: str="", uuid: str = None):
        self.name = name
        self._value = value # the basic value is descriptive string, check before 
        self.uuid = uuid or str(uuid4())

    @property
    def value(self):
        return self._value
    
    def get_config(self):
        return {
            "name": self.name,
            "value": self._value,
            "uuid": self.uuid
        }

    @classmethod
    def parse_config(self, config: dict):
        return DefinitionItem(
            name=config.get("name", "Unamed_Definition"),
            value=config.get("value"),
            uuid=config.get("uuid"),
        )

class EvalDefinitionItem(DefinitionItem): # the input is a result of other definition
    ...