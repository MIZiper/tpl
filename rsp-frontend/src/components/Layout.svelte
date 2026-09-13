<script lang="ts">
  import type { Snippet } from "svelte";
  import { p, isActive } from "../router";

  let { children }: { children: Snippet } = $props();
</script>

<div class="app-layout">
  <nav class="navbar navbar-expand navbar-dark bg-dark mb-3">
    <div class="container-fluid">
      <span class="navbar-brand">RSP</span>
      <ul class="navbar-nav">
        <li class="nav-item">
          <a class="nav-link" class:active={isActive.startsWith("/blocks")} href={p("/blocks/risks")}>
            Building Blocks
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" class:active={isActive.startsWith("/projects")} href={p("/projects")}>
            Projects
          </a>
        </li>
      </ul>
    </div>
  </nav>

  <main class="container-fluid">
    {@render children()}
  </main>
</div>

<style>
  .app-layout {
    min-height: 100vh;
  }
</style>
