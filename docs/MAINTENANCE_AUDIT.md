# 项目治理与遗留审计（2026-10-09）

## 范围、事实与判断

用户明确要求：保留四模式、人物、互动、会话控制、六个 MC 场景及全部 2D；暂停新美术；保留未确认实验与必要基线；只清理已证明无用且可恢复的对象；保护私人配置、浏览器数据和用户修改。

开始时的可测事实：工作区干净；分支 `maintenance/governance-20261009`，HEAD `eed2808`；本地恢复分支 `audit/pre-governance-20261009` 同样指向 `eed2808`。远端仓库为 Maxworkinghard/muti-agent，默认分支 main；本次按本地实际内容工作，不假设远端与本地始终一致。没有执行 reset、变基、合并或 push。

Agent 判断：当前源码未找到能直接安全删除的整文件；有调用者的旧实现、功能未迁移的样板和未确认图片继续保留。该判断基于本轮依赖与验证，不代表用户已选择某套美术。分类、文档索引和少量技术整理足以改善接手；删除数量不是完成指标。

## 实际架构概要

`index.html → main.tsx → App → DiscussionView` 是产品链。娱乐/情感在浏览器共享 live 导演与演员底盘，辩论有独立浏览器调度，三者走 Node 模型代理；工作通过 Node 会话和 SSE，由 `server/work.ts` 执行。Python 服务是独立工具，网页不调用。人物由前端库与 backend 理性 JSON/性格库合并；有 33 个内置 id。

2D 用原图、像素人物、气泡与工位布局；`*-mc` 是用户主动选的独立入口，可回到同名原图。MC 组件负责资产、房间、舞台事件、人物、镜头、物理和后处理；舞台导演与讨论决策导演职责不同。详细文件与路径只在 [ARCHITECTURE.md](../ARCHITECTURE.md) 维护。

旧 `buildMcRoom` 六房间仍为产品默认。`buildMcRoomV2` 只有圆桌；两个预览页 `v=2` 选择它，其他场景回退旧版。`player → avatar → skin` 已是共享人物路径，场景版本开关不会切换人物版本；小动物和评委行走仍使用 `cuboid()`。新椅子族/地面在圆桌 v2 和人物实验台使用，其他房间尚未迁移。没有把 v2 切为正式默认，也没有将已接入人物造型判为美术获批。

## 审计方法与分类

检查实际 Git 清单、Vite 两个构建入口、HTML module script、静态与动态导入、人物 eager glob、`ssrLoadModule` 测试入口、素材生成脚本、静态 URL、manifest/atlas 索引、目录枚举及真实页面。源码导入图覆盖产品与三个实验入口，未据此宣称所有内部函数都在每次运行执行。资源目录可能有非默认或比较用途，搜索无引用不作为删除证据。

逐文件清单见 [LEGACY_INVENTORY.json](LEGACY_INVENTORY.json)：记录基线下重点路径、字节数、源码引用和文档提及；组内共享用途、动态/构建/测试证据及决定。分类含 A 当前有效、B 有效但重叠、C 已证实废弃、D 历史或尚不能确认；空引用数组不等于 C。

