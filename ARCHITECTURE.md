# 当前架构

依据当前代码核对于 2026-10-09。维护入口是 [AGENTS.md](AGENTS.md)，工程边界是 [STANDARDS.md](STANDARDS.md)。此文描述实际运行关系；历史轮次与审计分别见 [前端文档索引](frontend/docs/README.md)和 [维护审计](docs/MAINTENANCE_AUDIT.md)。

## 产品与入口

```text
frontend/index.html → src/main.tsx → App.tsx
  SetupScene → SetupCast → DiscussionView
    engines/registry.ts → 四种模式的 DiscussionEngine
    2D 背景 + PixelAvatar / OfficeBubbles
    主动选择 *-mc → lazy McStage3D（可切回同名原图）

开发/预览：vite.config.ts → server/vitePlugin.ts → server/api.ts
发布：serve.mjs → frontend/dist + server-dist/api.mjs
```

`App.tsx` 管设置步骤、临时导入人物及自定义场景；`DiscussionView.tsx` 管会话 UI、事件与场景桥接。正式产品入口只有 `index.html`；`stage-lab.html` 是同一组件的预览入口，生产构建也包含它。`mc-lab.html` 与 `avatar-lab.html` 仅由 Vite 开发服务器提供，没有加入生产多入口。

## 引擎、模型与会话

| 模式 | 页面选择的实现 | 运行位置 / 请求 |
|---|---|---|
| entertainment | `engines/entertainment/index.ts` → kit → `live/engine.ts` | 浏览器导演与演员 → `llm/client.ts` → `/api/llm/chat` |
| emotion | `engines/emotion/index.ts` → kit → `live/engine.ts` | 浏览器导演与演员，三阶段与等待用户 → 同一模型代理 |
| rational | `engines/rational/index.ts` → `engine.ts`、`schedule.ts` | 浏览器独立导演/辩手/赛后整理 → 同一模型代理；不评分或判胜负 |
| product | `engines/product/index.ts` → `engines/backend.ts` | `/api/sessions` + SSE → `server/session.ts` → `server/work.ts` |

`src/types.ts` 定义 `DiscussionEngine`、`SessionConfig`、`EngineEvent`、人物与场景契约。`live/` 共享调度、状态和提示词框架，各模式 kit 提供独立规则；辩论不并入 live，工作不在浏览器执行任务。MC 的 `director.ts` / `sceneDirector.ts` 是**舞台动作导演**，消费引擎事件，不是发言决策导演。

`server/config.ts` 解释服务器传入的 `LLM_*`（兼容 `ROUNDTABLE_*`）；`llm-proxy.ts` 为浏览器请求补凭据，`llmAgent.ts` 供 Node 会话调用。开发/预览由 Vite 插件加载配置，发布由 `serve.mjs` 加载 `.env`、`.env.production` 及进程环境；私人值不进入前端。

Node API：`GET /api/health`、`POST /api/llm/chat`、`POST /api/sessions`、`GET /api/sessions/:id/events` 和 `messages/pause/resume/stop`。SSE 用事件序号和 `Last-Event-ID` 补发。会话和事件保存在进程内存，前端引擎状态保存在本页；没有持久会话数据库。连接断开一分钟后停止孤立会话，结束后保留一小时供追问。停止中断请求并释放流程等待。

**兼容边界**：当前页面只有工作模式调用 Node 会话，但 API 校验仍接受四种模式，`session.ts` 中保留 `runTalk` / `runDebate` 与相应提示词，既有检查也使用它们。它们不是新页面的主实现，也不能仅因此删除。Python `backend/服务.py` / 讨论脚本独立保留；当前网页不请求 Python，发布不启动它。`scripts/legacy.mjs` 是独立历史版本比较入口，会检出旧分支并复制本地配置，本次未执行。

## 人物与 2D 边界

