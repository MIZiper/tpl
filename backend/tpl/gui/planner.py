from PyQt5 import QtWidgets, QtCore
from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import QTreeWidget, QTreeWidgetItem, QPushButton, QWidget

import logging, json

from tpl.core.task import Task, Group
from tpl.core.definition import DefinitionItem, DefinitionGroup
from tpl.core.project import PlannerProject

APP_TITLE = "Test Planner & Logger"

class MainWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()

        self.setWindowTitle(APP_TITLE)
        self.resize(1280, 720)
        self._create_ui()
        self._create_menu()
        self._create_status()

    def _create_ui(self):
        self.planner_tree = planner_tree = PlannerTreeWidget(self)
        self.config_stack = config_stack = PlannerStackWidget(self)

        config_stack.setMinimumWidth(480)

        splitter = QtWidgets.QSplitter(Qt.Orientation.Horizontal, self)
        splitter.addWidget(planner_tree)
        splitter.addWidget(config_stack)

        self.setCentralWidget(splitter)

    def _create_menu(self):
        menubar = self.menuBar()

        def action_load_project():
            fpath, fext = QtWidgets.QFileDialog.getOpenFileName(
                parent=self, caption="Open project configuration",
                directory="", filter="TPL config (*.json; *.yaml; *.yml);;All (*.*)",
            )
            if not fpath:
                return
            if fext:
                with open(fpath, "r", encoding="utf8") as fp:
                    config = json.load(fp)
                    self.apply_config(config)

            logging.info(f"Load project from: {fpath}")

        app_menu = menubar.addMenu("App")
        app_menu.addAction("Load project").triggered.connect(action_load_project)

    def _create_status(self):
        statusbar = self.statusBar()

    def _route_signals(self):
        ...

    def apply_config(self, config: dict):
        self.planner_tree.apply_config(config)

NAME, REMARK = range(2)

class PlannerTreeWidget(QTreeWidget):
    def __init__(self, parent_win: MainWindow):
        super().__init__(parent_win)
        self.parent_win = parent_win
        self.planner: PlannerProject = None
        self.setHeaderLabels(["Name", "Remark"])
        self.setColumnWidth(NAME, 320)

        self.customContextMenuRequested.connect(self.action_context_menu)

    def refresh(self):
        self.clear()
        planner = self.planner
        if planner is None:
            return
        
        task_root = QTreeWidgetItem(self)
        task_root.setText(NAME, "Tasks")
        for node in planner.tasks:
            if isinstance(node, Task):
                TaskItemWidget(task_root, node)
            elif isinstance(node, Group):
                GroupItemWidget(task_root, node)
        task_root.setExpanded(True)

        definition_root = QTreeWidgetItem(self)
        definition_root.setText(NAME, "Definitions")
        for group in planner.definitions:
            group_item = DefinitionGroupItemWidget(definition_root, group)
            for definition in group.items:
                DefinitionItemWidget(group_item, definition)
            group_item.setExpanded(True)
        definition_root.setExpanded(True)

    def action_context_menu(self, pos: QtCore.QPoint):
        ...

    def apply_config(self, config: dict):
        self.planner = PlannerProject.parse_config(config)
        self.refresh()

class TaskItemWidget(QTreeWidgetItem):
    def __init__(self, parent_item, task: Task):
        super().__init__(parent_item)
        self.task = task
        self.setText(NAME, task.name)

class GroupItemWidget(QTreeWidgetItem):
    def __init__(self, parent_item, group: Group):
        super().__init__(parent_item)
        self.group = group
        self.setText(NAME, group.name)
        
        for node in group.nodes:
            if isinstance(node, Task):
                TaskItemWidget(self, node)
            elif isinstance(node, Group):
                GroupItemWidget(self, node)
        self.setExpanded(True)

class DefinitionItemWidget(QTreeWidgetItem):
    def __init__(self, parent_item, definition: DefinitionItem):
        super().__init__(parent_item)
        self.definition = definition
        self.setText(NAME, definition.name)
        self.setText(REMARK, definition.value)

class DefinitionGroupItemWidget(QTreeWidgetItem):
    def __init__(self, parent_item, group: DefinitionGroup):
        super().__init__(parent_item)
        self.group = group
        self.setText(NAME, group.name)

class PlannerStackWidget(QtWidgets.QStackedWidget):
    def __init__(self, parent_win):
        super().__init__(parent_win)

        self.task_panel = task_panel = TaskPanel(self)
        self.addWidget(task_panel)

    def edit_task(self, task: Task):
        ...

    def edit_definition(self, definition: DefinitionItem):
        ...

class TaskPanel(QWidget):
    def __init__(self, parent):
        super().__init__(parent)

        self.task = None
        self._create_ui()

    def _create_ui(self):
        vlayout = QtWidgets.QVBoxLayout(self)
        vlayout.setContentsMargins(0, 0, 0, 0)

        task_editor = TaskBasicEditor(self)
        vlayout.addWidget(task_editor)

    def set_task(self, task):
        ...

    def sync(self):
        ...

class TaskBasicEditor(QtWidgets.QGroupBox):
    def __init__(self, parent):
        super().__init__(parent)
        self.setTitle("Edit task")
        form_layout = QtWidgets.QFormLayout(self)

        self.task_name_edit = tne = QtWidgets.QLineEdit(self)
        form_layout.addRow("Name", tne)
        self.task_comment_area = tca = QtWidgets.QTextEdit(self)
        form_layout.addRow("Comment", tca)

if __name__=="__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)
    win = MainWindow()
    win.show()
    app.exit(app.exec())