| 对象 | 分类 | 当前依赖 / 处理 |
|---|---|---|
| `frontend/docs/handoff/01`–`08` | D | 早期模式和多轮房间快照；各文件加入历史提示，继续保留正文 |
| `frontend/docs/rebuild/00-contract.md`、`01-roundtable-v2.md` | D | v2 起点消费者审计、圆桌方案与对照；标历史/实验，当前契约回到源码 |
| `frontend/docs/art/00-roster.md`、`01-baseline-audit.md`、`03-sample-log.md`、`HANDOFF.md` | D | 名册、旧基线和差距有追溯价值；标历史并修正失效待办/自验措辞 |
| `frontend/docs/art/02-character-looks.md` | A | 当前配置的生成技术说明；修复生成器后重建，明确不代表视觉验收 |
| `frontend/src/mc/rooms/`、`design/` | A | `buildMcRoom → planFor → 六构造器`；正式工作台和测试均使用，保留 |
| `frontend/src/mc/v2/` | B | 同一 Room 契约的圆桌实验实现；Lab 与测试仍使用，保留；推广条件未满足 |
| `frontend/src/mc/avatar/`、`player.ts`、`skin.ts` | A | 正式 MC、v2 和实验台共享；33 人 look 和 fallback 保留 |
| `mc/props/chairs.ts`、`floors.ts` | B | 新椅子族/地面和旧家具并存；在圆桌 v2/实验台有效，未迁移到旧五房间 |
| `mc/props/chair.ts`、`table.ts` 等旧物件、`furniture.ts`、`studio.ts` | A/B | 各房间钩子、道具条件分支和工具箱仍调用；非默认分支不是废弃证据，保留 |
| `cuboid()`、`freeView.ts`、`critters.ts` | A | Steve 与小动物需要旧式皮肤盒子，与 Q 版参与者职责不同，保留 |
| `frontend/src/avatar-lab/`、`mc-lab/`、`stage-lab/` 及 HTML | A | 真实实验入口；前两者仅开发，stage-lab 在生产构建也可访问，保留 |
| `frontend/scripts/check-*.mjs` | A | 既有 15 检查有效，v2 与旧房间分别覆盖；加入完整娱乐回归与统一 test 入口 |
| `mc-import/mc-hd/mc-font/mc-textures/mc-style.mjs` | A | 素材生成链与按目录/源码发现资源；不重新生成、不删除 |
| `run-hd-only.mjs`、`mc-shots.mjs`、`mc-shots.cams.json` | A | 单独 HD 构建、浏览器抓图/机位有手动用途；保留；重生成需要对应本地环境 |
| `make-expression-demo.mjs`、`public/expression-demo.html` | A | 生成器和静态 2D 实验样本；不能当无用网页删除，保留 |
| `sim.mjs` | A | 真实模型命令行实验，非默认页面入口；读取配置，本次未运行，保留 |
| `frontend/server/session.ts` 的旧 talk/debate 路径 | B | 页面目前只工作模式使用，但 API 仍接受四模式，既有回归使用；保留兼容 |
| `backend/*.py`、`backend/提示词/` | A/B | 独立工具/API/生成链仍有用途；与网页不同，说明边界并保留 |
| `scripts/legacy.mjs` | D | package 仍有入口，会检出旧分支并复制私人配置；本次未运行，未证明废弃 |

## 已整理的文件与依据

**整文件删除数：0。** 没有删除仍有依赖的旧实现或不确定资源。以下整理都有基线，可按路径恢复。

| 文件 | 具体整理 / 理由 |
|---|---|
| 根目录 `AGENTS.md`、`STANDARDS.md`、`VERIFY.md`、`ARCHITECTURE.md` | 新统一入口、职责边界、交付状态与实际架构，分别负责不同内容 |
| `README.md`、`frontend/README.md`、`frontend/docs/README.md` | 当前运行、实验/构建边界、历史索引；修正旧辩论裁判描述，补 PowerShell 与检查入口 |
| `frontend/src/engines/rational/README.md` | 补齐独立辩论模块维护入口，与真实无评比总结一致 |
| `package.json`、`frontend/package.json`、`scripts/test-all.mjs`（在 frontend） | 清除 root 描述中的 Python 单端口误述；统一离线回归命令，补 2D/娱乐检查命令 |
| `frontend/scripts/check-entertainment.mjs` | 补专属 kit 的完整收尾、暂停中私聊、点名、恢复、结束后继续和停止覆盖；避免只验证开场 |
| `frontend/scripts/gen-looks-doc.mjs` + `docs/art/02-character-looks.md`（在 frontend） | 删除过时的固定比例解释；从当前 rig/body 推导 8 体型、4 头型、3 坐姿，补配饰标签、body 来源与 request 标记；消除旧数据和 `undefined` |
| `frontend/src/mc/avatar/rig.ts` | 只修正旧眼高、下沉、手心与历史比例相关注释；所有常量/公式保持原状 |
| `frontend/src/mc/props/debateProps.ts` | C：删除重复 `DebateProps` 声明，仅保留采用 `AtlasLike` 的等价接口 |
| `frontend/server/api.ts`、`config.ts` | 修正情感仍在 Node 运行/共用 Python 配置的旧注释；接口逻辑原样 |
| `frontend/personas/README.md` | 明确校验命令的工作目录，修正相对路径歧义 |
| `backend/README.md`、`使用指南.md`、`前端对接说明.md`、`提示词/使用说明.md` | 标明独立 Python 工具/API/提示词与网页的边界；修正娱乐人物“待添加”和仓库外草稿路径 |
| `frontend/docs/handoff/*.md`、rebuild 两篇、art 四篇历史文档 | 原位标历史；HANDOFF 两个“未写”改为后来已生成；旧“可接受”标为当时 Agent 选择，非用户验收 |
| `docs/LEGACY_INVENTORY.json`、本报告 | 可追溯的审计快照与实际处理记录，不新增另一套长期规范 |

