# 活人聊天底盘（导演 + 演员）

娱乐和情感分析共用的底盘（玩法分别在 `../entertainment/kit.ts`、`../emotion/kit.ts`）。三层：引擎（代码）记账、限速、执行；导演（一个模型调用）看全局，排下一句谁说、冲谁、大意、情绪怎么递进、说话状态怎么变、全场往哪走；演员（每个角色自己的调用）按自己的人设把这句说出来。辩论另有独立引擎（`../rational/`）。

| 文件 | 内容 |
| --- | --- |
| `engine.ts` | `createLiveEngine(kit, chatFn?)`：导演排、演员说、流水线（说这句时下一句已经在准备）、插嘴截断、小反应、冷场散场、分步（`kit.stages`）；暂停、插话、@点名、私聊、出错重试；总结 |
| `mind.ts` | 每个人的账：情绪按性情放大、随发言回落，说话状态、态度、打算、好恶，给模型和界面看的说法 |
| `types.ts` | `LiveKit`（模式要提供的东西）、`Cue`（导演的一步安排）、`Speech`（演员说的话）、`Temperament`、`MoodDef` |
| `json.ts` | 从模型回答里抠 JSON |

## 模式要提供什么（`LiveKit`）

- `moods`：在乎哪几种情绪，每种的档位说法、表情、回落速度，被哪项性情放大。
- `temperament(p)`：这个人的性情。
- `directorMessages(x)`：导演的提示词。底盘给好聊天记录、每个人的账、全场阶段、“现在”四段文字；模式负责阵容、导演规则和输出格式（字段见 `engine.ts` 的 `parseCue()`：`arc`、`arc_note`、`next{speaker,to,gist,emotion,reply_to,interrupt,cut_after}`、`mood`、`style`、`stance`、`plan`、`toward`、`react`、`topic`、`end`）。
- `actorMessages(x)`：演员的提示词（说一句，或者私下回用户）；输出 `say`、`inner`，私聊时 `private_reply`、`plan`、`mood`。
- `summaryMessages` / `parseSummary`：散场后的总结。
- `stages`（可选）：分步走的模式给出步骤名，比如情感分析的「回应情绪 → 分清事实与感受 → 下一步行动」。导演的 `arc` 写现在在哪一步，走到后面的步骤时界面开一段新的（只往前走）；导演看到的“走到哪了”会写成第几步、这一步说了几次。没走到最后一步不散场：导演提前写 `end` 不算数，冷场时停下来等用户开口（这期间不再叫导演，用户对全体说话或点暂停再继续才接着聊）；发言条数用完照样散场。不给 `stages` 就是娱乐那样的自由聊。

换一个模式，通常换的是导演规则（比如辩论导演要追着回避的问题不放）、在乎哪些情绪、要不要分步、要不要额外记账（论点账、想法墙）。暂停、插话、私聊、插嘴、界面不用再写一遍。

## 界面约定

除了通用事件，还会发：`mind`（某人的账变了，界面换表情、显示内心面板）、`message.kind = 'react'`（小反应）、`message.quote`（接的是前面某一条）、`message_update.cut`（这句被打断）、`round`（换话题；分步的模式还有走到了哪一步）。导演的安排不发给界面；`createLiveEngine` 的第三个参数 `debug` 能拿到每一步的安排，只给命令行调参用。
