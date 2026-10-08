# 辩论引擎

当前网页在浏览器中运行独立辩论流程，从 `engines/registry.ts` 经本目录 `index.ts` 创建 `engine.ts::createRationalEngine()`；模型请求走 `llm/client.ts` 和 Node `/api/llm/chat`。Python 服务与 Node 会话中的旧辩论分支是独立/兼容路径，不是网页调度器。

| 文件 | 职责 |
|---|---|
| `schedule.ts` | 根据赛制、正反方、主持和轮数生成固定发言顺序 |
| `engine.ts` | 每步导演 → 辩手，维护可见上下文、心态、暂停/恢复/停止、插话/私聊、总结与追问 |
| `prompt.ts` | 导演、辩手、私聊和赛后整理的提示词 |
| `moods.ts` | 心态/情绪与场景表达映射 |
| `config.ts` | 采样与节奏默认值 |

人物由 `data/rationalPersonas.ts` 从 `backend/人物/理性/` 和性格库加载，再经人物库合并。保持人物 id、用户所选性格与正反方立场；主持负责串场。当前结束结果只整理公开讨论的共识、分歧、问题与建议，不评分、排名或判胜负。

舞台动作由 MC 导演消费事件，不在这里决定几何、外观或机位。私聊不进入其他成员的公开上下文；停止中断请求。接口遵守 `types.ts` 的 `DiscussionEngine` / `EngineEvent`。

在 `frontend/` 执行 `npm run test:rational` 和 `npm run test:debate-mind`，验证赛制、立场、上下文、私聊、暂停、停止与无评比总结。完整验收见根目录 [VERIFY.md](../../../../VERIFY.md)。
