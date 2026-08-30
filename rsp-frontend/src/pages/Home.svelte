<script lang="ts">
  import { p } from "../router";
</script>

<div>
  <h1 class="mb-4">RSP - Risk & Solution Project Management</h1>
  <p class="text-muted">Manage risks (FMEA), solutions, and projects with coverage tracking.</p>

  <div class="row mb-4">
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Building Blocks</h5>
          <p class="card-text">Define risk items (with categories, causes, tags, FMEA defaults) and test solution blocks.</p>
          <a href={p("/blocks/risks")} class="btn btn-primary">Open</a>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">Projects</h5>
          <p class="card-text">Manage projects, their risks (with RPN), solutions, coverage, effectiveness, and lessons learned.</p>
          <a href={p("/projects")} class="btn btn-primary">Open</a>
        </div>
      </div>
    </div>
  </div>
</div>
