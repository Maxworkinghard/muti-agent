# 我的世界 3D 场景功能契约（重建用）

> 历史快照（2026-10-09 已标记）：正文只记录当时状态、计划与判断，不作为当前执行指令。当前入口/架构见根目录 [ARCHITECTURE.md](../../../../ARCHITECTURE.md)，工程与视觉验收见 [VERIFY.md](../../../../VERIFY.md)，资料状态见 [文档索引](../../README.md)。历史“通过/可接受”、分支和待办不自动构成当前事实或用户确认。

> 依据：`mc-rebuild` 分支基线 `baseline/pre-mc-rebuild`（11c0c65）的代码事实。只记录新实现必须满足的接口和语义，不记录旧版视觉。
> 新实现（`src/mc/v2/`）产出的 `Room` 必须满足本文全部条款，才能被 `McStage3D` 直接使用。

## 1. 调用链（谁读 Room）

| 环节 | 文件 / 函数 | 读取 Room 的内容 |
| --- | --- | --- |
| 建房间 | `mc/rooms/scenes.ts` `buildMcRoom(kind)` → `design/plans.ts` `planFor(kind).build()`；v2：`mc/v2/registry.ts` `buildMcRoomV2(kind)` | — |
| 舞台 | `components/McStage3D.tsx` `McStage3D(props)`，`props.sceneKind` 选场景，`props.version===2` 选 v2（没有 v2 实现的场景退回旧版） | 几乎全部字段，见第 7 节 |
| 检查 | `mc/rooms/validate.ts` `validateRoom(room, assets)`：**有任何 error，舞台直接报错不渲染** | 见第 6 节 |
| 导演 | 辩论：`mc/director.ts` `createDirector`/`step`；其余五个：`mc/sceneDirector.ts` `createSceneDirector`/`stepScene` | anchors、seatedSpeech、standingSeats、work、layout.tables（office）、layout.podium、judge、kind |
| 道具 | 辩论：`props/debateProps.ts` `createDebateProps`；其余：`props/styledProps.ts` `createStyledProps` | layout.chairs/board、decorate、makeChair、makeTable、boardStyle/boardFrame/boardYaw/decorateBoard/drawBoard、floor/floorArt、animate、water 方块、waterColor、title、kind |
| 人物 | `mc/player.ts` `createPlayer(p, card, contacts)`、`player.update(actor, s, room, light)` | anchors（indexOf 定空闲动作）、anchor.homeYaw、anchor.mic |
| 物理 | `mc/rooms/physics.ts` `RoomPhysics`：方块模型碰撞箱 + `propBoxes(room)` + 每把椅子的座垫/靠背 | blocks、cutaway、ceiling、layout、bounds |
| 镜头 | `mc/camera.ts` `StageCamera`、`mc/spectator.ts`、`props/inspection.ts` | camera、cameraTarget、fov、fit、frontal、cutaway、judge、judgeTarget、flight、bounds、layout.board |
| 界面 | `mc/hud/Hud.tsx` `Hud`、`identity()` | 只用 `kind`（身份文字、颜色） |

## 2. 六个场景的人数与座位

`Participant.seatIndex` 直接索引 `room.anchors[seatIndex]`（越界时 `createDirector` 退回 `anchors[6]`）。人数上限来自 `data/scenes.ts` 的 `maxSeats`，anchors 数量必须 ≥ maxSeats。

| kind | anchors | 座位语义 | 导演相关字段 | 其他硬性依赖 |
| --- | --- | --- | --- | --- |
| roundtable 圆桌 | 8 | 全部坐着；`seatedSpeech:true`（坐着发言） | — | 1 张 `shape:'round'` 的桌子；8 把椅子 `actor=0..7`；人物手里有书（card） |
| debate 辩论 | 7 | 0–2 正方、3–5 反方（坐）、6 主持（站，`seat===stand`） | 辩论导演用 `layout.podium`（讲台/铃的看点）、`layout.desk`（6 个，含 `mic` 桌面点）、`layout.phaseLamps`（3 盏）、`banners`（2 面） | `side` 来自 participant；`validateRoom` 对辩论做左右镜像检查 |
| office 办公室 | 13 | 坐；`seatedSpeech:true` | `work:{visits[13], meeting[6], huddle{center,rx,rz}, overflow}`；`stepScene` 用 `layout.tables` 里 **id 为 `meeting-table`** 的桌子求朝向 | 走动寻路（`RoomPhysics.path`） |
| classroom 教室 | 8 | 0 号讲台站立（`standingSeats:[0]`，`seat===stand`，无椅子）；其余坐 | `seatedSpeech:false`：学生发言时起立、说完坐下；站位发言时触发 `flipScript` | `propBoxes` 对 classroom 加讲台碰撞箱 |
| meadow 草地 | 8 | 坐（矮凳，`style:'stool'`）；`seatedSpeech:true` | — | 露天 `outdoor:true`；人物无书（card=null）；`water` 方块由 styledProps 画水面（额外加载 `block/water_still.png`） |
| podcast 播客 | 2 | 0 主持、1 嘉宾，都坐；`seatedSpeech:true` | — | 人物无书；话题板细节文字“主持 · 嘉宾” |

