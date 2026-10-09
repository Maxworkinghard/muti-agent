# 交接说明：MC 3D 场景美术重建（人物 / 椅子 / 地面）

> 历史快照（2026-10-09 已标记）：正文只记录当时状态、计划与判断，不作为当前执行指令。当前入口/架构见根目录 [ARCHITECTURE.md](../../../../ARCHITECTURE.md)，工程与视觉验收见 [VERIFY.md](../../../../VERIFY.md)，资料状态见 [文档索引](../../README.md)。历史“通过/可接受”、分支和待办不自动构成当前事实或用户确认。

> 写于 2026-10-08 20:05（UTC+8）。用户叫停，Phase 2 停在中途，这份说明是给下一位接手的人的。
> 写的时候 `npx tsc --noEmit` 能通过。

## 1. 目标和用户的硬约束

### 目标
- 这次重建只做 3D 场景里的三样东西：**人物外观（Q 版体素小人）、椅子、地面**。
- 样例先在 **roundtable v2（湖畔议事厅，`?v=2`）** 里做出来，再推广到全部 33 个人物和其他五个旧场景。

### 不能动的东西（用户原话的意思，一直有效）
- 不动 2D 场景、引擎、导演 / 对话的业务逻辑。
  - 3D 人物外观在 Phase 2 得到了授权，可以改；2D 的人物（`PixelAvatar.tsx`、`pixelAvatarDraw.ts`）一律不碰。
- 不改设定文件：persona JSON、`personas.ts`、`rationalPersonas.ts`。
- 建筑（房间、墙、顶）不重做。
- 不读、不改、不提交 `.env*` 和密钥。
- **不要 push。** 不做破坏性的 git 操作：不 `reset --hard`、不 force push、不删分支。
- `.verify/` 里是 Chrome 的用户数据，绝不能提交。
  - 提交时一律写明具体路径，提交前确认暂存区里没有 `.env` 或 `.verify`。
- 不准用整体暖色滤镜、提饱和度、加 Bloom 来代替真正的美术修改。
- 地面不准靠噪点或滤镜遮丑，也不准提高分辨率（固定 16 像素 / 米）。

### 验收方式
- 必须用**真实截图**验收：无头 Chrome 真的渲染出来再看图。不准拿示意图、拼图冒充截图。
- 测试可以合理地调参数，但不准把测试关掉；调了哪个值都要写进报告。
- 每一轮都要先把发现的差距写进 `docs/art/03-sample-log.md`，再动手改。

## 2. 分支和提交

- 分支：本地 `mc-rebuild`。`origin/main` 是 0fcb29d，是 mc-rebuild 的祖先；不要合并，也不要变基。
- 基线 tag：`baseline/pre-mc-rebuild`，指向 11c0c65，也就是重建开始前的快照。

提交顺序：

| 提交 | 内容 |
|---|---|
| 11c0c65 | 基线快照 |
| c05bb61 | 忽略 .verify/，加入旧版基线截图 |
| 3e91cb1 | v2 合同文档、`?v=2` 开关，湖畔议事厅第 1–2 轮 |
| 3c1880c | 第 3–6 轮 |
| 8d6420c | 第 7 轮 |
| e460400 | Phase 1：33 人名册、基线审计、基线截图 |
| （本次） | Phase 2 半成品：WIP 提交，内容见第 4 节 |

## 3. 文档（`frontend/docs/art/`）

| 文件 | 状态 |
|---|---|
| `00-roster.md` | ✅ 33 个人物的名册：设定、性格、特征，Phase 1 写好 |
| `01-baseline-audit.md` | ✅ 旧版的基线审计 |
| `baseline/` | ✅ 旧版的基线截图 |
| `02-character-looks.md` | 历史交接时未写；当前说明已移到 [character-looks.md](../../character-looks.md)，由生成器维护 |
| `03-sample-log.md` | 历史交接时未写；后续已有 r1–r3 差距记录，仅作历史追溯 |
| `sample/wip-r0/` | ⚠️ 开发过程中的实验台截图，不算正式轮次（见第 5 节） |

`02-character-looks.md` 的写法：
- 内容要从 `src/mc/avatar/looks.ts` 生成。每个人有 `basis`（逐字段标 config / inferred）和 `why`（中文理由）。
- 还要列出零件库数量和搭配约束。

