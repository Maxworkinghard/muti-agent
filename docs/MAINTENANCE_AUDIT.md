# 项目治理与遗留审计（2026-10-09）

**最新范围见[圆桌 3D 收敛](#圆桌-3d-收敛用户调整范围)。** 下方前三轮的目录、六 MC 房间、默认版本及验证数字是当时快照；后来用户明确改为只保留正在重建的圆桌 3D，保留六个 2D 场景和四种讨论业务。历史快照不再作为当前任务或待办。

## 范围、事实与判断

上一轮治理任务中用户明确要求：保留四模式、人物、互动、会话控制、六个 MC 场景及全部 2D；暂停新美术；保留未确认实验与必要基线；只清理已证明无用且可恢复的对象；保护私人配置、浏览器数据和用户修改。“暂停新美术”仅约束该维护任务，不能阻止后来明确授权的美术工作，也不属于长期全局禁令。

开始时的可测事实：工作区干净；分支 `maintenance/governance-20261009`，HEAD `eed2808`；本地恢复分支 `audit/pre-governance-20261009` 同样指向 `eed2808`。远端仓库为 Maxworkinghard/muti-agent，默认分支 main；本次按本地实际内容工作，不假设远端与本地始终一致。没有执行 reset、变基、合并或 push。

第一轮没有删除整文件；后续确认三张精确重复截图，并按素材用途精简五张额外软件细节采样；均有保留内容和 Git 恢复点。当前源码未找到能直接安全删除的整文件；有调用者的旧实现、功能未迁移的样板和独有的未确认图片继续保留。这是基于依赖与验证的判断，不代表用户已选择某套美术；删除数量不是完成指标。

## 实际架构概要

`index.html → main.tsx → App → DiscussionView` 是产品链。娱乐/情感在浏览器共享 live 导演与演员底盘，辩论有独立浏览器调度，三者走 Node 模型代理；工作通过 Node 会话和 SSE，由 `server/work.ts` 执行。Python 服务是独立工具，网页不调用。人物由前端库与 backend 理性 JSON/性格库合并；有 33 个内置 id。

2D 用原图、像素人物、气泡与工位布局；`*-mc` 是用户主动选的独立入口，可回到同名原图。MC 组件负责资产、房间、舞台事件、人物、镜头、物理和后处理；舞台导演与讨论决策导演职责不同。详细文件与路径只在 [ARCHITECTURE.md](../ARCHITECTURE.md) 维护。

旧 `buildMcRoom` 六房间仍为产品默认。`buildMcRoomV2` 只有圆桌；两个预览页 `v=2` 选择它，其他场景回退旧版。`player → avatar → skin` 已是共享人物路径，场景版本开关不会切换人物版本；小动物和评委行走仍使用 `cuboid()`。新椅子族/地面在圆桌 v2 和人物实验台使用，其他房间尚未迁移。没有把 v2 切为正式默认，也没有将已接入人物造型判为美术获批。

## 审计方法与分类

检查实际 Git 清单、Vite 两个构建入口、HTML module script、静态与动态导入、人物 eager glob、`ssrLoadModule` 测试入口、素材生成脚本、静态 URL、manifest/atlas 索引、目录枚举及真实页面。源码导入图覆盖产品与三个实验入口，未据此宣称所有内部函数都在每次运行执行。资源目录可能有非默认或比较用途，搜索无引用不作为删除证据。

逐文件清单见 [LEGACY_INVENTORY.json](LEGACY_INVENTORY.json)：记录基线下重点路径、字节数、源码引用和文档提及；组内共享用途、动态/构建/测试证据及决定。分类含 A 当前有效、B 有效但重叠、C 已证实废弃、D 历史或尚不能确认；空引用数组不等于 C。三张完全重复副本按文件级 C 去重；五张非等价采样更正为文件级 B（信息重叠），已删除是历史处理事实，不能倒推为已证明毫无价值。各项保留替代路径、完整 SHA256 和恢复基线；path 是原始路径，currentPath 是现址或 null。

| 对象 | 分类 | 当前依赖 / 处理 |
|---|---|---|
| `frontend/docs/archive/handoff/01`–`08` | D | 早期模式和多轮房间快照；各文件加入历史提示，继续保留正文 |
| `frontend/docs/archive/rebuild/00-contract.md`、`01-roundtable-v2.md` | D | v2 起点消费者审计、圆桌方案与对照；标历史/实验，当前契约回到源码 |
| `frontend/docs/archive/art/00-roster.md`、`01-baseline-audit.md`、`03-sample-log.md`、`HANDOFF.md` | D | 名册、旧基线和差距有追溯价值；标历史并修正失效待办/自验措辞 |
| `frontend/docs/character-looks.md` | A | 当前配置的生成技术说明；修复生成器后重建，明确不代表视觉验收 |
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

**累计整文件删除数：8，三张精确重复副本及五张信息高度重叠但不等价的软件渲染细节采样，合计 3,366,913 字节（约 3.21 MiB）。** 没有删除仍有依赖的旧实现或产品资源。五张采样的删除是参考用途的维护取舍，并非已证明没有任何信息价值；以下整理都有基线，可按路径恢复。

| 文件 | 具体整理 / 理由 |
|---|---|
| 根目录 `AGENTS.md`、`STANDARDS.md`、`VERIFY.md`、`ARCHITECTURE.md` | 新统一入口、职责边界、交付状态与实际架构，分别负责不同内容 |
| `README.md`、`frontend/README.md`、`frontend/docs/README.md` | 当前运行、实验/构建边界、历史索引；修正旧辩论裁判描述，补 PowerShell 与检查入口 |
| `frontend/src/engines/rational/README.md` | 补齐独立辩论模块维护入口，与真实无评比总结一致 |
| `package.json`、`frontend/package.json`、`scripts/test-all.mjs`（在 frontend） | 清除 root 描述中的 Python 单端口误述；统一离线回归命令，补 2D/娱乐检查命令 |
| `frontend/scripts/check-entertainment.mjs` | 补专属 kit 的完整收尾、暂停中私聊、点名、恢复、结束后继续和停止覆盖；避免只验证开场 |
| `frontend/scripts/gen-looks-doc.mjs` + `docs/character-looks.md`（在 frontend） | 删除过时的固定比例解释；从当前 rig/body 推导 8 体型、4 头型、3 坐姿，补配饰标签、body 来源与 request 标记；消除旧数据和 `undefined` |
| `frontend/src/mc/avatar/rig.ts` | 只修正旧眼高、下沉、手心与历史比例相关注释；所有常量/公式保持原状 |
| `frontend/src/mc/props/debateProps.ts` | C：删除重复 `DebateProps` 声明，仅保留采用 `AtlasLike` 的等价接口 |
| `frontend/server/api.ts`、`config.ts` | 修正情感仍在 Node 运行/共用 Python 配置的旧注释；接口逻辑原样 |
| `frontend/personas/README.md` | 明确校验命令的工作目录，修正相对路径歧义 |
| `backend/README.md`、`使用指南.md`、`前端对接说明.md`、`提示词/使用说明.md` | 标明独立 Python 工具/API/提示词与网页的边界；修正娱乐人物“待添加”和仓库外草稿路径 |
| `frontend/docs/archive/handoff/*.md`、rebuild 两篇、art 四篇历史文档 | 原位标历史；HANDOFF 两个“未写”改为后来已生成；旧“可接受”标为当时 Agent 选择，非用户验收 |
| `docs/LEGACY_INVENTORY.json`、本报告 | 可追溯的审计快照与实际处理记录，不新增另一套长期规范 |

以下前两轮的对象标签已同步为现址，原始路径仍在清单和对应恢复分支中。第一轮删除的重复类型声明：

- 路径：`frontend/src/mc/props/debateProps.ts` 中第一份 `export interface DebateProps`。
- 过去用途：道具运行对象的 TypeScript 接口；与后一份声明合并。
- 当前引用：MC 组件、styled props、检查使用导出的 `DebateProps`；没有依赖“第一份声明”这一位置的独立调用者。
- 替代：后一份保留所有字段和方法，`AtlasLike` 与原嵌套 itemAtlas 结构等价。
- 动态/构建/测试：接口由 TypeScript 擦除，不是动态资源、构建入口或用户配置；运行工厂/分支未删。
- 影响：消除重复维护点，导出类型及运行结果保持等价。类型检查、转译等价检查、旧/v2 数据回归与真实页面验证覆盖影响。
- 删除依据：直接对比两份定义和使用者，属于已证明冗余声明。不是按文件名或零搜索认定废弃。
- 恢复：先查看 `git show audit/pre-governance-20261009:frontend/src/mc/props/debateProps.ts`，需要时仅恢复该声明或反向应用本次对应 diff；不重置整个工作区。

## 历史截图清理证据等级更正

统一边界见 [STANDARDS.md](../STANDARDS.md#废弃与文档)，证据等级与遗留对象分类分别记录：

- **已证明完全重复**：下面三张 r3 副本与保留 r2 图 SHA256、文件字节和解码像素均相同，无独立运行用途；引用映射已处理、有恢复版本，属于授权内去重。
- **信息高度重叠**：第三轮五张 r7 中画质图与高画质替代不等价。差异数据只描述相似程度，不证明没有参考价值；判断必须结合实验状态、实际用途、替代资料和用户授权。原清单将五张也记为“C 已证实废弃”、总表声称“仅去除字节级重复”不准确，本轮修正。
- **未确认视觉参考或方案**：不得根据“旧版”“效果一般”“已有新版”删除；Agent 审美和可恢复 Git 记录都不构成授权。

本轮仅复核这五项的现有记录、引用、保留高画质替代及恢复版本，没有发现它们仍承担唯一方案、运行用途或不可替代的比较职责；这不等于证明差异没有信息。用户明确本次不要求恢复，除非发现不可替代职责，因此维持历史删除状态，不再清理其他图片。此次决定与先前整理请求均不构成未来自动删除授权。

## 后续复核：历史截图去重

清理前工作区干净，基线为治理提交 `2618d79`，恢复分支 `audit/pre-artifact-cleanup-20261009` 指向它。对文档、public 和产品截图中的 870 张追踪图片比对 SHA256，再比对 183 张前端文档 PNG 的解码像素，历史截图中只有以下三组精确重复。没有通过视觉相似或“旧轮次”认定冗余。

| 删除文件（均在 frontend/docs/archive/art/sample/） | 保留的逐字节相同原图 | 字节数 |
|---|---|---|
| `r3-lab-chairs-34.png` | [r2-lab-chairs-34.png](../frontend/docs/archive/art/sample/r2-lab-chairs-34.png) | 100,761 |
| `r3-lab-expr-rt-b.png` | [r2-lab-expr-rt-b.png](../frontend/docs/archive/art/sample/r2-lab-expr-rt-b.png) | 487,482 |
| `r3-lab-poses.png` | [r2-lab-poses.png](../frontend/docs/archive/art/sample/r2-lab-poses.png) | 130,494 |

- 过去用途：r3 实验台的椅子、表情和姿态截图。当前 r2 保留文件包含同样的全部图像信息，r3 比较拼图也保留。
- 引用：历史记录仅按 `r3-lab-*` 前缀描述这轮图片，无三个文件的独立运行调用；已在 r3 段落补明确映射和有效链接，避免看图者寻找已删除副本。
- 动态、构建与测试：追踪源码、脚本、服务未加载这些图片或枚举该目录；Vite 输入为 index/stage-lab，public 才复制到构建。抓图脚本输出到忽略的 `.shots/`，不消费这些文档截图。
- 影响与依据：每个删除文件与保留文件字节及解码像素完全相等，唯一历史信息未丢失；源码、public、人物、配置和其他图不改。不是删除实验方案，也不是视觉认可。
- 恢复：先检查目标路径和后续用户修改，再按路径从 `audit/pre-artifact-cleanup-20261009` 恢复；完整文件 SHA256 记录在清单。无需 reset、历史改写或整目录恢复。
- 空间：工作树减少约 0.69 MiB；旧路径仍可从 Git 历史恢复，本次不减少 Git 对象库体积。

去重后验证：根目录 `npm run build`（前端类型/页面与 Node 打包）通过，`npm test` 16/16 通过；31 篇文档的 123 个本地 Markdown 链接有效；1155 个保留清单对象存在，三个删除项的恢复字节与原图相同。变更范围仅四篇文档和三个截图删除，没有源码或 public 变更。此次不重复宣称视觉验收或修复上文之外的既存问题。

本次也纠正上一轮报告的事实错误：`rebuild/baseline/` 的 6 个非图片文件实际为 `*-metrics.json`，不是 HTML 比较产物。历史资料目录没有追踪的 HTML 文件；这六份机位/画面指标继续保留。

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

以下数字来自最初基线 Git 追踪清单，不包括 `.verify/`、`.shots/`、工作目录外用户图片/录屏或本次临时截图。后续累计删除八张文档截图；产品资产和许可证未变。历史图已归档，以下路径为现址。

| 组 | 数量 / 基线体积 | 决定 |
|---|---|---|
| `docs/screens/` 产品图 | 4 张，约 3.23 MiB | README 引用，A 保留 |
| `frontend/docs/archive/art/baseline/` | 24 张 | D 必要人物/家具对照，保留 |
| `frontend/docs/archive/rebuild/baseline/` | 12 张 | D 旧房间对照，保留 |
| `frontend/docs/archive/art/sample/` | 原 67 张，现 64 张 | 保留独有轮次/比较，三个完全重复副本 C 已删 |
| `frontend/docs/archive/rebuild/roundtable-v2/` | 原 86 张，现 81 张 | 独有方案/关键对照保留；精简 5 张中画质额外细节采样 |
| `frontend/docs/archive/rebuild/baseline/*-metrics.json` | 6 份 JSON | D 机位/画面指标，不是 HTML，保留 |
| 上述 art/rebuild 图片合计 | 原 189 张、105,811,830 字节；现 181 张、102,444,917 字节（约 97.70 MiB） | 去重 3 张完全等价副本，另按参考用途删除 5 张高度重叠但非等价采样；保留其他历史图 |
| `frontend/public/mc/` | 785 个追踪文件，模型 JSON/图集/字体/音效/贴图/预览/许可 | 正式依赖与比较候选逐组登记，全部保留 |
| `mc/textures/` 原版散图/元数据 | 539 个，307,068 字节 | 部分被动态 URL 直接加载，余者是否可精简未证明，D 保留 |
| `mc/style/` 与 `mc/hd/` | 143 / 12 个，约 1.07 / 1.78 MiB | 比较包与单图候选保留；Faithful LICENSE/CREDITS 保留 |
| `frontend/mc-packs/` | Better Leaves zip + README，约 1.89 MiB | 导入器按目录枚举，A；MIT 全文与来源仍在 THIRD-PARTY |
| GLB/GLTF 模型 | 0 个追踪文件 | 当前不依赖旧普通 3D 模型路径 |

未把外部提供/确认的参考图搬入 Git，也没有从仓库外截图推断删除价值。音频 CREDITS、Better Leaves 声明和 Faithful 许可全文都保留。

## 待决项与残留

- 剩余 181 张历史/实验图及六份指标 JSON：独有内容仍需确认未决方案、对照价值、文档引用和恢复点，当前继续保留。精简依据限于明确用途与保留证据，不按年代或审美否定全部旧图。
- 五个缺失 v2 房间、新椅子/地面对其他房间的迁移：曾是待决项；后续用户明确退役其他 3D 房间，这些迁移已不属于当前任务，不继续开发。
- 旧 3D 物件：后续按用户明确的场景退役授权处理，见下方收敛记录。Node talk/debate 分支仍有兼容/钩子/测试作用，保留；场景退役不改变讨论业务。
- 原版散图及候选材质单图：可以将生成输出与运行资产进一步区分，但需静态 URL、动态索引、实验与重生成验证；当前证据不足以删除。
- `scripts/legacy.mjs`、sim 与游戏导入/HD 重生成：涉及旧检出、私人配置、真实服务或本机游戏包，本次未执行，不能报告运行通过。
- 既存 Vite chunk >500 kB 警告、未来 native config loader 的扩展名提示、7 个娱乐人物的头像为空提醒仍存在；当前构建和人物 fallback 有效。未扩展为性能或美术改造。
- `mc-lab` 无显式 material 时选择框写 style，而实际房间可能指定 original；运行素材应查看 Room/加载器/署名。本轮记录此实验页标签歧义，不调整视觉或默认材质。
- 上一轮已复现的自由镜头缺陷：辩论室默认机位 `[11,10,30]` 位于 `bounds` 外但在 `flight` 内，相机物理错误使用 bounds；原测试未接真实 RoomPhysics。复现证据保留在下方收尾记录；随后辩论 3D 场景按用户要求退役，共享边界修复保留，并以当前唯一圆桌的真实物理和浏览器验证交付。
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
| 文档与清单 | 第一轮：31 篇当前/变更文档的 116 个本地 Markdown 链接有效，所写 npm 脚本存在，33 人生成说明无 undefined / NaN，重新生成后 SHA256 完全一致；1158 个基线对象均存在。去重后的当前路径和恢复证据另行核验 |
| Git diff | 第一轮 `git diff --check` 通过；本次明确路径暂存并审阅，只包含文档与三张历史截图删除；无私人配置、浏览器资料、日志或构建输出，依赖及 lockfile 未改 |

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

## 结构与素材用途整理（第三轮）

基线 `edaa191`，恢复分支 `audit/pre-docs-layout-20261009`。用户要求判断失去参考用途的素材，并改善混乱的目录及 README。

- README 将项目能力和启动放在前面，四张产品图折叠在末尾；长工作调度说明回到已有模块 README。命令统一从根目录执行，明确 Python、实验页、发布与工作产物的边界。
- 当前生成说明移到 `frontend/docs/character-looks.md`，生成器和注释引用同步；旧交接、样板记录及图片共 201 个文件放进 `frontend/docs/archive/`。新增项目/归档索引，并修正移动文档的有效链接。
- 产品素材和截图有运行或说明用途；旧版基线及独有轮次有对照用途；wip-r0 已无当前设计依据用途，但能追溯旧头发/脚踏等问题，所以归档保留。没有把“当前不用”推断为“历史上毫无价值”。
- 本轮清理五张中画质额外细节采样，同机位高画质图仍保留；中/高成对的 overview、fixed、hud、fire、seated 也保留。这是当时对相同样板/机位参考用途、保留实验记录和替代资料的维护取舍；以下差异数据不证明没有信息价值，也不证明内容或硬件画质等价。当前证据分级及用户不要求恢复的条件见上方更正，不能把相似度当作自动删除标准。

| 删除文件（原 frontend/docs/rebuild/roundtable-v2/） | 保留替代（现 archive/rebuild/roundtable-v2/） | 字节 | RGB 平均绝对差 /255 | 最大通道差 >16 的像素 |
|---|---|---|---|---|
| `r7-medium-board.png` | [r7-board.png](../frontend/docs/archive/rebuild/roundtable-v2/r7-board.png) | 427,614 | 1.147 | 1.574% |
| `r7-medium-lake.png` | [r7-lake.png](../frontend/docs/archive/rebuild/roundtable-v2/r7-lake.png) | 345,516 | 0.728 | 0.247% |
| `r7-medium-roof.png` | [r7-roof.png](../frontend/docs/archive/rebuild/roundtable-v2/r7-roof.png) | 687,677 | 0.410 | 0.240% |
| `r7-medium-tea.png` | [r7-tea.png](../frontend/docs/archive/rebuild/roundtable-v2/r7-tea.png) | 372,946 | 0.951 | 0.852% |
| `r7-medium-west.png` | [r7-west.png](../frontend/docs/archive/rebuild/roundtable-v2/r7-west.png) | 814,423 | 1.231 | 1.103% |

过去用途为 swiftshader 下同机位中画质采样；没有独立运行/构建/测试调用，只有样板记录以文件前缀描述，已补当前保留集说明。五张额外采样未作为唯一方案、用户原图或唯一差异证据；更明显的 fire（5.751%）、seated（3.087%）变化仍保留。保留的成对采样及原统计用于说明软件验证边界，不能据此替代真实 GPU 测试。

本轮减少工作树 2,648,176 字节（约 2.53 MiB）。逐文件原路径、现址、替代与 SHA256 见清单，删除图仍能从恢复分支按原路径读取。未打开或编辑原 `.shots/`、`.verify/` 和私人配置；运行代码仅更新五处文档注释，其他运行资源、2D、人物及默认版本不改。

第三轮验证：根目录完整构建和 16/16 回归通过；55 篇 Markdown 的 175 个本地文件链接/章节锚点有效，修复了一处旧手册失效锚点；202 个迁移路径、1150 个保留清单对象存在，八个删除项都有恢复记录与替代。181 张保留图字节不变，六份指标 JSON 数据/规范化文本不变（Windows 工作树与 Git 的换行不同，Git blob 相同）。五个运行源文件去注释转译结果与基线逐字相等；生成说明在新位置重建后 SHA256 一致，生成器没有重建旧目录。Git 内容仅为明确的文档/目录迁移、五张历史图删除及相应注释/生成器调整，不含私人数据或构建输出。

## 最终收尾与自由视角修复（2026-10-09）

本轮基线为 `main` / `434a5da`，与已推送的 `origin/main` 一致、工作区干净；使用本地分支 `fix/governance-spectator-20261009`。用户仅授权规范歧义修正、既有截图证据分级和辩论室自由视角修复；不再开展治理审计、图片清理或视觉设计，不推送。

该段记录本轮开始时的范围及修复前证据。用户随后要求清理其他 3D，仅保留圆桌重建版；分支改名为 `maintenance/roundtable-only-20261009`。最终代码和验证按下方收敛记录为准，不继续辩论室任务。

修复前复现：在 frontend 执行补入真实 `RoomPhysics` 的 `npm run test:mc-spectator`，加载当前 `public/mc/blocks.json` 与 `buildDebateRoom()`。默认相机 `[11,10,30]` 在 `flight` 内，`pointBlocked(origin,.34)=false`，但 `cameraBlocked(origin)=true`，向前移动 0.2 米仍原地不动；新增断言如预期失败。实体检查表明起点不在墙、家具或屋顶中，问题来自行走 bounds 与相机 flight 契约不一致，不能靠跳过碰撞或改默认机位解决。

真实浏览器修复前：隔离配置的 Vite `stage-lab.html?scene=debate-mc`，点击“自由视角”后鼠标已锁定、控制 active；真实 W 按键后仍是 `[11,10,30]`。临时验收资料在仓库外，不提交私人配置或浏览器资料。

## 目录与接手改善

以下是第三轮的目录快照；当前 3D 仅保留圆桌重建实现，见最新收敛记录。

```text
AGENTS.md / STANDARDS.md / VERIFY.md / ARCHITECTURE.md
README.md
docs/
  MAINTENANCE_AUDIT.md / LEGACY_INVENTORY.json
  README.md / screens/             文档导航与产品配图
frontend/
  README.md
  src/components/、data/、engines/  2D/UI/讨论边界
  src/mc/                          当前六场景、共享人物与渲染
    v2/                            圆桌实验，未替换默认
  src/stage-lab/、mc-lab/、avatar-lab/
  server/                          Node 模型代理、会话/工作
  personas/、public/、mc-packs/     有效资料与资源/许可
  scripts/                         回归、生成、抓图与模拟
  docs/README.md                   当前前端入口
    character-looks.md            当前生成配置说明
    archive/README.md             素材用途与历史入口
      handoff/、rebuild/、art/     保留追溯/实验/比较基线
backend/                           共享理性数据与独立 Python 工具
persona-protocol/                  当前人物校验
scripts/legacy.mjs                 未验证的历史比较入口
```

目录未搬动运行资源。接手者现在能从一个短入口找到规范、真实调用图与模块说明；不会把 Python 当网页前置服务、把情感误认为 Node 调度、把样板当默认或把 Q 版人物当仅 Lab；历史文档统一归档并失去当前指令效力，过期状态得到标注；一条 `npm test` 覆盖现有回归且补齐娱乐完整流程。生成造型说明从当前数据得出，避免继续手写旧比例。

恢复时先审阅本次提交与 `audit/pre-governance-20261009` 的对应路径 diff，按对象恢复或反向应用。不要 reset 全仓库，不覆盖后续用户修改；本报告不是未来自动删除授权。

## 圆桌 3D 收敛（用户调整范围）

用户明确要求“只保留圆桌会议那个正在重建的那个版，其他清理掉”，并补充确认“仅清理其他 3D 场景，保留 2D 和四种讨论业务”。这项新授权替代之前保留六个 MC 场景/不得切换 v2 的范围约束，不代表圆桌美术获批。没有恢复或继续开发辩论室 3D，也没有开启新一轮治理、目录重建或美术设计。

实际基线 `434a5da`；本地分支 `maintenance/roundtable-only-20261009`；恢复分支 `audit/pre-roundtable-only-20261009` 指向同一基线。没有推送、强制推送或历史改写。恢复某个退役路径前先检查后续用户修改，再从该基线按路径提取；不能仅恢复构造器而遗漏调用关系，也不能用 reset 覆盖整个工作区。

### 实际变更与删除边界

| 范围 / 文件 | 处理 |
|---|---|
| `AGENTS.md`、`STANDARDS.md`、`VERIFY.md`、`ARCHITECTURE.md` | 移除维护任务的临时美术禁令；保留任务授权、用户视觉决策、未确认样板保护和工程/视觉验收分离。状态定义只在 AGENTS，VERIFY 补验证方法，ARCHITECTURE 描述实际调用；没有循环执行要求 |
| `STANDARDS.md`、本审计、`LEGACY_INVENTORY.json` | 三张完全重复与五张高度重叠但非等价截图分别记录；相似度不证明无信息价值，旧版/审美偏好不能成为未授权删除理由。复核未发现五张图承担不可替代职责，本次不恢复，也不扩大历史截图清理 |
| root / frontend README、前端文档/归档索引 | 当前入口只有圆桌重建样板；明确未完成/未验收，历史多房间方案不再成为当前待办 |
| `types.ts`、`data/scenes.ts`、`rooms/names.ts`、`rooms/scenes.ts`、`McStage3D.tsx`、`stage-lab/main.tsx`、`mc-lab/main.tsx` | 只登记 `roundtable-mc`，三个入口直接使用现有 `v2/roundtable`，移除版本选择及旧版回退；其他种类明确拒绝 |
| `SetupScene.tsx`、`SetupCast.tsx`、`DiscussionView.tsx`、`director.ts`、`sceneDirector.ts`、`hud/Hud.tsx`、`props/inspection.ts`、`props/styledProps.ts` | 移除退役 3D 的模式强制、专用导演、办公室走访、评委行走与专用道具分支；保留圆桌已有事件/动作契约，四种讨论引擎和 2D 流程不改 |
| 新增 `rooms/types.ts`、`props/types.ts`、`props/book.ts`；`blockEntities.ts`、`camera.ts`、`player.ts`、`spectator.ts`、`rooms/validate.ts`、`v2/roundtable/index.ts` | 从退役辩论实现中保留仍被圆桌消费的 Room/道具接口及原书本几何，修正共用导入。圆桌构造器正文只有类型导入路径变化，建筑/家具/人物/光影/材质保持原样 |
| `rooms/physics.ts`、八个 `check-mc-*.mjs`、`mc-shots.mjs` / `mc-shots.cams.json` | 修复共享相机边界，加入真实圆桌物理回归；删除旧场景测试对象，保持保留功能的标准；抓图入口及机位只剩当前圆桌 |
| 25 个旧 3D 专用 TS 文件 + 六张 `public/mc/preview-*.jpg` | 根据用户明确的场景退役授权删除；共 31 文件、944,982 字节。逐路径用途、完整 SHA256、恢复点及完整改动清单见清单的 `roundtableCleanup`，不再保留旧版圆桌/其他房间构造器与专用登记/道具 |

删除的六张预览是退役场景的卡片资源，原引用已移除；不属于此前八张历史截图的证据分级，也没有依据图像相似度或审美判断删除。`public/mc/` 从 785 降为 779 个追踪文件，其余运行资源、贴图/模型/字体/音效、候选材质及许可证保留。181 张历史图、六份指标 JSON、人物实验台和产品 2D 配图继续保留。

### 自由视角根因与可测行为

`bounds` 是角色行走/寻路范围，`flight ?? bounds` 是相机可飞行范围，实体碰撞来自真实方块模型及家具。这三个契约原先在 `cameraBlocked()` 中混用：即使实体没有遮挡，行走范围外的合法飞行起点也被判非法。原测试未接真实物理，没发现这条集成缺陷。默认辩论起点已在上方复现；当前圆桌默认 `[7.7,3.05,14.5]` 位于 bounds 内，没有实体相交，因此不能把辩论默认起点的失效现象套到圆桌。圆桌受影响的是 bounds 外、flight 内的飞行区域，例如 `[25,3,22]`。

共享修复只让 `cameraBlocked()` 使用 `flight ?? bounds`，仍经 `pointBlocked()` 检查真实实体；取消按 `chair` 名称豁免坐垫/椅背。`moveCamera()` 原有分步扫掠及沿空闲轴滑动保留。未放大 bounds、改默认镜头、删墙/家具或禁用碰撞；角色 `canOccupy()` / 寻路仍用 bounds。

| 可测对象 | 修复前 / 修复后 |
|---|---|
| 当前圆桌默认起点 | 修复前后均合法，保持默认位置/方向和正常移动；修复后 `entityBlocked=false`、`cameraBlocked=false`，向前 0.2 米探测有效 |
| 圆桌 flight 内、bounds 外 `[25,3,22]` | 没有实体相交；旧边界判断拒绝且移动为零，修复后相机合法，向前 0.2 米有效；相同外围区域依然禁止角色行走 |
| 当前浏览器 W，200 毫秒实际控制帧 | 从 `[7.7,3.05,14.5]` 到 `[8.2174,2.9713,13.8176]`，符合默认朝向；S 返回起点 |
| A/D、升降、Shift | A/D 分别产生正确左右位移并往返；升降 ±0.86 米；Shift 同帧前移总距离 2.58 米，普通 W 0.86 米 |
| 实体与边界 | 真实木柱、格窗、屋顶、桌碰撞箱、椅垫及椅背挡镜头；flight 六面/角点不越界，可贴边滑动和退回；行走范围外的角色不能占用或寻路 |
| 退出与输入 | 原生鼠标锁定并改变朝向；松键停止；Esc 退出、解锁，并恢复默认坐标及朝向。输入框焦点/失焦、无锁拖动、滚轮、俯仰限制及卸载由控制器回归覆盖 |

新增的真实物理集成测试加载当前 `public/mc/blocks.json`，构造实际圆桌 `RoomPhysics`，使用真实 SpectatorCamera / StageCamera。DOM 输入桩只模拟事件环境，不替代物理。覆盖默认进入、WASD、升降/加速/斜向等速、松键、六个飞行边界/角点、碰撞与滑动、退出/恢复、行走限制、绕桌路径、鼠标/焦点和监听释放。

回归补齐过程中没有修改生产业务来迁就测试：默认机位左侧确有木柱，完整速度用开阔合法 flight 区域测，默认机位短移和木柱阻挡分别测；暂停恢复用既有首帧冻结、下一帧推进契约断言，不要求恢复事件同帧跳时钟。初次舞台夹具断言失败后按该可测契约修正，最终仍严格检查状态与时间增量。

### 最终验证与限制

| 验证 | 结果 |
|---|---|
| 根目录 `npm test` | 16/16 通过；含唯一圆桌及退役种类拒绝、真实 RoomPhysics/自由视角、舞台消息/暂停/停止/失败、33 人 MC 映射、像素人物及四种讨论业务；工作流程核对 175 个事件 |
| 根目录 `npm run build` | 通过：严格 TypeScript、Vite app/stagePreview 与 Node API 全部打包；六张旧预览在最终 public/dist 中不再存在 |
| `node --check frontend/scripts/mc-shots.mjs` | 通过；没有执行会访问原 `.shots/` 或本机游戏素材的生成/抓图脚本 |
| 当前圆桌真实浏览器 | stage-lab、mc-lab 都加载 roundtable / 1770 方块 / 8 人 / 现有话题板，选择器只含圆桌；真实进入、人物/发言入口及返回检查；无房间加载错误 |
| 原生持续输入 | Chrome headless / SwiftShader / 1480×1000 / 隔离配置，选择低画质保证观测；实际组件接入真实 RoomPhysics。22 个输入均 `isTrusted=true`；鼠标锁定、WASD、Space/Ctrl、Shift、松键、鼠标相对转向及 Esc 恢复通过，异常记录为空 |
| 2D / 业务保护 | 六个原场景数据逐字一致；1,127 个受保护文件无差异，其中 986 个 public/历史资料对象核对 Git blob 字节（文本只规范 CRLF）。工作台仍显示六个 2D 卡片和四模式，仅一个未完成 3D 卡片；六张 2D 背景均返回 200，辩论选人正反方规则和实际 2D 讨论页正常 |
| 文档、清单与 Git | 76 个明确路径：42 修改、31 删除、3 新增；55 篇 Markdown 的 177 个本地文件链接/章节锚点有效；1,119 个保留清单对象存在，八张历史截图和 31 个本轮删除项的恢复 SHA256 全部一致；diff check 通过。无私人配置、浏览器数据、临时截图、日志、构建输出、新依赖或 lockfile 变更 |

早期浏览器自动化在低帧率软件渲染下过早读取旧 dataset，将尚未更新的帧误判为未进入；后续记录表明场景时钟只推进 100–150 毫秒，页面有焦点、可见且没有异常。改为等待实际帧及状态更新，并在独立测试浏览器选低画质后，上述原生交互全部通过；没有改控制器、碰撞或产品渲染实现来绕过验证。MCP 浏览器还独立验证了现有画质下的渲染、W 输入与 Esc。

临时日志、截图、输入轨迹及浏览器资料均在仓库外 `muti-agent-final-20261009` 系统临时目录；隔离 envDir/固定模型没有读取私人配置或访问真实模型供应商。软件渲染帧率低，不能据此证明硬件 GPU 性能、完整动画各瞬间或音频听感；未对真实服务商质量作声明。既存大于 500 kB 的构建 chunk 警告、七个娱乐人物头像 fallback 提示和主页面 `/favicon.ico` 404 仍保留，未出现新的房间/脚本错误；本次不扩展为性能或美术改造。

本次超出最初三个问题的唯一变更是用户随后明确授权的 3D 场景退役；没有修改 2D 视觉或讨论业务，没有新增插件/依赖，没有重构人物模型或场景渲染架构。圆桌仍未完成，未宣布视觉实现完成或用户视觉验收通过。交付后停止治理扩展，等待下一阶段任务。

## 园林茶叙第一轮（2026-10-09）

上文整节是替换前的测量，不要改写。分支 `art/garden-roundtable-r1` 的基线和恢复点都是 `6d45dc3`（本地分支 `audit/pre-garden-r1-20261009`）。这一轮用园林茶叙榭换掉湖畔议事厅，删除 `frontend/src/mc/v2/roundtable/hall.ts` 和 `frontend/src/mc/v2/landscape.ts`。

因此上面的默认机位 `[7.7, 3.05, 14.5]`、1770 方块，以及“当前圆桌”的浏览器记录，指的都是旧湖畔议事厅，不是茶叙榭。茶叙榭的机位、边界、光线和验证写在 [ROUNDTABLE_GARDEN.md](design/ROUNDTABLE_GARDEN.md)。视觉仍未验收。

## 园林茶叙第二轮（2026-10-10）

按用户 2026-10-10 的第二轮要求，把“湖上孤立的榭 + 远处背景岸”改成围合的园林水面（北岸假山与方亭、两层楼、沿墙游廊、园墙月洞门、西水口拱桥与河道借景）。没有删除文件；新增 `terrain.ts`、`garden.ts`、`shore.ts`、`water.ts`、`mesh.ts`。共用部分只改了三处：`mc/light.ts` 的光照网格范围随方块向负方向扩展（旧房间的方块都在 −1 以上，结果不变）、`mc/style.ts` 的 `Look` 加可选的 `shadowArea` / `bloom`（不设时行为和以前一样）、`McStage3D.tsx::applyLook` 读这两项。恢复点仍是 `6d45dc3`；两轮改动一起提交在 `art/garden-roundtable-r1`。详细记录见 [ROUNDTABLE_GARDEN.md](design/ROUNDTABLE_GARDEN.md)。
