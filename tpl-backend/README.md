# TPL Backend

测试计划与执行记录工具 - 后端服务

## 技术栈

- Python 3.12+
- FastAPI (Web 框架)
- asyncpg (异步 PostgreSQL 驱动)
- Pydantic v2 (数据校验)
- Uvicorn (ASGI 服务器)
- 手动 SQL，无 ORM
- UUIDv7 (时间有序主键)

---

## 项目结构

```
tpl-backend/
├── .python-version      # Python 3.12
├── pyproject.toml       # 项目配置与依赖
├── uv.lock              # 依赖锁定
└── tpl/
    ├── __init__.py
    ├── main.py          # FastAPI app 入口
    ├── config.py        # 配置管理 (DB URL 等)
    ├── db.py            # asyncpg 连接池管理
    ├── models.py        # Pydantic 模型 (请求/响应 Schema)
    ├── routers/
    │   ├── __init__.py
    │   ├── risks.py
    │   ├── solutions.py
    │   ├── projects.py
    │   ├── plan.py
    │   ├── logging.py
    │   └── sync.py
    ├── services/
    │   ├── __init__.py
    │   ├── risk_service.py
    │   ├── solution_service.py
    │   ├── project_service.py
    │   ├── plan_service.py
    │   ├── logging_service.py
    │   └── sync_service.py
    └── sql/
        ├── 001_initial.sql    # 初始建表
        └── 002_indexes.sql    # 索引
```

---

## 数据库 Schema

### ER 关系概览

```
risks ──< solution_risks >── solutions ──< solution_steps
  │                               │
  │    (project_risks)            │  (project_solutions)
  │                               │
  ▼                               ▼
project_risks              project_solutions
  │                               │
  │          projects             │
  │             │                 │
  │             ├── plan_groups ──(parent_group_id, 自引用实现嵌套组)
  │             │       │
  │             │       ▼
  │             ├── plan_steps (从 solution_steps 复制, 独立编辑)
  │             │       │
  │             │       ▼
  │             └── step_executions
  │                    type: planned | adhoc | incident
  │                    plan_step_id: 可空 (adhoc 时为空)
```

### 表定义

#### 1. risks — 风险块

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID PK | UUIDv7 |
| title | VARCHAR(255) NOT NULL | 风险标题 |
| description | TEXT | 风险描述 |
| scope | TEXT | 出现范围 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

#### 2. solutions — 测试方案块

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID PK | UUIDv7 |
| title | VARCHAR(255) NOT NULL | 方案标题 |
| description | TEXT | 方案描述 |
| test_method | TEXT | 测试方法说明 |
| equipment | JSONB DEFAULT '[]' | 需要的设备/传感器列表 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

#### 3. solution_risks — 方案-风险关联 (多对多)

| 列 | 类型 | 说明 |
|---|------|------|
| solution_id | UUID FK → solutions ON DELETE CASCADE | |
| risk_id | UUID FK → risks ON DELETE CASCADE | |
| PRIMARY KEY | (solution_id, risk_id) | |

#### 4. solution_steps — 方案推荐步骤

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID PK | UUIDv7 |
| solution_id | UUID FK → solutions ON DELETE CASCADE | |
| order_index | INTEGER NOT NULL | 排序 |
| title | VARCHAR(255) NOT NULL | 步骤标题 |
| description | TEXT | 步骤描述 |
| input_params_template | JSONB DEFAULT '[]' | 输入参数模板 |
| duration_estimate_minutes | INTEGER DEFAULT 60 | 预计时长(分钟) |
| data_to_collect | JSONB DEFAULT '[]' | 需要采集的信息 |
| completion_criteria | TEXT | 完成标准 |
| equipment_needed | JSONB DEFAULT '[]' | 所需设备 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

#### 5. projects — 项目

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID PK | UUIDv7 |
| name | VARCHAR(255) NOT NULL | 项目名称 |
| description | TEXT | 项目描述 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

#### 6. project_risks — 项目关联的风险

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID PK | UUIDv7 |
| project_id | UUID FK → projects ON DELETE CASCADE | |
| risk_id | UUID FK → risks | |
| covered_by_previous | BOOLEAN DEFAULT FALSE | 是否已被历史项目覆盖 |
| covering_solution_id | UUID FK → solutions (可空) | 覆盖该风险的方案 |
| UNIQUE | (project_id, risk_id) | |

#### 7. project_solutions — 项目采用的方案

| 列 | 类型 | 说明 |
|---|------|------|
| project_id | UUID FK → projects ON DELETE CASCADE | |
| solution_id | UUID FK → solutions ON DELETE CASCADE | |
| PRIMARY KEY | (project_id, solution_id) | |

