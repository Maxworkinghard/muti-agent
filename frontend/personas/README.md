# 人物库

前端启动时自动读取这里所有的 `.json` 文件，不用改代码。

| 文件夹 | 模式 | 负责方 |
| --- | --- | --- |
| `common/` | 讨论类模式共用的通用人物；阿冷（`01-a-leng.json`）已退出娱乐模式，娱乐模式用 `entertainment/` 里的阿冷 | 公共 |
| `emotion/` | 情感交流的七种回应风格，一种风格一个人物，也出现在娱乐和辩论里 | 情感组 |
| `product/` | 「工作 · 创造项目」的五个人物，每个合并了几种相近的产品分析和 vibe coding 人格（来源写在文件的 `_说明` 里） | 工作组 |
| `entertainment/` | 娱乐组的 7 个宿舍室友：老方（反驳型）、小正（反反驳型）、阿实（确实型）、小林（正常人）、阿冷、小戏、阿禾，都用人格资料包协议 v1.0 | 娱乐组 |
| `rational/` | 还没有；辩论组的人物放这里 | 辩论组 |

文件夹名就是人物的默认模式；文件里写了 `modes` 时以文件为准。

格式优先用人格资料包协议 v1.0（`{ "schemaVersion": "1.0", "persona": {...} }`，校验工具在 `../persona-protocol`），样例见 `entertainment/ent-cold-observer-001.persona.json`。

各模式都已换成真实人物，演示用的 `demo-*.json` 已全部删除。工作组的 5 个人物（积木、算盘、放大镜、扳手、照妖镜）来自 PR6，说明见 `docs/handoff/03-工作组-人物与引擎.md`。

## 协议格式确认（按阿冷样例跑通）

顶层接受 `{ "schemaVersion": "1.0", "persona": { ... } }`。前端和 `../persona-protocol` 用的是同一份校验代码（`persona-protocol/src/protocol.mjs`），命令行校验：`node ../persona-protocol/src/cli.mjs 文件.json`。

`id` 以小写字母开头，只含小写字母、数字和单个短横线，比如 `aleng`、`ent-cold-observer-001` 都可以；整个人物库里不能重复。文件名不必和 id 一致，`.persona.json` 只是建议的后缀，任何 `.json` 都会被读取。

枚举值：

| 字段 | 可选值 |
| --- | --- |
| `modes` | `entertainment`、`rational` |
| `communicationStyle.verbosity` | `short`、`medium`、`long` |
| `communicationStyle.register` | `casual`、`neutral`、`formal` |
| `communicationStyle.humor` | `none`、`light`、`frequent` |
| `communicationStyle.emotionalExpression` | `restrained`、`moderate`、`expressive` |
| `boundaries.uncertainty` | `admit_and_ask`、`admit_only` |
| `boundaries.outOfScope` | `decline`、`brief_then_defer` |
| `boundaries.factVsOpinion` | `always_label`、`label_when_relevant` |
| `personality.traitOptions[].id` | 内置 `cautious`、`direct`、`skeptical`、`empathetic`、`critical`、`optimistic`、`pragmatic`、`humorous`，或自定义 `custom-xxx` |

`communicationStyle` 另有文本字段 `tone`、`sentenceStyle` 和数组 `catchphrases`、`avoidPhrases`；`boundaries` 另有数组 `forbiddenTopics`、`mustNot`。

头像：`visual.avatar` 可以写 `null`、`""` 或不写，前端会用 `visual.color` 颜色的像素小人代替，只给一条提醒，不算错误。要放图片时写 `https://...`，或写 `assets/avatars/xxx.png` 并把文件放到 `frontend/public/assets/avatars/`。

性格分两层：人物文件的 `personality.defaultTraits` 是默认值；用户在选人物页选的性格只存在本次 session（`participants[].traitSelection`），不改公共人物文件。首版开讨论后不能再切换。`selectedTraits`、`session`、`runtime`、`turnOrder`、`round` 这些字段写进人物文件会直接报错。

注意：协议的 `modes` 目前没有工作模式，`product/` 里的人物暂时还用前端的简化格式。

## 性情（娱乐模式用，`x-temperament`）

娱乐模式没有轮次，谁想说谁说，情绪会攒、会上头、会冷下来。同一句话落在不同人身上激起多大情绪、多想开口，由 `persona["x-temperament"]` 决定（`x-` 前缀是协议允许的扩展，校验照常通过）：

| 字段 | 含义 | 范围 |
| --- | --- | --- |
| `temper` | 脾气：火气放大倍数，1 是普通人 | 0.2～2 |
| `sensitivity` | 玻璃心：委屈放大倍数 | 0.2～2 |
| `grudge` | 记仇：越大火气和好恶消得越慢 | 0～1 |
| `face` | 要面子：越大越难当场认输 | 0～1 |
| `talk` | 话痨：越大开口门槛越低 | 0～1 |
| `speed` | 嘴快：反应和说话速度的倍数 | 0.4～2 |
| `baseline` | 平时的情绪，键是 `火气`、`委屈`、`开心`、`无聊` | 0～10 |
| `relations` | 开场时对某人的好恶，键是对方的人物 id | -10～10 |

都可以不写：没写的项按 `communicationStyle` 估（情绪外放的脾气急一点，篇幅长、爱开玩笑的话多一点）。例子见 `entertainment/ent-counter-contrarian-001.persona.json`：小正脾气急、记仇，开场就对老方 -3。
