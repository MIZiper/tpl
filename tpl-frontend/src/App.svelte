<script lang="ts">
  import { onMount } from "svelte";
  import { Router } from "sv-router";
  import { route } from "./router";
  import { initAuth } from "./lib/auth";

  onMount(() => {
    initAuth();
  });
</script>

<Router />