`03-sample-log.md` 的写法：
- 每轮把差距写进去，然后再修。

### 参考图
- 参考图没有存进仓库。
- 美术目标以 Phase 2 任务里的文字为准（下面列出），对照的基线是 `docs/art/baseline/`。

**人物**
- 头和身子的比例约 1:1.3–1.5。
- 体素头发要大，分层，要冒出头盒子。
- 眼睛要大、带高光；嘴小；有腮红。
- 衣服要分层：领子、领带、袖口、口袋、花纹，再加下装和鞋。
- 每个人 4–5 种颜色。
- 6 种表情、6 种姿态。
- 人和人的区分要靠轮廓和结构，不能只是换颜色。

**椅子**
- 一个共用家族，座高约 0.50。
- 圆桌用带坐垫的木椅；实验台展示软包扶手椅和办公椅。

**地面**
- 议事厅的木地板要重做：板子大小、错缝、接缝、深浅变化，不能看出重复，要和席子、墙协调。
- 另做两种地面给实验台展示。

## 4. 代码现状

### 已完成：人物模块 `src/mc/avatar/`（还在 8 根骨头的骨架上，Player 接口没变）

| 文件 | 内容 |
|---|---|
| `rig.ts` | 单位 T = 1/48 米 = 1 个贴图像素。<br>头 32×30×28；躯干 18×19×10；腿宽 8，大腿 11 + 小腿 13；手臂 7×18×7。<br>`HEAD_TOP` 是 73T = 1.52 米，头身比约 1:1.43。<br>导出 `SEAT_H` .50、`SIT_DROP` .4167、`EYE_STAND` 1.1875、`EYE_SIT` .771、`HAND_REACH` -.333。 |
| `types.ts` | 零件库：<br>发型 17 种；眼型 6、眉型 6、嘴型 6；表情 6；<br>上衣 7、外套 9、下装 5、鞋 4、配饰 20；<br>花纹 4，脸上标记 4。 |
| `paint.ts`、`mesh.ts` | 每个人一张 256² 的图集，用货架法排布；盒子网格带蒙皮索引。 |
| `hair.ts` | 2T 体素壳 + 刘海轮廓 + 表面起伏 + 附加件（马尾、双马尾、丸子、飞机头、姬发鬓角、呆毛）。<br>刚刚改过：刘海改成一束一束、有发束尖；色调改成按发束取，加了一圈断续的高光环。<br>**这次改动还没渲染验证过。** |
| `face.ts` | 32×30 的脸部贴图：6 种表情 × 3 帧说话口型，加眨眼；`face()` 接口没变。 |
| `resolve.ts` | 9 条搭配约束，例如：<br>戴帽子或兜帽时头顶头发压平；有兜帽就去掉帽子，耳机改成挂脖；<br>双丸子 / 双马尾配耳机时改成挂脖；戴眼镜时刘海上提；围巾和领带互斥；<br>裙子配大衣时去掉衣摆；背带裤把下装改成裤子；有胡子就藏起嘴。 |
| `build.ts` | 把以上全部组装成蒙皮网格，加上两条小腿。 |
| `looks.ts` | **33 个人全部配好了**，都是静态配置，没有随机数，也没有按 id 哈希挑衣服。 |
| `index.ts` | `lookFor`；外加 `lookFromVisual` 作为没有配置时的兜底（不用哈希）。 |

### 已接线
- `skin.ts`（重写）：触发词 / 情绪 → 表情；`FaceExtra` 新增 `'neutral'`。
- `player.ts`：
  - 新增 `createRig` 和 `legPose`（坐下时膝盖弯曲）。
  - 根节点缩放 .9375 → 1。
  - 手卡和笔的位置、眼睛高度、俯身幅度都按新尺寸算。
  - 性格倾向（`tendency`）会影响手势、前倾和歪头。
- `design/scale.ts`：
  - 新增 `seatHeight` 和 `sitDrop`。
  - `eyeStand` / `eyeSit` 改为来自 `rig.ts`。
  - 新增 `chibiTableHeight` .78。
  - `bodyHalfZ` 保持 .2 不变。