## 3. ActorAnchor 语义（`mc/rooms/debate.ts`）

`{seat, stand, homeYaw, mic, chair?}`，单位米，1 格 = 1 米。

- `seat`：坐下时的身体基准点。现有房间都是 `[x, 地面+0.5, z]`；坐姿的根在脚底往上 0.578。`createDirector` 用它做初始位置。
- `stand`：站起来时脚底的位置 `[x, 地面, z]`。起身/坐下动画在 `seat`↔`stand` 之间插值（导演 `standUp`/`sitDown` 让 y 变化 0.5）。
- `homeYaw`：面朝方向，弧度，**0 朝 +z**，按 `atan2(dx, dz)` 计算。空闲时人物回到这个朝向。
- `mic`：发言状态键。发言时 `DirectorState.mics[mic]=true`，道具层可按它点亮话筒；`contacts.mics.get(mic)` 是手要去够的物件（新画风为空）。
- `chair`：对应 `layout.chairs[].id`。椅子 `actor` 字段 = anchor 序号，起身时椅子沿身后方向滑开 `slide*(1-sit)` 米。站立座位不设 chair。

## 4. 话题板 `layout.board` 与相关字段

- `layout.board = {position:[x,y,z] 中心, width, height}`。板面朝 **+z**（可用 `boardYaw` 转，但下面三处只按 +z 计算，建议保持 0）：
  - `validateRoom`：板的四角（内缩 0.05，z+0.04）必须从 `room.camera` 看得到；
  - `McStage3D` 全景视角：按板的 x/y 范围给名字牌留出 keepOut 区，名字牌不压在板上；
  - `inspection.ts` 近景：相机放在板中心 +z 方向 `width*1.15` 处。
- 文字内容由 `createStyledProps` 每帧检查后重画：`theme`（话题）、`phase`（“第 n 轮 · 标签”/“等待开场”）、`detail`（在座名字；办公室为最近任务；播客为主持/嘉宾）、`finished`。
- 画法：`boardStyle`（cork/whiteboard/chalk/sign/onair/frame，在 `props/boards.ts`），边框 `boardFrame`（颜色或 `block/xxx`），`decorateBoard(k, sign)` 可在板上加装饰。
- **v2 新增（可选、向后兼容）**：`room.drawBoard?(ctx, W, H, info)`，设了就用房间自己的画法，不设仍走 `drawBoard(boardStyle, …)`。

## 5. 相机与空间字段

| 字段 | 含义 / 谁用 |
| --- | --- |
| `camera`、`cameraTarget` | 全景机位和看点（StageCamera overview）。没有 `cutaway` 时 `validateRoom` 要求机位在 `bounds` 内（各边留 0.18 米） |
| `fov` | 全景的基础竖直视角（度），缺省 48；StageCamera 会按 `fit` 再放宽，上限 88 |
| `fit` | 全景必须水平装下的点（人头、板角等） |
| `frontal` | 有 `cutaway` 时决定是否用房间给的看点而不是自动上下居中 |
| `cutaway`、`ceiling` | 剖面俯视时隐藏的墙和天花板方块；有 `cutaway` 时视线检查忽略它们、机位可在屋外。新画风下这两组方块不投影 |
| `judge`、`judgeTarget` | “观摩位”视角（Hud 第二个按钮），也是人物 `look:'camera'` 时的看点 |
| `flight` | 自由视角能飞的范围，不设用 `bounds` |
| `bounds {min,max}` | 室内净空间：寻路网格、自由视角、太阳阴影范围（按尺寸 ×0.75+3）、环境反射立方体相机（中心、高 2.8）、天空中心 |
| `host` | 主持点（现有代码只在辩论里有意义） |
| `layout.podium` | 讲台位置；辩论导演的看点，辩论/教室的碰撞箱 |

## 6. `validateRoom` 检查项（全部必须为 0 错误）

