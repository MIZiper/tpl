<script lang="ts">
  import type { Snippet } from "svelte";
  import { p, isActive } from "../router";
  import { auth, login, logout } from "../lib/auth";

  let { children }: { children: Snippet } = $props();
</script>

<div class="app-layout">
  <nav class="navbar navbar-expand navbar-dark bg-dark mb-3">
    <div class="container-fluid">
      <a class="navbar-brand me-3 p-0" href={p("/")} aria-label="TPL home">
        <img src="/tpl-logo-w.png" alt="TPL logo" height="36px" />
      </a>
      <div class="ms-auto d-flex align-items-center gap-3">
        <ul class="navbar-nav">
          <li class="nav-item">
            <a
              class="nav-link"
              class:active={isActive.startsWith("/documents")}
              href={p("/documents")}
            >
              Documents
            </a>
          </li>
        </ul>
        {#if $auth.enabled}
          <div class="text-white small d-flex align-items-center gap-2">
            {#if $auth.authenticated}
              <span>{$auth.username}</span>
              <button class="btn btn-sm btn-outline-light" onclick={logout}>Logout</button>
            {:else}
              <button class="btn btn-sm btn-outline-light" onclick={login}>Login</button>
            {/if}
          </div>
        {/if}
      </div>
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
