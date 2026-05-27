import { createRouter } from "sv-router";
import Layout from "./components/Layout.svelte";
import Home from "./pages/Home.svelte";
import RiskList from "./pages/blocks/RiskList.svelte";
import RiskForm from "./pages/blocks/RiskForm.svelte";
import SolutionList from "./pages/blocks/SolutionList.svelte";
import SolutionForm from "./pages/blocks/SolutionForm.svelte";
import ProjectList from "./pages/projects/ProjectList.svelte";
import ProjectForm from "./pages/projects/ProjectForm.svelte";
import ProjectDetail from "./pages/projects/ProjectDetail.svelte";
import PlanEditor from "./pages/plan/PlanEditor.svelte";
import LoggingMain from "./pages/logging/LoggingMain.svelte";
import LoggingHistory from "./pages/logging/LoggingHistory.svelte";
import LoggingStats from "./pages/logging/LoggingStats.svelte";

export const { p, navigate, isActive, route } = createRouter({
  layout: Layout,
  "/": Home,
  "/blocks": {
    "/risks": RiskList,
    "/risks/new": RiskForm,
    "/risks/:id": RiskForm,
    "/solutions": SolutionList,
    "/solutions/new": SolutionForm,
    "/solutions/:id": SolutionForm,
  },
  "/projects": {
    "/": ProjectList,
    "/new": ProjectForm,
    "/:id": {
      "/": ProjectDetail,
      "/plan": PlanEditor,
      "/logging": {
        "/": LoggingMain,
        "/step/:stepId": LoggingHistory,
        "/stats": LoggingStats,
      },
    },
  },
});