- `director.ts`：镜头看人的目标点改用 `SCALE`。
- `props/inspection.ts`：辩论的目标点改为 `seat + eyeSit`（原来是 `stand + 1.15`）。
- `McStage3D.tsx`：名字牌的高度偏移 .45 → .62。

### 测试调整（逐条）
- `rooms/validate.ts`：
  - 身体包围盒改用 `SCALE.bodyHalfX/Z`。
  - 看人的目标点改用 `SCALE.eyeStand` / `eyeSit`。
  - “站着”的判断加了一条：座位高度等于站立高度。这样辩论主持人（第 6 个位置）算站着，目标点 2.19，刚好高过讲台顶 2.18。
  - 风险：Q 版主持人的脸贴近讲台顶，需要在旧场景截图里确认。
- 没有关掉任何测试。

### 测试状态
- 最后一次跑：box 上 `test:mc-room / look / design / scenes / stage / physics / spectator / v2` 全部通过，tsc 也通过。
- 那次之后新加的 `chairs.ts`、`floors.ts`、实验台还没接进任何场景，所以不影响这些测试。
- **还没跑：** `npm run build`、`check-pixel-avatar`（要在 Max 上用 Node 24 跑）、其他五个旧场景的截图。

### 椅子：`src/mc/props/chairs.ts` 半成品（只在实验台里用）

形状由 Q 版尺寸定：
- 座面前沿 ≤ +.14：小腿后侧在 +.146。
- 靠背前面在 -.135：躯干背面 -.104，长发片背面 -.125。
- 脚踏顶面 .30：坐下后鞋底离地约 .31，脚够不着地面。
- 所以座面只有 .28 深，是矮胖的 Q 版椅子。

三种椅子：
- **会议木椅**：前腿往前伸出一截，托着脚踏横档。
- **软包扶手椅**：扶手内侧 ±.345，人物手臂外沿 ±.333；前面带一只小脚凳。
- **办公椅**：脚踏圈半径 .24，T 形扶手。

尚未完成：
- 最后一版的截图看过：空椅子形状对了，坐人的那一排取景太近、头被裁掉。
- 坐姿下脚有没有踩在脚踏上、手臂有没有穿进扶手，**还没确认**。
- 侧视图看起来像是腿被手臂挡住了。
- **还没接进 roundtable v2。** 要改的地方：
  - `v2/roundtable/index.ts` 的 `makeChair` 改用 `woodenChair(v2(k), fabric)`；
  - `RT.tableH` 从 .95 改成 .78；
  - `octagonTable` 的石座和木颈要按桌高参数化，否则会穿出桌面。

### 地面：`src/mc/props/floors.ts` 半成品

三种贴图，都是 16 像素 / 米，颜色由种子决定：
- `plankHall`：长条板，可选深橡木包边和石炉床。
- `walnutHerringbone`：90° 直角人字拼，铺满且不重叠，看上去是对的。
- `stoneWoodMix`：石板和木条交错。
  - 已知问题：石板上的裂纹形状每块都一样，要改得各不相同。

尚未完成：
- **还没接进 roundtable v2。** 要在 v2 的 room 里加：
  - `floor:[{y:1.011,x0:7,x1:19,z0:5,z1:15}]`；
  - `floorArt`：调用 `plankHall`，包边宽约 8 像素，`hearth` 设在 x 10–12、z 3–7，对应方块世界里 x17–18、z8–11 的炉床。
- 接上之后要在场景里看颜色和席子（#cdb57e）、墙是否协调。

### 实验台：`avatar-lab.html` + `src/avatar-lab/main.ts`（开发工具，不进生产构建）

每个格子单独取景，用剪裁视口渲染。地址参数：
- `mode=row`：一排人物，`group` / `ids`、`view=front|side|back|34`、`pose=stand|sit`。
- `mode=expr`：6 种表情的头肩特写。
- `mode=poses`：一个人的 6 种姿态。
- `mode=chairs`：三种椅子 ×（空椅 / 有人坐）。
- `mode=floors`：三种地面。

### 截图脚本：`scripts/mc-shots.mjs`
- 新增命令 `lab <标签> [镜头...]`，镜头名见脚本里的 `LAB_SHOTS`。
- 原来的 `shoot` 和 `compare` 没有改动。