唯一删除对象的完整记录：

- 路径：`frontend/src/mc/props/debateProps.ts` 中第一份 `export interface DebateProps`。
- 过去用途：道具运行对象的 TypeScript 接口；与后一份声明合并。
- 当前引用：MC 组件、styled props、检查使用导出的 `DebateProps`；没有依赖“第一份声明”这一位置的独立调用者。
- 替代：后一份保留所有字段和方法，`AtlasLike` 与原嵌套 itemAtlas 结构等价。
- 动态/构建/测试：接口由 TypeScript 擦除，不是动态资源、构建入口或用户配置；运行工厂/分支未删。
- 影响：消除重复维护点，导出类型及运行结果保持等价。类型检查、转译等价检查、旧/v2 数据回归与真实页面验证覆盖影响。
- 删除依据：直接对比两份定义和使用者，属于已证明冗余声明。不是按文件名或零搜索认定废弃。
- 恢复：先查看 `git show audit/pre-governance-20261009:frontend/src/mc/props/debateProps.ts`，需要时仅恢复该声明或反向应用本次对应 diff；不重置整个工作区。

## 文档冲突修正

| 旧说法 | 可测事实与处理 |
|---|---|
| root package 描述发布同时运行 Python | `serve.mjs` 只加载 Node 打包服务与静态页；描述已修正 |
| README 主持兼裁判、判定胜负 | `rational` 总结只保留讨论字段，检查禁止打分/排名；README 已修正 |
| api.ts 情感使用 Node 会话 | `registry.ts` 指向 emotion 的 live kit；注释已修正，Node 兼容分支保留 |
| 历史文档把普通 `SceneStage3D` / 精模入口当现状 | 当前 types/scenes/DiscussionView 只有 2D 与六 MC 入口；历史部分不再冒充当前路径 |
| 旧文档统一声明所有房间默认 style 或 hd | 当前按 props/Room/manifest/paint 和 optionalPack 选择；架构准确记录，有 paint 请求 hd 才退 original |
| HANDOFF 当前分支 mc-rebuild、旧 remote/tag 指向 | 本次实际分支与基线单独记录；历史分支表保留当时语境，不改写为当前事实 |
| 两份 art 文档尚未写 | 文件已有且造型说明可生成；状态修正，样板差距日志归历史 |
| 造型说明所有人统一旧骨架、1:1.3–1:1.5、配饰丢标签 | 当前 8 种体型、约 3–3.6 头身的配置与新配饰存在；修复生成器并重建，技术数据不升级为永久设计规则 |
| 历史轮次“可以接受”、样板通过 | 标明当时 Agent 处理选择，未据此替用户作视觉验收 |

## 截图与资源

以下数字来自基线 Git 追踪清单，不包括 `.verify/`、`.shots/`、工作目录外用户图片/录屏或本次临时截图。资产未删，许可证未变。

| 组 | 数量 / 基线体积 | 决定 |
|---|---|---|
| `docs/screens/` 产品图 | 4 张，约 3.23 MiB | README 引用，A 保留 |
| `frontend/docs/art/baseline/` | 24 张 | D 必要人物/家具对照，保留 |
| `frontend/docs/rebuild/baseline/` | 12 张 | D 旧房间对照，保留 |
| `frontend/docs/art/sample/` | 67 张 | D 未确认轮次/比较，保留 |
| `frontend/docs/rebuild/roundtable-v2/` | 86 张 | D 未确认样板/比较，保留；另有历史 HTML 比较产物，清单一并登记 |
| 上述 art/rebuild 图片合计 | 189 张，105,811,830 字节（约 100.91 MiB） | 未强行裁剪；删除量不作为指标 |
| `frontend/public/mc/` | 785 个追踪文件，模型 JSON/图集/字体/音效/贴图/预览/许可 | 正式依赖与比较候选逐组登记，全部保留 |
| `mc/textures/` 原版散图/元数据 | 539 个，307,068 字节 | 部分被动态 URL 直接加载，余者是否可精简未证明，D 保留 |
| `mc/style/` 与 `mc/hd/` | 143 / 12 个，约 1.07 / 1.78 MiB | 比较包与单图候选保留；Faithful LICENSE/CREDITS 保留 |
| `frontend/mc-packs/` | Better Leaves zip + README，约 1.89 MiB | 导入器按目录枚举，A；MIT 全文与来源仍在 THIRD-PARTY |
| GLB/GLTF 模型 | 0 个追踪文件 | 当前不依赖旧普通 3D 模型路径 |

