# 人物库

前端启动时自动读取这里所有的 `.json` 文件，不用改代码。

| 文件夹 | 模式 | 负责方 |
| --- | --- | --- |
| `entertainment/` | 娱乐 | 娱乐组 |
| `rational/` | 辩论 | 辩论组 |
| `product/` | 工作 · 创造项目 | 工作组（工作 Agent） |

文件夹名就是人物的默认模式；文件里写了 `modes` 时以文件为准。

格式优先用人格资料包协议 v1.0（`{ "schemaVersion": "1.0", "persona": {...} }`，校验工具在 `../persona-protocol`），样例见 `entertainment/ent-cold-observer-001.persona.json`。

`demo-*.json` 是演示用的假人物，真实人物到位后直接删掉对应文件即可。

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

头像：`visual.avatar` 可以写 `null`、`""` 或不写，前端会用 `visual.color` 颜色的像素小人代替，只给一条提醒，不算错误。要放图片时写 `https://...`，或写 `assets/avatars/xxx.png` 并把文件放到 `roundtable-ui/public/assets/avatars/`。

性格分两层：人物文件的 `personality.defaultTraits` 是默认值；用户在选人物页选的性格只存在本次 session（`participants[].traitSelection`），不改公共人物文件。首版开讨论后不能再切换。`selectedTraits`、`session`、`runtime`、`turnOrder`、`round` 这些字段写进人物文件会直接报错。

注意：协议的 `modes` 目前没有工作模式，`product/` 里的人物暂时还用前端的简化格式。
