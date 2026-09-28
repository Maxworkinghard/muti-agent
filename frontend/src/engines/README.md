# 引擎

每个模式一个独立引擎，由各自的负责方维护，互不影响：

- `entertainment/` 娱乐引擎（娱乐组）：导演 + 演员——导演看全场排戏，角色按自己的人设说；跑在浏览器里，说明见该目录的 `README.md`
- `emotion/` 情感分析引擎（情感组）：同一套导演 + 演员底盘，换成情感的导演规则、情绪和三步（回应情绪 → 分清事实与感受 → 下一步行动）；跑在浏览器里，说明见该目录的 `README.md`
- `live/` 娱乐和情感分析共用的活人聊天底盘（导演 + 演员），说明见该目录的 `README.md`
- `rational/` 独立辩论引擎：自己的导演、辩手、裁判与固定轮次，只共用模型接口和页面
- `product/` 工作引擎（工作部分导入后合并到这里）

每个文件夹里：

- `index.ts` 导出引擎包。娱乐、情感分析和辩论各自在浏览器中运行独立引擎；工作由 `backend.ts` 接 Node 会话服务。引擎实现要遵守 `src/types.ts` 的 `DiscussionEngine` 接口。
- `config.ts` 放可调参数的默认值，开讨论时会复制到 `SessionConfig.engineOptions` 传给引擎。

前端只通过 `registry.ts` 按模式取引擎，不要在别处直接引用某个引擎文件。

## 调用 AI

四个模式共用同一个 AI 接口，不要各自直连模型服务商，也不要把 API Key 写进前端代码。

```ts
import { chat, chatStream } from '../../llm/client';

// 人物性格体现在 system 提示词里，API 是同一个
const { text, usage } = await chat([
  { role: 'system', content: '你是阿冷……（由人物 JSON 和本次选择的性格拼出来）' },
  { role: 'user', content: '主题：……' },
], { temperature: 0.8 });

// 边生成边显示
await chatStream(messages, (chunk) => { /* 追加到当前发言 */ });
```

请求走同源的 `/api/llm/chat`，由 `server/llm-proxy.ts` 补上 Key 后转给服务商。Key、服务商地址和默认模型都写在 `frontend/.env`（参考 `.env.example`）。

## 引擎要遵守的几条约定

- 默认 `maxTokens` 是 10000（`DEFAULT_MAX_TOKENS`），默认超时 90 秒。当前模型会先思考，思考也算在额度里，别调得太小，否则会报“没写出回复”。
- 所有失败都会抛 `LlmError`，带 `kind`（aborted / timeout / network / auth / quota / rate_limit / server / bad_request / empty）、`retryable` 和中文 `message`。用户点停止引起的中断用 `isAbort(e)` 判断，不要当成错误显示。
- `stop()` 必须中断正在进行的请求：每次讨论建一个 `AbortController`，把 `signal` 传给 `chat` / `chatStream`，`stop()` 里调 `abort()`。
- 请求失败时 emit `{ type: 'error', id, agentId, message, retry }`。前端会显示错误卡片和“重试”按钮，点重试就调用你给的 `retry` 函数。
- 流式输出先 emit 一条空的 `message`，之后每收到一段就用 `message_update` 按同一个 `id` 更新全文。

```ts
import { chatStream, isAbort } from '../../llm/client';

const ctrl = new AbortController();           // stop() 里调 ctrl.abort()

async function speak(agent, messages) {
  const id = crypto.randomUUID();
  emit({ type: 'message', message: { id, round, speakerId: agent.id, text: '', kind: 'speech' } });
  let full = '';
  try {
    await chatStream(messages, (chunk) => {
      full += chunk;
      emit({ type: 'message_update', id, text: full });
    }, { signal: ctrl.signal });
  } catch (e) {
    if (isAbort(e)) return;                    // 用户点了停止
    emit({ type: 'error', id: id + '-err', agentId: agent.id,
           message: (e as Error).message, retry: () => speak(agent, messages) });
  }
}
```

`message` 事件的具体字段以 `src/types.ts` 里的 `EngineEvent` 为准。
