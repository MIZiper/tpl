# TPL Frontend

测试计划与执行记录工具 - 前端应用

## 技术栈

- TypeScript
- Svelte 5 (runes: `$state`, `$derived`, `$effect`)
- Vite 7
- sv-router (客户端路由)
- Sveltestrap (Bootstrap 5 组件库)
- Svelte stores (全局状态管理)

---

## 项目结构

```
tpl-frontend/
├── index.html
├── package.json
├── vite.config.ts
├── svelte.config.js
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
└── src/
    ├── main.ts                    # 入口：挂载 App
    ├── app.css                    # 全局样式
    ├── App.svelte                 # 根组件 (Layout + Router)
    ├── components/
    │   └── Layout.svelte          # 布局：Navbar + 内容区
    ├── pages/
    │   ├── Home.svelte            # 首页/Dashboard
    │   ├── blocks/
    │   │   ├── RiskList.svelte    # 风险列表
    │   │   ├── RiskForm.svelte    # 创建/编辑风险
    │   │   ├── SolutionList.svelte# 方案列表
    │   │   └── SolutionForm.svelte# 创建/编辑方案(含步骤管理)
    │   ├── projects/
    │   │   ├── ProjectList.svelte # 项目列表
    │   │   ├── ProjectForm.svelte # 创建/编辑项目
    │   │   └── ProjectDetail.svelte # 项目详情(风险+方案+覆盖率)
    │   ├── plan/
    │   │   └── PlanEditor.svelte  # 计划编辑器(分组+步骤树)
    │   └── logging/
    │       ├── LoggingMain.svelte # 执行主界面(当前步骤+控制栏)
    │       ├── LoggingHistory.svelte # 步骤执行历史
    │       ├── IncidentForm.svelte# 事故记录表单
    │       └── LoggingStats.svelte# 统计视图
    ├── stores/
    │   ├── offline.ts             # 在线/离线状态 + 同步队列
    │   ├── risks.ts               # 风险缓存
    │   ├── solutions.ts           # 方案缓存
    │   ├── projects.ts            # 项目缓存
    │   ├── plan.ts                # 当前计划数据
    │   └── logging.ts             # 执行记录状态
    ├── lib/
    │   ├── api/
    │   │   ├── client.ts          # fetch 封装 (base URL, error handling, offline fallback)
    │   │   ├── risks.ts           # 风险 API
    │   │   ├── solutions.ts       # 方案 API
    │   │   ├── projects.ts        # 项目 API
    │   │   ├── plan.ts            # 计划 API
    │   │   ├── logging.ts         # 执行记录 API
    │   │   └── sync.ts            # 同步 API
    │   ├── db/
    │   │   ├── index.ts           # IndexedDB 初始化
    │   │   ├── riskRepo.ts        # 风险本地 CRUD
    │   │   ├── solutionRepo.ts    # 方案本地 CRUD
    │   │   ├── projectRepo.ts     # 项目本地 CRUD
    │   │   ├── planRepo.ts        # 计划本地 CRUD
    │   │   ├── executionRepo.ts   # 执行记录本地 CRUD
    │   │   └── sync.ts            # 同步逻辑 (last-write-wins)
    │   └── utils/
    │       ├── uuid.ts            # UUIDv7 生成
    │       └── export.ts          # JSON 导出/导入
    └── types/
        └── index.ts               # 共享 TypeScript 类型定义
```

---

## 路由设计

| 路由 | 页面组件 | 说明 |
|------|---------|------|
| `/` | `Home.svelte` | Dashboard，显示最近项目与统计 |
| `/blocks/risks` | `RiskList.svelte` | 风险块列表 |
| `/blocks/risks/new` | `RiskForm.svelte` | 新建风险 |
| `/blocks/risks/:id` | `RiskForm.svelte` | 编辑风险 |
| `/blocks/solutions` | `SolutionList.svelte` | 方案列表 |
| `/blocks/solutions/new` | `SolutionForm.svelte` | 新建方案 |
| `/blocks/solutions/:id` | `SolutionForm.svelte` | 编辑方案 (含步骤管理) |
| `/projects` | `ProjectList.svelte` | 项目列表 |
| `/projects/new` | `ProjectForm.svelte` | 新建项目 |
| `/projects/:id` | `ProjectDetail.svelte` | 项目详情 (风险+方案+覆盖率) |
| `/projects/:id/plan` | `PlanEditor.svelte` | 计划编辑器 |
| `/projects/:id/logging` | `LoggingMain.svelte` | 执行记录主界面 |
| `/projects/:id/logging/step/:stepId` | `LoggingHistory.svelte` | 某个步骤的所有执行历史 |

