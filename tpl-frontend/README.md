# TPL Frontend (document app)

Svelte 5 UI for the TPL document app: plan editor + interactive logging UI. The plan and execution state are JSON documents persisted through `tpl-backend`.

## Stack

- TypeScript / Svelte 5 (runes) / Vite / sv-router / Bootstrap 5 (Sveltestrap)
- Managed with **pnpm**

## Run

```bash
pnpm dev        # http://localhost:5173, proxies /api -> localhost:8000
pnpm check      # svelte-check + tsc
```

## Structure

```
tpl-frontend/src/
├── router.ts                 # /documents, /documents/:id/plan, /documents/:id/logging
├── components/Layout.svelte  # navbar
├── pages/
│   ├── Home.svelte
│   ├── documents/            # DocumentList / DocumentForm (lightweight project entity)
│   ├── plan/                 # PlanEditor / PlanCanvas / PlanStepEditor
│   └── logging/              # LoggingMain / LogStepTree
├── stores/
│   ├── documents.ts          # document list CRUD
│   ├── plan.ts               # PlanDocument store (tree manipulation)
│   └── execution.ts          # ExecutionDoc store
├── lib/
│   ├── api/                  # documentsApi / planApi / executionApi
│   ├── plan-utils.ts         # tree utils, transform graph evaluation
│   ├── clock.svelte.ts       # reactive elapsed-seconds clock (Svelte $state)
│   ├── fieldtypes.ts         # definition kinds (number/text/select/bool/struct)
│   ├── values.ts             # binding value classes (values/display/describe/scalar)
│   ├── structs.ts            # struct classes (e.g. GearboxStruct)
│   └── transforms.ts         # typed transform classes (formula/linear/lookup/gearbox.output_speed)
└── types/
    ├── document.ts
    ├── plan.ts
    └── execution.ts
```

## Routes

| Route | Page |
|-------|------|
| `/` | Home |
| `/documents` | DocumentList |
| `/documents/new` | DocumentForm |
| `/documents/:id` | DocumentForm (edit) |
| `/documents/:id/plan` | PlanEditor |
| `/documents/:id/logging` | LoggingMain |

## Offline

Plan and execution documents can be exported/imported as JSON directly from the plan editor. There is no IndexedDB layer.
