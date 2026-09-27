# 活人聊天底盘

所有“像真人一样聊”的模式共用的部分：没有轮次、不指定谁说话，每个人各自起反应、带着情绪决定说不说。现在娱乐模式在用（`../entertainment/`），辩论、讨论等模式以后按自己的玩法接进来。

| 文件 | 内容 |
| --- | --- |
| `engine.ts` | `createLiveEngine(kit, chatFn?)`：主循环——大家并行起反应、挑人开口、抢话、插嘴、小声、冷场散场；暂停、插话、@点名、私聊、出错重试；总结 |
| `mind.ts` | 每个人的内心账本：情绪按性情放大、随发言回落，对别人的好恶，给模型和界面看的说法 |
| `types.ts` | `LiveKit`（模式要提供的东西）、`Temperament`（性情）、`MoodDef`（情绪）、`Reaction`（一次反应）等 |
| `json.ts` | 从模型回答里抠 JSON |

## 模式要提供什么（`LiveKit`）

- `moods`：在乎哪几种情绪，每种的档位说法、表情、回落速度，被哪项性情放大，是不是“热”情绪（高了反应快、爱插嘴）。
- `temperament(p)`：这个人的性情（脾气、玻璃心、记仇、要面子、话痨、嘴快、平时情绪、开场好恶）。
- `reactionMessages(x)`：拼一次反应的提示词。底盘给好了聊天记录、私聊、状态、“现在”四段文字，模式负责人设、规则和输出格式。
- `summaryMessages` / `parseSummary`：散场后的总结。

模型要输出的 JSON 字段见 `engine.ts` 的 `parse()`：`inner`、`mood`、`toward`、`stance`、`hooks`、`plan`、`urge`、`interrupt`、`cut_after`、`reply_to`、`say`、`react`、`topic`、`private_reply`。

换一个模式，通常换的是：在乎哪些情绪、什么让人想开口（提示词）、要不要额外记账（比如辩论的论点账、讨论的想法墙），以及私聊在这个模式里算什么。暂停、插话、私聊、抢话打断、界面这些不用再写一遍。

## 界面约定

除了通用的事件，底盘还会发：

- `mind`：某人的内心变了（情绪条、心情、表情、态度、打算、心里话、好恶），界面用它换小人表情、显示内心面板；
- `message.kind = 'react'`：不抢话的小反应；
- `message.quote`：接的是前面某一条；
- `message_update.cut`：这句被打断了；
- `round`：话题段（开聊、换话题 · xxx）。
