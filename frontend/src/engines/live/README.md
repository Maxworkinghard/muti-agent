# 活人聊天底盘（导演 + 演员）

所有“像真人一样聊”的模式共用的部分。三层：引擎（代码）记账、限速、执行；导演（一个模型调用）看全局，排下一句谁说、冲谁、大意、情绪怎么递进、说话状态怎么变、全场往哪走；演员（每个角色自己的调用）按自己的人设把这句说出来。现在娱乐模式在用（`../entertainment/`），辩论、讨论以后换一套导演规则和账接进来。

| 文件 | 内容 |
| --- | --- |
| `engine.ts` | `createLiveEngine(kit, chatFn?)`：导演排、演员说、流水线（说这句时下一句已经在准备）、插嘴截断、小反应、冷场散场；暂停、插话、@点名、私聊、出错重试；总结 |
| `mind.ts` | 每个人的账：情绪按性情放大、随发言回落，说话状态、态度、打算、好恶，给模型和界面看的说法 |
| `types.ts` | `LiveKit`（模式要提供的东西）、`Cue`（导演的一步安排）、`Speech`（演员说的话）、`Temperament`、`MoodDef` |
| `json.ts` | 从模型回答里抠 JSON |

## 模式要提供什么（`LiveKit`）

- `moods`：在乎哪几种情绪，每种的档位说法、表情、回落速度，被哪项性情放大。
- `temperament(p)`：这个人的性情。
- `directorMessages(x)`：导演的提示词。底盘给好聊天记录、每个人的账、全场阶段、“现在”四段文字；模式负责阵容、导演规则和输出格式（字段见 `engine.ts` 的 `parseCue()`：`arc`、`arc_note`、`next{speaker,to,gist,emotion,reply_to,interrupt,cut_after}`、`mood`、`style`、`stance`、`plan`、`toward`、`react`、`topic`、`end`）。
- `actorMessages(x)`：演员的提示词（说一句，或者私下回用户）；输出 `say`、`inner`，私聊时 `private_reply`、`plan`、`mood`。
- `summaryMessages` / `parseSummary`：散场后的总结。

换一个模式，通常换的是导演规则（比如辩论导演要追着回避的问题不放）、在乎哪些情绪、要不要额外记账（论点账、想法墙）。暂停、插话、私聊、插嘴、界面不用再写一遍。

## 界面约定

除了通用事件，还会发：`mind`（某人的账变了，界面换表情、显示内心面板）、`message.kind = 'react'`（小反应）、`message.quote`（接的是前面某一条）、`message_update.cut`（这句被打断）、`round`（换话题）。导演的安排不发给界面；`createLiveEngine` 的第三个参数 `debug` 能拿到每一步的安排，只给命令行调参用。
