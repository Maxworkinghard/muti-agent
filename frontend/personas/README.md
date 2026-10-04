# 人物库

前端启动时自动读取这里所有的 `.json` 文件，不用改代码。

| 文件夹 | 模式 | 负责方 |
| --- | --- | --- |
| `emotion/` | 情感分析的七种回应风格，一种风格一个人物，只用在情感分析 | 情感组 |
| `product/` | 「工作 · 创造项目」的 13 个人物，覆盖产品分析、研发、设计、测试、运维和内容运营 | 工作组 |
| `entertainment/` | 娱乐组的 7 个宿舍室友：老方（反驳型）、小正（反反驳型）、阿实（确实型）、小林（正常人）、阿冷、小戏、阿禾，都用人格资料包协议 v1.0；另有播客主持人阿麦（前端简化格式，配「播客访谈间」用） | 娱乐组 |
| `rational/` | 目前没有这个文件夹。辩论组的 5 个人物（老苏、阿澜、K、灰先生、南姐）放在 `backend/人物/理性/`，用的是 Python 后端那边的格式（模板 `backend/人物模板.json`），构建时由 `src/data/rationalPersonas.ts` 直接读进来。想用本库的两种格式加辩论人物，就新建 `rational/` 放进来 | 辩论组 |

文件夹名就是人物的默认模式；文件里写了 `modes` 时以文件为准。

`backend/人物/理性/` 和这里合成一个人物库，一起按 `id` 查重：先读这里，`id` 已经有了的文件会被跳过，并列在图鉴的问题列表里。把某个辩论人物改写成本库的格式放进 `rational/` 时，沿用原来的 `id` 就行：新版本生效，`backend/` 里的旧文件被跳过（图鉴里会留一条提示）；旧文件 Python 后端还在读，不必删。只有另一个人物碰巧撞了 `id` 时，才需要换一个。

格式优先用人格资料包协议 v1.0（`{ "schemaVersion": "1.0", "persona": {...} }`，校验工具在 `../persona-protocol`），样例见 `entertainment/ent-cold-observer-001.persona.json`。

各模式都已换成真实人物，演示用的 `demo-*.json` 已全部删除。工作组原有 5 人（积木、算盘、放大镜、扳手、照妖镜）来自 PR6，说明见 `docs/handoff/03-工作组-人物与引擎.md`。新增 8 人：闹钟（项目经理）、拼图（前端）、齿轮（后端）、调色盘（UI 设计）、捕虫网（测试）、灭火器（运维）、喇叭（运营）、钢笔（文案）。二维办公室和办公室 · 3D 均可选满 13 人；负责人可在选人页指定，其余人参与分工、讨论和评审。

## 协议格式确认（按阿冷样例跑通）

顶层接受 `{ "schemaVersion": "1.0", "persona": { ... } }`。前端和 `../persona-protocol` 用的是同一份校验代码（`persona-protocol/src/protocol.mjs`），命令行校验：`node ../persona-protocol/src/cli.mjs 文件.json`。

`id` 以小写字母开头，只含小写字母、数字和单个短横线，比如 `aleng`、`ent-cold-observer-001` 都可以；整个人物库里不能重复。文件名不必和 id 一致，`.persona.json` 只是建议的后缀，任何 `.json` 都会被读取。

枚举值：

| 字段 | 可选值 |
| --- | --- |
| `modes` | `entertainment`、`rational`、`emotion`、`product`；含 `rational` 时 `worldview.assumptions`、`judgmentFocus`、`blindSpots` 必填，`boundaries.factVsOpinion` 必须是 `always_label` |
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

协议的 `modes` 四个模式都能写。`emotion/`、`product/` 里现有的人物用的是前端简化格式，两种格式都能用，不必改写。

## 性情（娱乐、情感分析用，`x-temperament`）

娱乐和情感分析都跑在导演 + 演员底盘上，情绪会攒、会上头、会冷下来。同一句话落在不同人身上激起多大情绪、多想开口，由 `x-temperament` 决定：协议格式写在 `persona["x-temperament"]`（`x-` 前缀是协议允许的扩展，校验照常通过）；前端简化格式写在顶层的 `"x-temperament"`（加载时顶层 `x-` 开头的字段都会原样保留给引擎）。

| 字段 | 含义 | 范围 |
| --- | --- | --- |
| `temper` | 脾气：火气放大倍数，1 是普通人 | 0.2～2 |
| `sensitivity` | 娱乐里是玻璃心：委屈放大倍数；情感分析里是心软：心疼放大倍数 | 0.2～2 |
| `grudge` | 记仇：越大火气和好恶消得越慢 | 0～1 |
| `face` | 要面子：越大越难当场认输 | 0～1 |
| `talk` | 话痨：越大开口门槛越低 | 0～1 |
| `speed` | 嘴快：反应和说话速度的倍数 | 0.4～2 |
| `baseline` | 平时的情绪；娱乐的键是 `火气`、`委屈`、`开心`、`无聊`，情感分析的键是 `心疼`、`火气`、`担心`、`欣慰` | 0～10 |
| `relations` | 开场时对某人的好恶，键是对方的人物 id | -10～10 |

都可以不写：没写的项按 `communicationStyle` 估（情绪外放的脾气急一点，篇幅长、爱开玩笑的话多一点；简化格式没有这一块，按普通人算）。例子见 `entertainment/ent-counter-contrarian-001.persona.json`：小正脾气急、记仇，开场就对老方 -3；情感分析的例子见 `emotion/07-pao-zhang.json`：炮仗脾气 1.9、平时火气 4，开场就对冷萃 -2。

`talk`（话痨）还决定抽谁开口时这个人的冲动有多大：导演每一步提名几个可能接话的人，引擎按各人此刻的冲动抽，话多的人更容易抽中。

## 小反应（娱乐、情感分析用，`x-reactions`）

旁人顺口的“哈哈哈”“确实”“抱抱”不占发言。导演只定谁、哪一种反应，说什么从这个人自己的清单里挑（避开他最近用过的），所以每个人的小反应都是他自己的腔调；清单里没有的种类，说明他不会这么反应，就不出声。写的位置和 `x-temperament` 一样（协议格式在 `persona` 里，简化格式在顶层）：

```json
"x-reactions": {
  "附和": ["确实", "确实确实"],
  "心疼": ["确实难受"]
}
```

种类只有这几种：`笑`、`惊讶`、`附和`、`不服`、`疑问`、`心疼`、`敷衍`；每句不超过 12 个字，一种写一到三句就够。不写也行，这时用导演写的原话。例子见 `emotion/04-fu-du-ji.json`（复读机只会“确实”，不会追问也不会抬杠）。