未把外部提供/确认的参考图搬入 Git，也没有从仓库外截图推断删除价值。音频 CREDITS、Better Leaves 声明和 Faithful 许可全文都保留。

## 待决项与残留

- 189 张历史/实验图及比较 HTML：未来可讨论最小代表集，先确认未决方案与对照价值、全部 Markdown/HTML 引用和恢复点；本轮不删。
- 五个缺失 v2 房间、新椅子/地面对其他房间的迁移：需要新任务、功能替代证据与必要的用户视觉确认；不能因圆桌测试通过即推广。
- 旧物件及 Node talk/debate 分支：主页面不走的部分仍有兼容/钩子/测试作用；废弃前明确所有调用方及迁移，当前保留。
- 原版散图及候选材质单图：可以将生成输出与运行资产进一步区分，但需静态 URL、动态索引、实验与重生成验证；当前证据不足以删除。
- `scripts/legacy.mjs`、sim 与游戏导入/HD 重生成：涉及旧检出、私人配置、真实服务或本机游戏包，本次未执行，不能报告运行通过。
- 既存 Vite chunk >500 kB 警告、未来 native config loader 的扩展名提示、7 个娱乐人物的头像为空提醒仍存在；当前构建和人物 fallback 有效。未扩展为性能或美术改造。
- `mc-lab` 无显式 material 时选择框写 style，而实际房间可能指定 original；运行素材应查看 Room/加载器/署名。本轮记录此实验页标签歧义，不调整视觉或默认材质。
- 已复现的旧版自由镜头技术债：辩论室默认机位 `[11,10,30]` 位于室内 `bounds` 外但在 `flight` 内；`SpectatorCamera.enter()` 可把它选为起点，`RoomPhysics.cameraBlocked()` 却仅允许 bounds，故接入真实碰撞后 W 无法移动。真实页面可锁鼠标、RAF 正常，起点 `cameraBlocked=true`，`moveCamera` 也不改变坐标。原 `test:mc-spectator` 没有传真实 RoomPhysics，所以仍通过。房间、镜头和碰撞代码与基线相同，属于既存问题，不能报告该默认起点的自由移动通过。改变外部飞行范围或重选内部起点涉及现有场景/视角契约，列为后续有界修复；本轮未改机位/空间规则。
- 工作台请求 `/favicon.ico` 返回 404；仓库没有该文件，属于既存的小型页面资源缺口。场景图片、MC 图集与模型代理请求成功；本轮不新增图标美术。

## 验证结果

环境：Windows / PowerShell，Node 24.19.0、npm 11.17.0。基线 root build（含 frontend build 和 Node 打包）及原有 15 个检查均通过；清理后根目录完整构建、前端独立构建与统一 16 项回归全部通过。

| 命令 / 检查 | 最终结果与范围 |
|---|---|
| 根目录 `npm run build` | 通过：前端严格类型检查、Vite 两个 HTML 入口、Node API 打包 |
| 根目录 `npm --prefix frontend run build` | 通过：独立前端构建；dist 只有 index / stage-lab / public 静态 expression-demo 三个 HTML，没有 mc-lab / avatar-lab |
| 根目录 `npm test` | 16/16 通过：原有 15 个检查与新增娱乐完整流程；工作完整 13 人流程核对 175 个事件，包含并发、暂停、私聊、停止与失败处理 |
| `python backend/校验.py`、人物协议 CLI 样例 | 5/5 理性人物与协议样例通过；未修改人物 JSON |
| 运行源码等价性 | 四个编辑过的运行文件使用 TypeScript 去注释转译，输出与 eed2808 逐字相等；其余 981 个受保护的 UI/2D/引擎/人物/协议/资源路径无差异 |
| 文档与清单 | 31 篇当前/变更文档的 116 个本地 Markdown 链接有效，所写 npm 脚本存在，33 人生成说明无 undefined / NaN，重新生成后 SHA256 完全一致；1158 个基线清单对象均存在 |
| Git diff | `git diff --check` 通过；明确路径暂存并审阅，不包含私人配置、图片、浏览器资料、日志或构建输出；依赖及 lockfile 未改 |

