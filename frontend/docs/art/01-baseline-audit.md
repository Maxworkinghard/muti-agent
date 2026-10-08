# 人物、椅子、地板：阶段一审查与基线

> 历史快照（2026-10-09 已标记）：正文只记录当时状态、计划与判断，不作为当前执行指令。当前入口/架构见根目录 [ARCHITECTURE.md](../../../ARCHITECTURE.md)，工程与视觉验收见 [VERIFY.md](../../../VERIFY.md)，资料状态见 [文档索引](../README.md)。历史“通过/可接受”、分支和待办不自动构成当前事实或用户确认。

> 只读审查，没有改代码。依据 `mc-rebuild` 分支 8d6420c（2026-10-08）。角色清单见 `00-roster.md`，基线截图见 `baseline/`（拼图 `baseline/contact.jpg`）。

## 1. 人物系统现状

| 项 | 现状 | 代码 |
|---|---|---|
| 模型 | 原版玩家骨架：一个 `SkinnedMesh`。头 8×8×8、身 8×12×4、手臂 4×12×4（宽臂）、腿 4×12×4（单位为皮肤像素，16 像素 = 1 米），外加一层略放大的外套层（头 +0.5、其余 +0.25）。整体缩放 0.9375，站高约 1.875 米，头宽约 0.47 米 | `mc/player.ts` `createPlayer`、`cuboid` |
| 骨架 | 8 根骨：0 脚底、1 髋、2 上半身、3 头、4 右臂、5 左臂、6 右腿、7 左腿。没有手肘、膝盖、手指、脸部骨骼 | `mc/player.ts` |
| 皮肤 | 运行时用 canvas 程序画 256×256（按 64×64 布局放大 4 倍），不读图片。颜色来自 `persona.visual`：skin、hair、shirt、accent、hairStyle、extras | `mc/skin.ts` `createSkin` |
| 发型 | 全部画在头盒子表面和外套层上，没有立体发型件：`long` 后脑和侧面加发色，`bun` 后脑一个小方块，`cap/hood/beanie` 帽子层，`spiky/curly` 头顶一排短刺（两者一样），`side/middle` 只改刘海 | `mc/skin.ts` |
| 服装 | 只有颜色来自人物文件。款式（开衫、连帽卫衣、毛衣、卷袖衬衫）和裤色由 id 哈希决定；`scarf` 画成围巾色块；辩论正反方和主持多一条队色挂绳胸牌 | `mc/skin.ts` |
| 表情 | 每帧按状态重画 canvas 上的脸，有签名缓存，状态不变不重画：眉（平时 / 怒眉 / 挑眉）、眼（睁 / 眨 / 眯 / 惊讶）、眼神光、腮红、汗滴、眼镜、嘴（说话三帧、咧嘴、笑、惊讶、大笑、撇嘴，以及三种由哈希决定的默认嘴型）。情绪来源：人物 `extras` + 引擎 mind 的 face/mood（火气→怒眉、压力→汗、信心→笑、其余→腮红）+ 舞台临时表情（被打断→惊讶、交锋→挑眉、队友发言→笑） | `mc/skin.ts` `face()`，`mc/player.ts` |
| 动作 | 全部是程序姿态，没有动画片段。坐下 / 站起（`sit` 0↔1，导演给）、走路（walk/walkTo 摆腿摆臂）、说话手势（摊手 / 前送 / 按胸，交锋时指人）、思考（低头写卡片）、抱臂（火气 ≥6）、前倾 / 后靠 / 低头（压力、信心、憋屈）、点头、待机 13 种（`idleMotion.ts`：写字、翻页、敲笔、托腮、抱臂、伸懒腰、换姿、挠头、点头、摇头、后靠、指笔记、看同伴）、欢呼、鼓掌、拍铃 / 按下一轮 / 话筒（手伸向道具，`contactGap` 记录手到道具的距离） | `mc/player.ts`、`mc/idleMotion.ts`、`mc/director.ts`、`mc/sceneDirector.ts` |
| 手持物 | 除了播客和草地，每人右手拿一本书（卡片），左手拿笔；主持不拿 | `McStage3D.tsx` → `createPlayer(p, card)` |
| 外观和角色的对应 | `createSkin(p.agentId, p.persona.visual, p.side)`。正式产品里 `agentId` 就是人物 id（`SetupCast.tsx`），所以同一个角色在任何场景、任何一场的样子都一样，**没有随机成分**；唯一随场景变的是辩论的队色胸牌，以及播客、草地里手上没有书。`stage-lab` 预览用的是 `preview-n` 占位人物 | `components/SetupCast.tsx`、`mc/skin.ts` |
| 坐姿和椅子的耦合 | 座位锚点 `seat.y = 1.5`（地面 y=1 再往上 0.5），坐下时根节点下沉 `sit×0.578`，大腿下沿大约在离地 0.51 米处。这个高度写死在 `player.ts`，和椅子模型**没有共用常量**；各椅子座面高度各自写（见第 2 节）。物理碰撞的座垫箱是固定的 0.46×0.18×0.46（中心离地 0.5），也和椅子模型无关 | `mc/player.ts`、`mc/rooms/shared.ts`、`mc/rooms/physics.ts`、`mc/design/scale.ts` |
| 其他用到骨架的地方 | 自由视角里的「你」用同样的 `cuboid` 和原版 steve 皮肤（`freeView.ts`）；小动物也借 `cuboid`（`critters.ts`） | |

