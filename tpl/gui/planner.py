from PyQt5 import QtWidgets, QtCore
from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import QTreeWidget, QTreeWidgetItem, QPushButton

import logging

from tpl.core.task import Task, Group
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
        self.edit_frame = edit_frame = QtWidgets.QToolBox(self)

        splitter = QtWidgets.QSplitter(Qt.Orientation.Horizontal, self)
        splitter.addWidget(planner_tree)
        splitter.addWidget(edit_frame)

        self.setCentralWidget(splitter)

    def _create_menu(self):
        menubar = self.menuBar()

        app_menu = menubar.addMenu("App")

    def _create_status(self):
        statusbar = self.statusBar()

    def apply_config(self, config: dict):
        ...

NAME, REMARK = range(2)

class PlannerTreeWidget(QTreeWidget):
    def __init__(self, parent_win: MainWindow):
        self.parent_win = parent_win
        self.planner: PlannerProject = None
        self.setHeaderLabels(["Name", "Remark"])

    def refresh(self):
        self.clear()
        planner = self.planner
        if planner is None:
            return
        
        task_root = QTreeWidgetItem(self, "Tasks")
        for node in planner.tasks:
            if isinstance(node, Task):
                TaskItemWidget(task_root, node)
            elif isinstance(node, Group):
                GroupItemWidget(task_root, node)

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

class DefinitionItemWidget(QTreeWidgetItem):
    ...

if __name__=="__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)
    win = MainWindow()
    win.show()
    app.exit(app.exec())