---

## 组件树

```
App.svelte
└── Layout.svelte
    ├── Navbar (导航栏)
    │   ├── Dashboard (/)
    │   ├── Building Blocks
    │   │   ├── Risks (/blocks/risks)
    │   │   └── Solutions (/blocks/solutions)
    │   └── Projects (/projects)
    └── <Router> (内容区)
        ├── Home.svelte
        │   └── 项目卡片列表 + 快速操作入口
        │
        ├── RiskList.svelte
        │   ├── 搜索栏 + 新建按钮
        │   └── 风险表格/卡片列表 (点击进入编辑)
        │
        ├── RiskForm.svelte
        │   └── 表单: title, description, scope
        │
        ├── SolutionList.svelte
        │   ├── 搜索栏 + 新建按钮
        │   └── 方案表格/卡片列表
        │
        ├── SolutionForm.svelte
        │   ├── 基本信息: title, description, test_method
        │   ├── 设备管理: equipment (标签编辑器)
        │   ├── 关联风险: 风险选择器 + 已关联列表
        │   └── 步骤管理: 可排序步骤列表 + 添加/编辑/删除
        │       └── StepForm (行内编辑: title, input_params, criteria, etc.)
        │
        ├── ProjectList.svelte
        │   └── 项目卡片列表 + 新建按钮
        │
        ├── ProjectForm.svelte
        │   └── 表单: name, description
        │
        ├── ProjectDetail.svelte
        │   ├── 基本信息区
        │   ├── 风险区
        │   │   ├── 添加风险 (选择器 + 确认)
        │   │   ├── 推荐方案弹窗 (添加风险后自动显示)
        │   │   └── 风险列表 (名称, 覆盖状态, 覆盖方案)
        │   ├── 方案区
        │   │   └── 方案列表
        │   └── 覆盖率进度条
        │
        ├── PlanEditor.svelte
        │   ├── 工具栏: 初始化按钮, 添加分组, 添加步骤
        │   ├── 分组树 (可拖拽排序)
        │   │   ├── GroupNode (可折叠嵌套分组)
        │   │   └── StepNode (步骤节点)
        │   └── 步骤编辑抽屉/侧栏
        │       └── StepForm (title, params, duration, criteria, required_executions)
        │
        ├── LoggingMain.svelte
        │   ├── 当前步骤信息区
        │   │   ├── 步骤标题 + 描述
        │   │   ├── 输入参数要求
        │   │   ├── 需要采集的数据
        │   │   └── 完成标准清单 (勾选确认)
        │   ├── 控制栏
        │   │   ├── [完成并进入下一步] 按钮
        │   │   ├── [跳过] 按钮
        │   │   ├── [紧急事件] 按钮 (触发 IncidentForm)
        │   │   └── [添加临时记录] 按钮
        │   ├── 步骤进度列表 (已完成/待执行/跳过)
        │   └── 执行时间线 (简易甘特图, 后期实现)
        │
        ├── IncidentForm.svelte (Modal)
        │   ├── 计时显示
        │   ├── 原因输入
        │   ├── 分类选择
        │   ├── [关联到当前步骤] 选项
        │   └── [解决] 按钮
        │
        ├── LoggingHistory.svelte
        │   └── 该步骤所有执行记录列表
        │       ├── 执行 #1/#2... (时间范围, 结果, 备注)
        │       └── 关联的事故记录
        │
        └── LoggingStats.svelte
            ├── 饼图: 各步骤耗时占比
            └── 表格: 步骤-次数-总耗时-平均耗时
```

---

## 全局 Stores

### `stores/offline.ts`

```ts
// 在线/离线状态管理
isOnline: boolean          // 当前是否在线
pendingQueue: SyncItem[]   // 待同步的操作队列
lastSyncAt: Date | null    // 上次同步时间
```