**和 2D 的关系：** 2D 不用 `player.ts` / `skin.ts`。二维像素小人在 `components/pixelAvatarDraw.ts` + `PixelAvatar.tsx`，图鉴、选人页、二维讨论室都用它。两边**唯一共用的是数据** `persona.visual`（以及 `personas.ts` 补默认值的逻辑）。所以：改 `mc/` 下的代码不会影响 2D；改人物 JSON 里的 `visual` 或 `personas.ts` 的默认值会同时改掉 2D。

## 2. 椅子现状（六个场景）

座面高度 = 坐垫顶面离地（米），按代码里的盒子尺寸算出。人坐下时大腿下沿约 0.51。

| 场景 | 椅子 | 生成位置 | 和锚点的绑定 | 座面高 |
|---|---|---|---|---|
| 圆桌 v2 | 白桦木框椅：4 腿、三档横档靠背、布垫 + 小靠垫，布色按座位轮换 `PAL.fabric` | `mc/v2/roundtable/furnish.ts` `chair()`，`index.ts` 里 `makeChair` | `index.ts` 自己建 8 个锚点和 `chair-i`，椅子放在锚点正下方、朝向 homeYaw，`slide .2` | 0.57（比人高约 6 厘米，大腿会陷进坐垫） |
| 辩论室 | 方块扶手椅，羊毛按队色（正方蓝、反方红、评委白），云杉木扶手和腿 | `mc/props/furniture.ts` `blockArmchair`，`rooms/debate.ts` 里 `makeChair` | `debate.ts` 自建 `layout.chairs`（`chair-pro-*`、`chair-con-*`、`chair-judge-0`），`slide .3` | 0.50 |
| 办公室 | 工位：方块办公椅（浅蓝羊毛、黑石五爪脚）；会议区：方块扶手椅（橙色羊毛） | `furniture.ts` `blockOfficeChair` / `blockArmchair`，`rooms/office.ts` | 13 个工位锚点各一把（`slide .18`）；会议区 6 把 `meeting-chair-i`（`slide 0`）给走动去开会用 | 办公椅 0.52，扶手椅 0.50 |
| 教室 | 课椅：羊毛座面和靠背、黑石细框（全体浅蓝）；0 号是讲台站位，没有椅子 | `furniture.ts` `blockSeat`，`rooms/classroom.ts` | `shared.ts` `seat()` | 0.55（大腿会陷进座面约 4 厘米） |
| 草地 | 原木墩（橡木、白桦交替） | `rooms/meadow.ts` 内联 `makeChair` | `seat(..., 'stool')` | 0.48（离大腿约 3 厘米空隙） |
| 播客间 | 平涂圆鼓扶手椅（主持橙、嘉宾蓝） | `furniture.ts` `armchair`，`rooms/podcast.ts` | `seat(..., 'armchair')` | 0.50 |