真实页面使用仓库 Vite 配置、隔离 envDir 和本地固定模型；没有打开私人配置或调用真实服务商。截图只在仓库外系统临时目录 `muti-agent-governance-20261009`，未提交 Git。

| 项目 | 已获得证据 |
|---|---|
| 六个 MC 房间 | 真实截图和运行对象：roundtable 305 方块/8 人；debate 754/7；office 683/13；classroom 495/8；meadow 4710/8；podcast 294/2，加载无房间错误 |
| 版本 | stage-lab 圆桌 `v=2` 有 drawBoard、1770 方块/8 人；同页切办公室仍是旧版 683 方块/13 席；正式辩论房间仍旧版 |
| MC 动作 | mc-lab 开场、起身、走到、开麦、发言气泡的真实动作 trace；相应导演/物理检查通过 |
| 镜头 | 人物视角切换改变镜头坐标、回到默认恢复机位；默认外部起点的自由移动未通过，原因及旧测试缺口见残留条目；不能把无碰撞桩测试代替真实接入 |
| 预览入口 | stage-lab、mc-lab、avatar-lab 真实开发页面/画布与截图；隔离配置的 Vite preview 中，生产工作台能显示四模式，stage-lab 圆桌完成真实渲染且无场景错误；这是打包页验证，未运行带鉴权的 serve.mjs |
| 主应用四模式 | 固定模型下娱乐/情感/辩论首句可显示；工作 Node/SSE 派活与第一版出现；娱乐/情感/工作暂停恢复可触发；完整流程由离线检查覆盖 |
| 人物 | backend 5 个角色 JSON 校验通过；协议样例 CLI 通过；MC 检查覆盖 33 id，未改变设定 JSON |
| 2D 与数据 | 2D 场景、人物/气泡/布局、styles、人物/性格 JSON 与 public 资源对比基线无修改；真实 2D 页面截图及 pixel-avatar 检查；主应用 MC 辩论室切回原图后继续显示讨论 |

尚未得到证据的项不写通过。固定模型证明调用/事件链，不证明真实服务商质量；真实视觉参考验收、硬件 GPU 性能与音频听感不在本次声明范围。没有宣称全项目所有技术债已解决或六场景视觉验收通过。

## 目录与接手改善

```text
AGENTS.md / STANDARDS.md / VERIFY.md / ARCHITECTURE.md
README.md
docs/
  MAINTENANCE_AUDIT.md / LEGACY_INVENTORY.json
  screens/                         产品文档配图
frontend/
  README.md
  src/components/、data/、engines/  2D/UI/讨论边界
  src/mc/                          当前六场景、共享人物与渲染
    v2/                            圆桌实验，未替换默认
  src/stage-lab/、mc-lab/、avatar-lab/
  server/                          Node 模型代理、会话/工作
  personas/、public/、mc-packs/     有效资料与资源/许可
  scripts/                         回归、生成、抓图与模拟
  docs/README.md                   历史状态入口
    handoff/、rebuild/、art/        保留追溯/实验/比较基线
backend/                           共享理性数据与独立 Python 工具
persona-protocol/                  当前人物校验
scripts/legacy.mjs                 未验证的历史比较入口
```

目录未搬动运行资源。接手者现在能从一个短入口找到规范、真实调用图与模块说明；不会把 Python 当网页前置服务、把情感误认为 Node 调度、把样板当默认或把 Q 版人物当仅 Lab；历史文档失去当前指令效力，过期状态得到标注；一条 `npm test` 覆盖现有回归且补齐娱乐完整流程。生成造型说明从当前数据得出，避免继续手写旧比例。

恢复时先审阅本次提交与 `audit/pre-governance-20261009` 的对应路径 diff，按对象恢复或反向应用。不要 reset 全仓库，不覆盖后续用户修改；本报告不是未来自动删除授权。