### `stores/risks.ts`

```ts
// 风险块缓存
risks: Risk[]              // 全量缓存 (从 IndexedDB 加载)
loading: boolean
error: string | null
```

### `stores/solutions.ts`

```ts
solutions: Solution[]      // 方案缓存
loading: boolean
error: string | null
```

### `stores/projects.ts`

```ts
projects: Project[]        // 项目列表
currentProject: Project | null
loading: boolean
```

### `stores/plan.ts`

```ts
// 当前项目的计划树
groups: PlanGroup[]        // 分组列表 (含嵌套)
steps: PlanStep[]          // 步骤列表
selectedStep: PlanStep | null
isDirty: boolean           // 是否有未保存更改
```

### `stores/logging.ts`

```ts
currentProjectId: string | null
currentExecution: StepExecution | null  // 当前执行中的记录
executions: StepExecution[]             // 项目所有执行记录
incidentActive: boolean                 // 是否有活跃事故
stats: ExecutionStats | null
```

---

## 离线策略

### 数据分层

| 存储 | 内容 |
|------|------|
| IndexedDB | 所有业务数据 (risks, solutions, projects, plans, executions) |
| LocalStorage | 用户偏好、最后同步时间戳 |

### 工作模式

1. **在线模式**：API 请求直达后端，成功后更新 IndexedDB 缓存
2. **离线模式**：所有 CRUD 操作写入 IndexedDB，同时记录操作到 `pendingQueue`
3. **恢复在线**：触发同步，按 `updated_at` last-write-wins 规则上传

### 同步流程

```
检测到在线
  → 读取 pendingQueue
  → 逐条 POST /api/sync (含 updated_at)
  → 服务端比较时间戳 → 返回最新版本
  → 前端更新 IndexedDB
  → 清空 pendingQueue
```

### JSON 导出/导入

- 导出：从 IndexedDB 读取指定项目(含计划+记录) → 生成 JSON → 触发下载
- 导入：用户选择 JSON 文件 → 解析 → 写入 IndexedDB → 标记待同步

---

## API 层设计

`lib/api/client.ts` 封装统一的 fetch 逻辑：

```ts
// 自动处理:
// - base URL 前缀 (可配置, 默认 localhost:8000)
// - JSON 序列化/反序列化
// - 错误处理 (HTTP 4xx/5xx → throw typed error)
// - 离线 fallback (写入 IndexedDB + pendingQueue)
// - 超时控制
```

各个 API 模块 (`risks.ts`, `solutions.ts` 等) 导出具体业务函数，供 stores 调用。

---

## TypeScript 类型定义 (`types/index.ts`)

```ts
// 核心实体类型，与后端 Pydantic Schema 对应
interface Risk { id, title, description, scope, created_at, updated_at }
interface Solution { id, title, description, test_method, equipment: string[], ... }
interface SolutionStep { id, solution_id, order_index, title, ... }
interface Project { id, name, description, risks: ProjectRisk[], solutions: ProjectSolution[], ... }
interface ProjectRisk { id, project_id, risk_id, risk: Risk, covered_by_previous, covering_solution_id, ... }
interface PlanGroup { id, project_id, parent_group_id, title, order_index, children: PlanGroup[], steps: PlanStep[] }
interface PlanStep { id, group_id, order_index, title, input_params, completion_criteria, required_executions, ... }
interface StepExecution { id, plan_step_id, type, execution_number, status, started_at, completed_at, ... }
```

---

## 开发阶段

| 阶段 | 内容 |
|------|------|
| Phase 1 | 前端骨架：路由 + Layout + 在线/离线检测 + IndexedDB 初始化 |
| Phase 2 | Building Blocks：风险列表/表单 + 方案列表/表单/步骤管理 |
| Phase 3 | 项目：项目列表/表单/详情 + 风险方案关联 + 推荐 + 覆盖率 |
| Phase 4 | 计划：PlanEditor 分组树 + 步骤编辑 + 初始化 |
| Phase 5 | 执行记录：LoggingMain + 步骤流转 + 事故 + 临时记录 + 统计 |
| Phase 6 | 离线上线：同步逻辑 + JSON 导出/导入 |
| Phase 7 | 甘特图 + UI 打磨 |
