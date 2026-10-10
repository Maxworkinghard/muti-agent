# 当前架构

依据当前代码核对于 2026-10-10。维护入口是 [AGENTS.md](AGENTS.md)，工程边界是 [STANDARDS.md](STANDARDS.md)。此文描述实际运行关系；历史交接与审计分别见 [前端文档索引](frontend/docs/README.md)和 [维护审计](docs/MAINTENANCE_AUDIT.md)。

## 产品与入口

```text
frontend/index.html → src/main.tsx → App.tsx
  SetupScene → SetupCast → DiscussionView
    engines/registry.ts → 四种模式的 DiscussionEngine
    2D 背景 + PixelAvatar / OfficeBubbles

开发/预览：vite.config.ts → server/vitePlugin.ts → server/api.ts
发布：serve.mjs → frontend/dist + server-dist/api.mjs
```

`App.tsx` 管设置步骤、临时导入人物及自定义场景；`DiscussionView.tsx` 管会话 UI、事件与场景桥接。正式产品入口只有 `index.html`。`expression-demo.html` 是 public 下的静态 2D 样本。

## 引擎、模型与会话

| 模式 | 页面选择的实现 | 运行位置 / 请求 |
|---|---|---|
| entertainment | `engines/entertainment/index.ts` → kit → `live/engine.ts` | 浏览器导演与演员 → `llm/client.ts` → `/api/llm/chat` |
| emotion | `engines/emotion/index.ts` → kit → `live/engine.ts` | 浏览器导演与演员，三阶段与等待用户 → 同一模型代理 |
| rational | `engines/rational/index.ts` → `engine.ts`、`schedule.ts` | 浏览器独立导演/辩手/赛后整理 → 同一模型代理；不评分或判胜负 |
| product | `engines/product/index.ts` → `engines/backend.ts` | `/api/sessions` + SSE → `server/session.ts` → `server/work.ts` |

`src/types.ts` 定义 `DiscussionEngine`、`SessionConfig`、`EngineEvent`、人物与场景契约。`live/` 共享调度、状态和提示词框架，各模式 kit 提供独立规则；辩论不并入 live，工作不在浏览器执行任务。2D 场景消费讨论事件，人物动画与气泡由讨论页面管理。

`server/config.ts` 解释服务器传入的 `LLM_*`（兼容 `ROUNDTABLE_*`）；`llm-proxy.ts` 为浏览器请求补凭据，`llmAgent.ts` 供 Node 会话调用。开发/预览由 Vite 插件加载配置，发布由 `serve.mjs` 加载 `.env`、`.env.production` 及进程环境；私人值不进入前端。

Node API：`GET /api/health`、`POST /api/llm/chat`、`POST /api/sessions`、`GET /api/sessions/:id/events` 和 `messages/pause/resume/stop`。SSE 用事件序号和 `Last-Event-ID` 补发。会话和事件保存在进程内存，前端引擎状态保存在本页；没有持久会话数据库。连接断开一分钟后停止孤立会话，结束后保留一小时供追问。停止中断请求并释放流程等待。

**兼容边界**：当前页面只有工作模式调用 Node 会话，但 API 校验仍接受四种模式，`session.ts` 中保留 `runTalk` / `runDebate` 与相应提示词，既有检查也使用它们。它们不是新页面的主实现，也不能仅因此删除。Python `backend/服务.py` / 讨论脚本独立保留；当前网页不请求 Python，发布不启动它。`scripts/legacy.mjs` 是独立历史版本比较入口，会检出旧分支并复制本地配置，本次未执行。

## 人物与 2D 边界

- `data/personas.ts` 用 eager glob 加载 `frontend/personas/**/*.json`，支持简化格式与 `persona-protocol/src/protocol.mjs` 协议格式。
- `data/rationalPersonas.ts` 直接加载 `backend/人物/理性/*.json` 与 `backend/性格库/性格.json`，适配 5 位辩论人物并与前端人物库按 id 合并。前端同 id 文件优先，重复记录在问题列表。
- 内置共 33 个 id：娱乐 8、情感 7、工作 13、辩论 5。用户导入格式、人物设定、性格选择与 `x-*` 扩展受保护。
- 2D 使用 `data/scenes.ts` 的六张背景、座位与工位布局、`PixelAvatar.tsx` / `pixelAvatarDraw.ts`、`OfficeBubbles.tsx`、`discussionHooks.ts` 和 `styles.css`。自定义场景保存 localStorage，导入人物只在当前页面内保存。
- 六个 2D 场景及各模式默认场景保留。业务事件及走路/排队时序由 `data/stageRules.ts` 等共用。

## 实验、构建与维护

| 入口 | 作用 | 可用范围 |
|---|---|---|
| `public/expression-demo.html` | 由 `make-expression-demo.mjs` 生成的静态 2D 样本 | public 静态页，非实时人物编辑入口 |

`frontend/vite.config.ts` 构建 `index.html`；`tsconfig.json` 严格检查全部 `src`。`vite.server.config.ts` 单独打包 `server/api.ts` 为根目录 `server-dist/api.mjs`，不能只靠前端 build 发布。根目录 `npm run build` 覆盖两者；`npm test` 聚合全部离线检查，覆盖六个 2D 场景及四种业务契约。

## 文档布局

根目录 README 面向使用者，AGENTS / STANDARDS / VERIFY 管维护规则，本文件管实际调用关系。根目录 [docs/README.md](docs/README.md) 是项目文档导航；[frontend/docs/README.md](frontend/docs/README.md) 是当前前端说明入口，历史造型说明已随三维场景一起移除。

四模式的早期交接留在 [frontend/docs/archive/](frontend/docs/archive/README.md)。三维场景资料已删除。归档不改变运行路径，也不代表美术获批或方案废弃；素材用途和精简依据在归档索引及审计记录中维护，当前文档不再与旧执行手册混放。
