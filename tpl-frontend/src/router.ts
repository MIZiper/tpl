import { createRouter } from "sv-router";
import Layout from "./components/Layout.svelte";
import Home from "./pages/Home.svelte";
import DocumentList from "./pages/documents/DocumentList.svelte";
import DocumentForm from "./pages/documents/DocumentForm.svelte";
import PlanEditor from "./pages/plan/PlanEditor.svelte";
import LoggingMain from "./pages/logging/LoggingMain.svelte";

export const { p, navigate, isActive, route } = createRouter({
  layout: Layout,
  "/": Home,
  "/documents": {
    "/": DocumentList,
    "/new": DocumentForm,
    "/:id": {
      "/": DocumentForm,
      "/plan": PlanEditor,
      "/logging": LoggingMain,
    },
  },
});
