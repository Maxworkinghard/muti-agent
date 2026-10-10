# 前端与 Node 服务维护

当前架构与边界见根目录 [ARCHITECTURE.md](../ARCHITECTURE.md)、[STANDARDS.md](../STANDARDS.md)，交付用 [VERIFY.md](../VERIFY.md)。本页只补充前端的入口与维护命令。

在本目录首次运行 `npm install`，后续 `npm run dev` 使用 `vite.config.ts` 同时提供页面、Node 会话与模型代理。端口以终端输出为准（默认 5173）。凭据配置与发布步骤见根目录 [README](../README.md#快速开始)，不要输出私人配置值。

| 命令（在 frontend 执行） | 作用 |
|---|---|
| `npm run build` | 严格检查 `src`，构建页面到 `dist/` |
| `npm run build:server` | 打包 `server/api.ts` 到根目录 `server-dist/api.mjs` |
| `npm test` | 顺序执行全部 `scripts/check-*.mjs`，不调用真实模型 |
| `npm run preview` | 预览已构建页面，API 插件也会挂载；不是带发布鉴权的 serve.mjs |

发布请在根目录运行 `npm run build`，一次覆盖页面与 Node 服务。

## 页面边界

| 地址（附在开发服务地址后） | 用途与参数 | 生产构建 |
|---|---|---|
| `/` | 正式产品：设置、人物图鉴和 2D 讨论 | 包含 |
| `/expression-demo.html` | public 下的静态 2D 样本，由 `scripts/make-expression-demo.mjs` 生成 | 静态复制 |

## 模块与脚本

- `src/components/`：设置与讨论 UI，2D 人物和气泡；`src/data/`：场景、人物适配、模式与共用时序。
- `src/engines/`：模式注册与讨论流程，先读[引擎索引](src/engines/README.md)；`server/`：模型代理、SSE、工作流程。
- `scripts/check-*.mjs`：业务和 2D 回归；`test-all.mjs` 聚合。`sim.mjs` 是真实模型命令行实验，读取本地模型配置，本次未运行。
- `docs/`：当前说明见 [docs/README](docs/README.md)，历史交接和视觉资料统一在 [docs/archive/](docs/archive/README.md)，不从旧交接手册推断当前产品状态。