- `data/personas.ts` 用 eager glob 加载 `frontend/personas/**/*.json`，支持简化格式与 `persona-protocol/src/protocol.mjs` 协议格式。
- `data/rationalPersonas.ts` 直接加载 `backend/人物/理性/*.json` 与 `backend/性格库/性格.json`，适配 5 位辩论人物并与前端人物库按 id 合并。前端同 id 文件优先，重复记录在问题列表。
- 内置共 33 个 id：娱乐 8、情感 7、工作 13、辩论 5。用户导入格式、人物设定、性格选择与 `x-*` 扩展受保护；3D look 不改写 persona。
- 2D 使用 `data/scenes.ts` 的六张背景、座位与工位布局、`PixelAvatar.tsx` / `pixelAvatarDraw.ts`、`OfficeBubbles.tsx`、`discussionHooks.ts` 和 `styles.css`。自定义场景保存 localStorage，导入人物只在当前页面内保存。
- MC 仅保留 `roundtable-mc`，以 `sourceSceneId=roundtable` 回到原图；六个 2D 场景及各模式默认场景保留。业务事件及走路/排队时序由 `data/stageRules.ts` 等共用，视觉实现相互独立。

## MC 3D 调用路径

```text
DiscussionView / stage-lab / mc-lab
  → McStage3D
    → rooms/scenes::buildMcRoom → v2/roundtable → Room
    → loadAssets → manifest / blocks / atlas / items / font / sounds
    → validateRoom + RoomPhysics
    → blockMesh / blockEntities / props / player / sky / light
    → sceneDirector（只消费讨论事件）
    → StageCamera / SpectatorCamera
    → post → rendering/postCommon → WebGLRenderer
    → Hud + onFocus / onStageDone（动作完成桥）
```

按用户随后确认的范围，3D 仅保留正在重建的圆桌 v2。`rooms/scenes.ts::buildMcRoom()` 直接构造 `v2/roundtable`；其他种类抛出已移除错误，不再回退旧版。`rooms/types.ts` 保存共用 Room/锚点/家具碰撞契约；`props/types.ts`、`props/book.ts` 保存圆桌所需的道具接口与书本，`styledProps.ts` 负责圆桌地面、椅子和话题板。旧六房间、旧设计登记、辩论专用物件/舞台调度及评委行走均已退役。

`mc/assets.ts::loadAssets` 根据显式 material、房间 material 与 paint 决定图集，再在加载时应用房间 paint。不要把旧交接文档的“所有房间默认 style/hd”当作当前事实。当前材质选择以房间定义和加载器为准；Lab 的 `material=original|hd|style` 用于对比。有 paint 且请求 hd 时退到 original，style/original 仍可叠加 paint。

贴图、方块模型、字体、音效均在 `frontend/public/mc/`：静态 URL、manifest 和图集索引是运行依赖。`mc-import.mjs` 从本机游戏资源导入，按目录遍历 `mc-packs/*.zip` 叠加模型/贴图，`mc-hd.mjs` 与 `mc-style.mjs` 管候选材质；`mc-font.mjs` 与 `mc-textures.mjs` 是生成链依赖。Better Leaves 来源/许可证、Faithful 许可与音频署名随资源保留。当前没有追踪的 GLB/GLTF 模型加载路径，历史普通 3D 组件描述不再适用。

`McStage3D` 创建并管理 RAF、观察器、镜头输入、玩家、道具、物理与后处理资源；切换/卸载负责清理。开发时暴露 `window.__mcStage`，`mc-lab` 另有 `__mcLab`，截图/验收脚本依赖这些钩子；生产模式不保证此调试接口。

## 场景与人物的新旧关系

| 路径 | 当前关系 | 保留与迁移条件 |
|---|---|---|
| `v2/roundtable/` | 唯一 3D 房间（第二轮：围合的园林水面）。`site`（总平面、岸线多边形）、`structure` + `terrain`（方块：主榭、月台、水廊、曲桥、南院、园路、驳岸、假山）、`timber`（主榭和水廊的细木作、屋面、六角亭）、`garden`（园墙与月洞门、山顶方亭、两层楼、北廊、石拱桥）、`shore`（驳岸和崖面叠石）、`water`（自写着色的倒影水面）、`scenery`（天穹和园外远景）、`flora` / `floor` / `furnish` / `paint` / `mesh`，由 `index.ts` 装成 Room | 仍是未完成样板，保留并不代表用户视觉验收。交接见 [ROUNDTABLE_GARDEN.md](docs/design/ROUNDTABLE_GARDEN.md) |
| `rooms/` | Builder、Room 类型、验证、物理和唯一登记入口 | 没有旧房间构造器或版本回退 |
| `player.ts → avatar/ → skin.ts` | 共同人物构造/表情路径，圆桌与人物实验台使用 | 已接入不代表美术获批；保留 33 人 look 与 fallback |
| `props/chairs.ts` / `props/floors.ts` | 圆桌和 avatar-lab 共用的椅子/地面 | 当前几何、造型与颜色保持原样 |