#### 8. plan_groups — 计划分组 (支持嵌套)

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID PK | UUIDv7 |
| project_id | UUID FK → projects ON DELETE CASCADE | |
| parent_group_id | UUID FK → plan_groups ON DELETE CASCADE (可空) | 上级分组 (NULL=顶级) |
| title | VARCHAR(255) NOT NULL | 组标题 |
| order_index | INTEGER NOT NULL DEFAULT 0 | 排序 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

#### 9. plan_steps — 计划步骤

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID PK | UUIDv7 |
| project_id | UUID FK → projects ON DELETE CASCADE | |
| group_id | UUID FK → plan_groups ON DELETE SET NULL (可空) | 所属分组 |
| solution_id | UUID FK → solutions (可空) | 来源方案 (可追溯) |
| solution_step_id | UUID FK → solution_steps (可空) | 来源方案步骤 |
| order_index | INTEGER NOT NULL DEFAULT 0 | 组内排序 |
| title | VARCHAR(255) NOT NULL | 步骤标题 |
| description | TEXT | 步骤描述 |
| input_params | JSONB DEFAULT '[]' | 执行输入参数 (已定制) |
| duration_estimate_minutes | INTEGER DEFAULT 60 | 预计时长(分钟) |
| data_to_collect | JSONB DEFAULT '[]' | 需要采集的信息 |
| completion_criteria | TEXT | 完成标准 |
| required_executions | INTEGER DEFAULT 1 | 要求执行次数 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

#### 10. step_executions — 步骤执行记录

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID PK | UUIDv7 |
| project_id | UUID FK → projects ON DELETE CASCADE | |
| plan_step_id | UUID FK → plan_steps ON DELETE SET NULL (可空) | 关联步骤 (adhoc 时为 NULL) |
| parent_execution_id | UUID FK → step_executions (可空) | 关联的事故父记录 |
| type | VARCHAR(20) NOT NULL DEFAULT 'planned' | 'planned' / 'adhoc' / 'incident' |
| execution_number | INTEGER DEFAULT 1 | 第几次执行 (多执行步骤) |
| status | VARCHAR(20) NOT NULL DEFAULT 'in_progress' | 'in_progress' / 'completed' / 'skipped' / 'aborted' |
| started_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| completed_at | TIMESTAMPTZ (可空) | |
| input_params | JSONB | 实际使用的输入参数 |
| completion_check | VARCHAR(10) (可空) | 'pass' / 'fail' / 'skip' |
| notes | TEXT (可空) | 备注 |
| incident_reason | TEXT (可空) | 事故原因 (type='incident' 时) |
| incident_category | TEXT (可空) | 事故分类 (type='incident' 时) |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

---

## API 设计

### 风险 (Risks)

```
GET    /api/risks              # 列表 (支持 ?search= 搜索)
POST   /api/risks              # 创建
GET    /api/risks/{id}         # 详情
PUT    /api/risks/{id}         # 更新
DELETE /api/risks/{id}         # 删除
```

### 测试方案 (Solutions)

```
GET    /api/solutions              # 列表 (支持 ?search=)
POST   /api/solutions              # 创建
GET    /api/solutions/{id}         # 详情 (含 steps 和关联 risks)
PUT    /api/solutions/{id}         # 更新
DELETE /api/solutions/{id}         # 删除
```

#### 方案步骤 (子资源)

```
GET    /api/solutions/{id}/steps                   # 步骤列表
POST   /api/solutions/{id}/steps                   # 添加步骤
PUT    /api/solutions/{id}/steps/{step_id}          # 更新步骤
DELETE /api/solutions/{id}/steps/{step_id}          # 删除步骤
PUT    /api/solutions/{id}/steps/reorder            # 排序 {step_ids: [...]}
```

#### 方案-风险关联 (子资源)

```
GET    /api/solutions/{id}/risks               # 关联的风险列表
POST   /api/solutions/{id}/risks               # 关联风险 {risk_id}
DELETE /api/solutions/{id}/risks/{risk_id}     # 取消关联
```

### 项目 (Projects)

```
GET    /api/projects              # 列表
POST   /api/projects              # 创建
GET    /api/projects/{id}         # 详情 (含 risks, solutions, coverage)
PUT    /api/projects/{id}         # 更新
DELETE /api/projects/{id}         # 删除
```

#### 项目-风险关联

```
GET    /api/projects/{id}/risks                          # 项目的风险列表
POST   /api/projects/{id}/risks                          # 添加风险 (自动返回推荐方案)
       Body: {risk_id, covered_by_previous?, covering_solution_id?}
DELETE /api/projects/{id}/risks/{risk_id}                # 移除风险
```

#### 项目-方案关联

