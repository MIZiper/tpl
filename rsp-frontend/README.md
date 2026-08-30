# RSP Frontend (risk management)

Svelte 5 UI for the RSP backend: risk (FMEA) management, solutions, and projects with coverage, RPN, applied solutions, effectiveness, and lessons learned.

## Stack

- TypeScript / Svelte 5 (runes) / Vite / sv-router / Bootstrap 5 (Sveltestrap)
- Managed with **pnpm**

## Run

```bash
pnpm dev        # http://localhost:5174, proxies /api -> localhost:8001
pnpm check      # svelte-check + tsc
```

## Structure

```
rsp-frontend/src/
├── router.ts
├── components/Layout.svelte
├── pages/
│   ├── Home.svelte
│   ├── risks/       # RiskList / RiskForm (category, causes, tags, FMEA defaults)
│   ├── solutions/   # SolutionList / SolutionForm (steps, risk links, impact)
│   └── projects/    # ProjectList / ProjectForm / ProjectDetail (RPN, coverage, FMEA)
├── stores/          # risks / solutions / projects (online only)
├── lib/api/         # risksApi / solutionsApi / projectsApi / fmeaApi
└── types/index.ts
```

## Routes

| Route | Page |
|-------|------|
| `/` | Home |
| `/blocks/risks` / `/blocks/risks/new` / `/blocks/risks/:id` | RiskList / RiskForm |
| `/blocks/solutions` / `/blocks/solutions/new` / `/blocks/solutions/:id` | SolutionList / SolutionForm |
| `/projects` / `/projects/new` / `/projects/:id` / `/projects/:id/edit` | ProjectList / ProjectForm / ProjectDetail |

## Notes

Pure online (no IndexedDB / offline sync). ProjectDetail supports: editable RPN per risk, applying solutions, recording effectiveness, and lessons learned.