“只保留圆桌重建版”是用户明确的场景收敛决定，不是 Agent 自行判断旧版审美较差。四种讨论业务和全部 2D 场景继续存在；圆桌 v2 尚未完成，也未通过视觉验收。历史归档和 Git 恢复基线用于追溯，不再作为当前场景任务。

边界契约：`bounds` 是柱线以内的行走/寻路范围，`flight ?? bounds` 是自由相机范围，移动时保留相机半径余量。`RoomPhysics` 从真实方块模型及家具生成碰撞体，在飞行范围内仍逐步检查实体碰撞；椅垫和椅背不再按名称跳过。默认机位、行走范围和飞行范围以 `v2/roundtable/site.ts` 的 `VIEW` 和 `index.ts` 里的 `bounds` / `flight` 为准（第二轮 flight 是园墙以内）。水廊屋面、园墙、北岸楼亭和拱桥是道具网格，不占方块；镜头碰撞写在 `occluders` 里（`garden.ts::gardenOccluders`），人在廊内的高度不会被屋顶挡住。方块光照网格的范围随方块往负方向扩展（`light.ts`）；`Look.shadowArea` 可以把太阳阴影罩到中景，`Look.bloom` 可以压低泛光，`Look.ao` 给高画质的环境光遮蔽强度；`Room.floorFinish` 给地面图粗糙度和环境反射倍数（打磨过的地面）。主榭方块屋顶仍然挡镜头。水面实时倒影挂在网格的 `userData.setReflections` 上，`styledProps.setReflections` 在低画质时关掉；同物件的 `userData.dispose` 释放水面几何、材质和倒影目标。`mc-lab` 用查询参数 `cast` 只请指定人物入座。真实物理及浏览器验证见 [收敛记录](docs/MAINTENANCE_AUDIT.md#圆桌-3d-收敛用户调整范围) 和 [第一轮交接](docs/design/ROUNDTABLE_GARDEN.md)。

## 实验、构建与维护

| 入口 | 作用 | 可用范围 |
|---|---|---|
| `stage-lab.html` | 圆桌重建样板、发言和视角；占位人物 | 开发与生产构建 |
| `mc-lab.html` | 圆桌真实内置人物、动作事件、材质/近景对比、截图钩子 | 开发；唯一种类 roundtable |
| `avatar-lab.html` | 人物体型/表情/姿态、椅子与地面实验 | 开发 |
| `public/expression-demo.html` | 由 `make-expression-demo.mjs` 生成的静态 2D 样本 | public 静态页，非实时人物编辑入口 |

`frontend/vite.config.ts` 两个构建入口为 app 与 stagePreview；`tsconfig.json` 严格检查全部 `src`。`vite.server.config.ts` 单独打包 `server/api.ts` 为根目录 `server-dist/api.mjs`，不能只靠前端 build 发布。根目录 `npm run build` 覆盖两者；`npm test` 聚合全部离线检查，覆盖唯一圆桌样板、退役入口、六个 2D 场景及四种业务契约。

## 文档布局

根目录 README 面向使用者，AGENTS / STANDARDS / VERIFY 管维护规则，本文件管实际调用关系。根目录 [docs/README.md](docs/README.md) 是项目文档导航；[frontend/docs/README.md](frontend/docs/README.md) 是当前前端说明入口，`character-looks.md` 从实际配置生成。

旧交接、样板轮次和视觉基线统一放在 [frontend/docs/archive/](frontend/docs/archive/README.md)。归档不改变运行路径，也不代表美术获批或方案废弃；素材用途和精简依据在归档索引及审计记录中维护，当前文档不再与旧执行手册混放。
