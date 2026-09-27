# 人物库

前端启动时自动读取这里所有的 `.json` 文件，不用改代码。文件按路径排序，文件名前面的数字决定人物在列表里的先后。

| 文件夹 | 放什么 | 负责方 |
| --- | --- | --- |
| `common/` | 讨论类模式共用的通用人物；阿冷（`01-a-leng.json`）已退出娱乐模式，娱乐模式用 `entertainment/` 里的阿冷 | 公共 |
| `emotion/` | 情感交流的七种回应风格，一种风格一个人物，也出现在娱乐和辩论里 | 情感组 |
| `product/` | 「工作 · 创造项目」的五个人物，每个合并了几种相近的产品分析和 vibe coding 人格（来源写在文件的 `_说明` 里） | 工作组 |
| `entertainment/` | 娱乐组的 7 个宿舍室友：老方（反驳型）、小正（反反驳型）、阿实（确实型）、小林（正常人）、阿冷、小戏、阿禾，都用人格资料包协议 v1.0 | 娱乐组 |
| `rational/` | 还没有；辩论组的人物放这里 | 辩论组 |

文件夹名是模式 id（`entertainment`、`rational`、`emotion`、`product`）时，就是人物的默认模式；文件里写了 `modes` 时以文件为准。理性讨论的人物不在这里，在仓库根目录的 `backend/`（人格数据库）。

## 两种格式

- **人格资料包协议 v1.0**：`{ "schemaVersion": "1.0", "persona": { ... } }`，样例见 `../../persona-protocol/examples/aleng.persona.json`。前端和命令行用的是同一份校验代码（`persona-protocol/src/protocol.mjs`），在仓库根目录运行 `node persona-protocol/src/cli.mjs 文件.json` 可以先校验。
- **前端简化格式**：字段和 `src/types.ts` 里的 `Persona` 一样，只检查 `id`、`name` 和 `personalities`。现有人物都用这种格式，因为它能写像素形象（发型、表情、配饰）和每种性格的表达方式。

有错误或提醒的文件，在图鉴里点「查看问题」可以看到，控制台也会打印；有错误的文件不会加载。`id` 在整个人物库里不能重复，重复的后一个会被跳过。

## 协议格式确认（按阿冷样例跑通）

`id` 以小写字母开头，只含小写字母、数字和单个短横线，比如 `aleng`、`ent-cold-observer-001` 都可以。文件名不必和 id 一致，`.persona.json` 只是建议的后缀，任何 `.json` 都会被读取。

枚举值：

| 字段 | 可选值 |
| --- | --- |
| `modes` | `entertainment`、`rational`、`emotion` |
| `communicationStyle.verbosity` | `short`、`medium`、`long` |
| `communicationStyle.register` | `casual`、`neutral`、`formal` |
| `communicationStyle.humor` | `none`、`light`、`frequent` |
| `communicationStyle.emotionalExpression` | `restrained`、`moderate`、`expressive` |
| `boundaries.uncertainty` | `admit_and_ask`、`admit_only` |
| `boundaries.outOfScope` | `decline`、`brief_then_defer` |
| `boundaries.factVsOpinion` | `always_label`、`label_when_relevant` |
| `personality.traitOptions[].id` | 内置 `cautious`、`direct`、`skeptical`、`empathetic`、`critical`、`optimistic`、`pragmatic`、`humorous`，或自定义 `custom-xxx` |

`communicationStyle` 另有文本字段 `tone`、`sentenceStyle` 和数组 `catchphrases`、`avoidPhrases`；`boundaries` 另有数组 `forbiddenTopics`、`mustNot`。

头像：协议的 `visual.avatar` 可以写 `null`、`""` 或不写，前端会用 `visual.color` 颜色的像素小人代替，只给一条提醒，不算错误。要放图片时写 `https://...`，或写 `assets/avatars/xxx.png` 并把文件放到 `frontend/public/assets/avatars/`。简化格式在 `visual.image` 里写图片地址。有图片的人物在各处都显示图片，没有朝向和站起来的动作。

性格：协议里的 `personality.traitOptions` 就是选人物页里可选的性格，`personality.defaultTraits` 的第一个是默认选中的。用户选的性格只用于这一场讨论，不会改人物文件。`selectedTraits`、`session`、`runtime`、`turnOrder`、`round` 这些字段写进人物文件会直接报错。

注意：协议的 `modes` 目前没有工作模式，`product/` 里的人物还用前端简化格式。