```
GET    /api/projects/{id}/solutions                       # 项目的方案列表
POST   /api/projects/{id}/solutions                       # 添加方案
DELETE /api/projects/{id}/solutions/{solution_id}         # 移除方案
```

#### 推荐

```
GET    /api/recommendations?risk_ids=id1,id2             # 根据风险ID推荐方案
```

### 计划 (Plan)

```
GET    /api/projects/{project_id}/plan                          # 获取完整计划树
POST   /api/projects/{project_id}/plan/initialize               # 从方案初始化计划
POST   /api/projects/{project_id}/plan/groups                   # 创建分组
PUT    /api/projects/{project_id}/plan/groups/{group_id}        # 更新分组
DELETE /api/projects/{project_id}/plan/groups/{group_id}        # 删除分组
POST   /api/projects/{project_id}/plan/steps                    # 创建步骤
PUT    /api/projects/{project_id}/plan/steps/{step_id}          # 更新步骤
DELETE /api/projects/{project_id}/plan/steps/{step_id}          # 删除步骤
PUT    /api/projects/{project_id}/plan/reorder                  # 排序
       Body: {items: [{id, group_id?, order_index}]}
```

### 执行记录 (Logging)

```
GET    /api/projects/{project_id}/executions                    # 项目所有执行记录
GET    /api/projects/{project_id}/executions/current            # 当前正在执行的步骤信息
POST   /api/projects/{project_id}/executions/start              # 开始执行某步骤
POST   /api/projects/{project_id}/executions/{id}/complete      # 完成步骤 (自动开下一步)
POST   /api/projects/{project_id}/executions/{id}/skip          # 跳过步骤
POST   /api/projects/{project_id}/executions/incident           # 发起事故记录
POST   /api/projects/{project_id}/executions/incident/{id}/resolve  # 解决事故
POST   /api/projects/{project_id}/executions/adhoc              # 创建临时记录
GET    /api/projects/{project_id}/executions/stats              # 统计 (各步骤耗时比例等)
```

### 同步与导出 (Sync & Export)

```
POST   /api/sync                    # 批量上传离线数据 (last-write-wins)
GET    /api/export/projects/{id}    # 导出项目为 JSON
GET    /api/export/risks/{id}       # 导出风险为 JSON
GET    /api/export/solutions/{id}   # 导出方案为 JSON
```

---

## 核心业务逻辑

### 覆盖率计算

1. 项目总风险数 = 项目中关联的风险数
2. 已覆盖风险 = 被标记 `covered_by_previous=true` 或已有 `covering_solution_id` 的风险
3. 覆盖率 = 已覆盖 / 总数
4. 当执行记录中某步骤 `completion_check=pass` 且该步骤关联方案覆盖了某风险 → 该风险自动标记为已覆盖

### 推荐算法

添加风险到项目时，查询 `solution_risks` 找出覆盖该风险的所有方案，返回给前端。前端可查看方案详情决定是否采纳。

### 计划初始化

`POST /plan/initialize` 遍历项目的所有 `project_solutions`，将每个方案的 `solution_steps` 复制为 `plan_steps`，保留 `solution_id` 和 `solution_step_id` 用于追溯，但数据完全独立。

### 步骤执行流程

1. 用户进入 logging 界面 → 查询是否有 `status='in_progress'` 的执行记录
2. 无 → 提示开始第一个步骤 (POST `/executions/start`)
3. 有 → 显示当前步骤信息 (输入参数、完成标准)
4. 用户确认条件满足 → POST `/executions/{id}/complete` → 自动开启下一步
5. 如果是多次执行步骤 (required_executions > 1)，完成后自动创建同步骤的下一次执行
6. 事故：POST `/executions/incident` → 开始计时 → 解决问题 → POST `/incident/{id}/resolve`

### 离线同步 (Last-Write-Wins)

- 每个资源都有 `updated_at` 字段
- 前端离线期间创建/修改的数据暂存 IndexedDB
- 同步时批量提交，后端逐条比较 `updated_at`：
  - 离线数据的 `updated_at` > 服务端的 `updated_at` → 覆盖服务端
  - 否则忽略
- 同步完成后返回确认结果

---

## 开发阶段

| 阶段 | 内容 |
|------|------|
| Phase 1 | DB Schema SQL + FastAPI 骨架 + 连接池 + 配置 |
| Phase 2 | 风险 & 方案 CRUD (含子资源 steps/risks) |
| Phase 3 | 项目 CRUD + 风险/方案关联 + 推荐 + 覆盖率 |
| Phase 4 | 计划 CRUD + 初始化 + 分组/步骤管理 |
| Phase 5 | 执行记录 CRUD + 当前步骤管理 + 事故/临时记录 + 统计 |
| Phase 6 | 同步端点 + 导出 JSON |
| Phase 7 | 性能优化 + 索引 + 错误处理完善 |