共同点：椅子全部由各房间的 `makeChair(k, chair)` 生成，`props/styledProps.ts` 统一摆放，并在起身时沿身后方向滑开 `slide×(1-sit)`。旧的金属框会议椅 `props/chair.ts` `createChair` 只在房间没有 `makeChair` 时才用，现在六个场景都设了，所以它没用上。

## 3. 地板现状（六个场景）

方块地面都是 y=0 一层方块，1 格 = 1 米，原版贴图 16×16（`material: 'original'`），所有方块共用一个 `MeshStandardMaterial`（图集贴图、最近邻过滤、roughness 0.86、metalness 0）。

| 场景 | 地面 | 纹理来源 / 尺度 | 铺装方式 |
|---|---|---|---|
| 圆桌 v2 | 石砖门槛 + 深橡木包边 + 白桦 / 橡木两色错缝；会议圈一块八角草席（半径 3.4，深绿包边） | v2 自己重画的方块贴图（`v2/blockTextures.ts`，每格画 4 条木板，16 px/m）；草席是道具，像素贴图 | `v2/roundtable/hall.ts` `floorAt(x,z)` 按格选方块，3 格一段错缝 |
| 辩论室 | 中间赛场 `oxidized_copper`、观众区 `oak_planks`、讲台前一排 `spruce_planks`，上面叠一层画赛场线的地面图 | 原版贴图；地面图 16 px/m（`floorArt`，`floorOverlay`） | `rooms/debate.ts` 按 z 分区整片铺 |
| 办公室 | `oak_planks` 整片 + 一块 5×4 的方块地毯（黄芯白边） | 原版贴图 | `rooms/studio.ts` 外壳 `shell.floor`，地毯在 `office.ts` 里逐格放 |
| 教室 | `birch_planks` 整片 | 原版贴图 | `studio.ts` 外壳 |
| 草地 | `grass_block` + `dirt_path` / `coarse_dirt` 小路 + 黄白格野餐布（地毯方块） | 原版贴图，草色由 `look.tint` 染 | `rooms/meadow.ts` |
| 播客间 | 地面图：平涂木地板（每块板 12 px = 0.75 米宽，接缝错开）+ 蓝底金边地毯 | 外壳方块 `smooth_stone` 被色板重画成平色，上面盖一张 16 px/m 的 canvas 平面 | `rooms/podcast.ts` `floorArt` + `studio.ts` `floors.planks / floors.rug` |

旧版圆桌（不带 `v=2` 时的默认）：`birch_planks` 整片 + 圆地毯（白羊毛染灰绿，半径 2.65）。

## 4. 共用和各场景独立

| | 共用 | 各场景独立 |
|---|---|---|
| 人物 | 全部共用：`player.ts`、`skin.ts`、`idleMotion.ts`、两个导演；外观只由 `persona.visual` + id 决定 | 只有手上拿不拿书（播客、草地不拿）、辩论队色胸牌 |
| 椅子 | 摆放和滑动（`styledProps.ts`）、几个零件函数（`furniture.ts`）、物理碰撞箱 | 用哪个零件、什么布料，由每个房间的 `makeChair` 定；v2 圆桌的椅子完全独立（`v2/roundtable/furnish.ts`） |
| 地板 | 方块网格和共用材质（`blockMesh.ts`）、地面图机制（`floorArt`） | 用哪种方块、怎么铺、要不要地面图和地毯，各房间自己写；v2 用自己的贴图画法 |

## 5. 基线截图

截图在 `baseline/`，Max 上用 `mc-shots.mjs` 同一套流程拍，1440×960，高画质，headless Chrome（swiftshader）。三视图和地板近景是临时加的相机机位，拍完已删除，`scripts/` 没有改动。

- 圆桌 v2（`?v=2`）：`overview` 默认机位、`fixed` 湖上看厅、`hud` 产品画面、`judge` 观摩位、`seated` 坐姿比例、`face` 冷萃脸部近景、`turn-front / turn-side / turn-back` 冷萃（7 号座）坐姿正 / 侧 / 背、`chair` 椅子近景、`floor` 西侧地面（门槛、包边、错缝、草席边）。
- 其余五个场景：`*-overview` 默认机位、`*-chair` 椅子近景；教室另有 `classroom-teacher-side / -front`（讲台上站着的 0 号阿澜，是唯一的站姿全身）。
