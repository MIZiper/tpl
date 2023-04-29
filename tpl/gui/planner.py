from PyQt5 import QtWidgets, QtCore
from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import QTreeWidget, QTreeWidgetItem, QPushButton

import logging

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

class PlannerTreeWidget(QTreeWidget):
    ...

class TaskItemWidget(QTreeWidgetItem):
    ...

class GroupItemWidget(QTreeWidgetItem):
    ...

class DefinitionItemWidget(QTreeWidgetItem):
    ...

if __name__=="__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)
    win = MainWindow()
    win.show()
    app.exit(app.exec())