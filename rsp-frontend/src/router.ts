import { createRouter } from "sv-router";
import Layout from "./components/Layout.svelte";
import Home from "./pages/Home.svelte";
import RiskList from "./pages/risks/RiskList.svelte";
import RiskForm from "./pages/risks/RiskForm.svelte";
import SolutionList from "./pages/solutions/SolutionList.svelte";
import SolutionForm from "./pages/solutions/SolutionForm.svelte";
import ProjectList from "./pages/projects/ProjectList.svelte";
import ProjectForm from "./pages/projects/ProjectForm.svelte";
import ProjectDetail from "./pages/projects/ProjectDetail.svelte";

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
      "/edit": ProjectForm,
    },
  },
});
