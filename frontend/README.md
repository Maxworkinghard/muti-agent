# 前端与 Node 服务维护

当前架构与边界见根目录 [ARCHITECTURE.md](../ARCHITECTURE.md)、[STANDARDS.md](../STANDARDS.md)，交付用 [VERIFY.md](../VERIFY.md)。本页只补充前端的入口与维护命令。

在本目录首次运行 `npm install`，后续 `npm run dev` 使用 `vite.config.ts` 同时提供页面、Node 会话与模型代理。端口以终端输出为准（默认 5173）。凭据配置与发布步骤见根目录 [README](../README.md#快速开始)，不要输出私人配置值。

| 命令（在 frontend 执行） | 作用 |
|---|---|
| `npm run build` | 严格检查 `src`，构建 app 与 stage-lab 到 `dist/` |
| `npm run build:server` | 打包 `server/api.ts` 到根目录 `server-dist/api.mjs` |
| `npm test` | 顺序执行全部 `scripts/check-*.mjs`，不调用真实模型 |
| `npm run preview` | 预览已构建页面，API 插件也会挂载；不是带发布鉴权的 serve.mjs |
| `node scripts/gen-looks-doc.mjs` | 从现有 look/rig/body 生成 [docs/character-looks.md](docs/character-looks.md)，不修改外观 |
| `npm run mc:import` / `npm run mc:style` | 生成游戏资源 / 候选 style 图集，会写 public，日常审计不需执行 |

发布请在根目录运行 `npm run build`，一次覆盖页面与 Node 服务。

## 页面边界

| 地址（附在开发服务地址后） | 用途与参数 | 生产构建 |
|---|---|---|
| `/` | 正式产品：设置、人物图鉴、讨论与 2D/MC 切换 | 包含 |
| `/stage-lab.html?scene=roundtable-mc` | 六场景组件预览，`scene` 使用 `*-mc` id；加 `&v=2` 看圆桌 v2 | 包含 |
| `/mc-lab.html?scene=roundtable&v=2` | 动作、内置人物、材质、物品近景；`scene` 不带 `-mc`，`material=original/hd/style` | 不包含，仅开发 |
| `/avatar-lab.html` | 33 人分组、表情/姿态、椅子/地面实验台；具体选项由页面提供 | 不包含，仅开发 |
| `/expression-demo.html` | public 下的静态 2D 样本，由 `scripts/make-expression-demo.mjs` 生成 | 静态复制 |

主应用没有版本参数；两个 MC 预览页的 `v=2` 只替换圆桌房间，其他五个种类回退旧版。Q 版人物是共享 `mc/player.ts → mc/avatar/` 的运行路径，不受此场景版本开关控制。所有未确认的实验方案保持实验状态。

## 模块与脚本

- `src/components/`：设置与讨论 UI，2D 人物/气泡，MC 组件；`src/data/`：场景、人物适配、模式与共用时序。
- `src/engines/`：模式注册与讨论流程，先读[引擎索引](src/engines/README.md)；`server/`：模型代理、SSE、工作流程。
- `src/mc/`：当前六房间、渲染/物理/舞台导演、共享人物；`src/mc/v2/`：圆桌实验房间。具体调用关系只在根目录架构维护。
- `scripts/check-*.mjs`：业务/MC/2D 回归；`test-all.mjs` 聚合。`sim.mjs` 是真实模型命令行实验，读取本地模型配置，本次未运行。
- `mc-import/mc-hd/mc-font/mc-textures.mjs`：资源生成链；`run-hd-only.mjs` 保留单独生成 HD 的能力；叠加包与许可见 [mc-packs/README](mc-packs/README.md)。
- `mc-shots.mjs` 与 `mc-shots.cams.json`：真实浏览器抓图与比较，输出 `.shots/`（忽略）；生成的截图/浏览器目录不能加入版本控制。
- `docs/`：当前说明见 [docs/README](docs/README.md)，历史交接和视觉资料统一在 [docs/archive/](docs/archive/README.md)，不从旧交接手册推断当前产品状态。