## 5. 已经看过的开发截图（`docs/art/sample/wip-r0/`，不是正式轮次）

| 截图 | 看到的情况 | 新旧 |
|---|---|---|
| `lab-rt-front`、`lab-rt-sit` | 圆桌 8 人：Q 版比例、眼镜、胡子、丸子、帽子都出来了。<br>问题：头发是竖条纹，看着像木板 / 木箱；刘海像梳子齿；侧发偏薄。<br>头发这部分已经改了代码，但还没验证。 | 改头发之前的图 |
| `lab-expr-rt-b` | 6 种表情都读得出来。惊讶的嘴是一团暗红，需要再改。 | 新 |
| `lab-chairs-34`、`lab-chairs-side` | 新椅子的形状没问题；坐人的那一排取景太近。 | 新 |
| `lab-floors` | 人字拼看着对；议事厅木地板和石木混拼可以接受，但有上面说的问题。 | 新 |
| `lab-poses` | 6 种姿态。 | 旧椅子 |

## 6. 怎么运行

### box 上（Linux）
- 代码副本：`/workspace/mc-art/repo`（git archive 出来的副本；`frontend/public` 是从 Max 复制来的资源，不进提交）。
- 开发服务：
  ```
  cd frontend && npx vite --port 5190 --host
  ```
  日志在 `/tmp/vite-art.log`。
- 截图：
  ```
  CHROME_PATH=/usr/bin/google-chrome node --experimental-websocket scripts/mc-shots.mjs lab <标签> rt-front chairs-34 ... --port=5190
  ```
- 场景截图：
  ```
  ... shoot <标签> roundtable --v=2 --port=5190 --shots=overview,fixed,judge,hud
  ```
- 测试：`npm run -s test:mc-room`（以及其他 `test:mc-*`），`npx tsc --noEmit -p .`

### Max 上（Windows，Node 24）
- 仓库：`C:\Users\32875\Desktop\多agent\muti-agent`，开发服务在 http://localhost:5173。
- 截图：
  ```
  node scripts/mc-shots.mjs shoot <标签> <房间> --v=2 --port=5173
  node scripts/mc-shots.mjs lab <标签> --port=5173
  ```
- `check-pixel-avatar` 要在 Max 上跑。

## 7. 下一步

### Phase 2 剩下的部分
1. 实验台把坐姿那一排的取景拉远，然后把整套实验台重拍一遍：
   - 看头发的新画法；
   - 看坐姿下脚有没有踩在脚踏上；
   - 看有没有穿进扶手。
2. 把木椅、.78 的桌高（加上八角桌的修正）、`plankHall` 地面接进 roundtable v2；跑 physics 和 v2 测试。
3. 做正式的 r1–r3 三轮：
   - 每轮拍实验台：正面 / 侧面 / 背面、坐姿、表情、三把椅子、三种地面；
   - 再拍 v2 的默认镜头、座位近景、产品画面（HUD）、评委视角；
   - 截图存成 `docs/art/sample/rN-*.png`，拼一张 `compare-baseline-rN.jpg`，差距写进 `03-sample-log.md`。
4. 写 `02-character-looks.md`。可以再加一个 `test:mc-avatar`，检查：
   - 33 个人都有配置；
   - 发型 ≥ 10 种；
   - avatar 模块里没有 `Math.random`；
   - 搭配约束成立。
5. 回归：
   - `npm run build`、全部 `test:mc-*`、`check-pixel-avatar`；
   - 其他五个旧场景（debate、roundtable 原版、office、classroom、meadow、podcast）各拍一张，确认人物能显示；
   - 特别看辩论主持人和讲台的高度。
   - 已知：旧场景的桌子还是 .95 高，对坐着的 Q 版人来说到了肩膀或头的位置。

### Phase 3
- 33 个人物逐个精修（实验台里全员看一遍：轮廓要有区分，颜色要克制）。
- 其他五个场景的椅子和地面换成共用椅子族和新地面贴图，桌子高度统一。

### Phase 4
- 验收：全部场景的真实截图，和基线 `docs/art/baseline/` 对比，跑全部测试和 build，最后写报告。