1. 方块状态合法、每个面的贴图在当前图集里（`states`）。
2. 依托（`supports`）：悬挂灯笼上方要有整块/链/栅栏/原木；链上方要有方块；地毯、蜡烛、钟下方要有方块；杜鹃要在苔藓/泥土/草上；墙上旗帜背后要有整块；门上下两半要配对。
3. 栅栏、玻璃板的连接属性与邻居一致（`connections`，用 `Builder.connect()` 生成即可）。
4. 道具碰撞箱（`props`）：桌子（圆桌按 4 条转开 45° 的长条近似）、辩论/教室讲台；`layout.desk[].mic` 必须正好贴在所属桌面上（误差 ≤1 厘米）。
5. 人物位置（`positions`）：身体按 0.8×0.4 米、随 homeYaw 旋转；坐姿高 0.12–1.25、站姿 0.08–1.87。每个 anchor 的 seat、stand 以及 seat→stand 的 11 个插值点，都不能碰到方块模型碰撞箱（地毯除外）或道具碰撞箱。
6. 镜像（`mirror`）：只对辩论检查左右对称。
7. 镜头（`camera`）：从 `room.camera` 到每个人头（坐：seat.y+1.15；站：stand.y+1.62）和板四角的视线，不能被方块或道具碰撞箱挡住。
8. 光照（`light`）：每个 seat、stand 上方 1 米处，游戏光照网格（方块光或天光）≥ 9。光照网格范围是 x、z ≥ -1，y ≥ 0；y<0 的方块不进网格。

## 7. McStage3D / Hud 还读的东西

- `look`（光线：天空/地面半球光、太阳方位/仰角/强度/阴影、曝光、间接光强度、`outdoor`、`roof`、`haze`、`fog`、`skyTop`、`saturation`）。设了 look 就用中性色调映射和 styled 后期。
- `paint`（贴图名 → 16×16 像素画法，加载时画进图集）、`material`（original/hd/style；有 paint 时不用 hd）。
- `blocks`（静态方块网格；id 含 `glass` 的在新画风下不投影）、`lights`（每项一个 PointLight：位置、强度、距离、`shadow`、`color`）、`windows`（无 look 时画假光柱）、`banners`（blockEntities 画旗）、`floor` + `floorArt`、`outdoor`、`title`（画布 aria、出错提示、板标题）。
- 道具钩子：`decorate(k, root)`（静态物件，会被合并）、`makeChair(k, chair)`（会滑动的椅子）、`makeTable`、`decorateBoard`、`animate(now)`（每帧）。
- `kind` 分支：辩论用辩论导演/道具/自由行走/小动物；`podcast`、`meadow` 人物不拿书；`meadow` 额外加载水面贴图。
- 开发钩子：`window.__mcStage = {scene, renderer, post, env, camera, stageCamera, players, props, room, assets}`，`scripts/mc-shots.mjs` 依赖它。
- Hud：`identity()`、`showRole()`、`roleColor()` 只按 `kind` 出文字和颜色（圆桌：成员 n，名字牌不标身份）。

## 8. 物理与行走的隐含约定

- `RoomPhysics.path()` 在 `bounds` 内 0.5 米网格上找路，**路径点 y 固定为 1**，身体碰撞带 y 1.1–2.85 —— 行走地面必须在 **y=1**（地板方块在 y=0）。目前只有办公室走动，但新实现统一遵守。
- 椅子碰撞：座垫 0.46×0.18×0.46（中心离地 0.5）、靠背（非 stool）在身后 0.21 米处。

## 9. 现有测试与本契约的关系

- `test:mc-room`（辩论）、`test:mc-physics`（辩论墙体探针）、`test:mc-design`（SCENE_PLANS）、`test:mc-scenes`/`test:mc-look`/`test:mc-stage`/`test:mc-spectator`：都针对旧版房间。v2 不注册进 `SCENE_PLANS`，旧版仍是默认，这些测试不受影响。
- v2 自己的检查：`npm run test:mc-v2`（`scripts/check-mc-v2.mjs`）——跑 `validateRoom`、核对本契约第 2 节的人数与字段，并确认 v2 用到的每一张方块贴图都由 v2 自己重画（不显示原版贴图像素）。

## 10. v2 开关

- 组件：`<McStage3D version={2} …/>`；`buildMcRoomV2(kind)` 返回 `null` 的场景自动退回旧版。
- 页面：`mc-lab.html?scene=roundtable&v=2`、`stage-lab.html?scene=roundtable-mc&v=2`；不带 `v` 时一切照旧。
- 截图：`node scripts/mc-shots.mjs shoot <标签> roundtable --v=2 --port=5173 [--quality=high|medium]`。
