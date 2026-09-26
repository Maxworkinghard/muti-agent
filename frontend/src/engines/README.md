# 引擎

每个模式一个独立引擎，由各自的负责方维护，互不影响：

- `entertainment/` 娱乐引擎（娱乐组）
- `rational/` 辩论引擎（辩论组）
- `emotion/` 情感交流引擎（情感组）
- `discussion/` 理性讨论引擎：流程在仓库根目录的 `backend/`（Python），见下文
- `product/` 工作引擎（工作部分导入后合并到这里）

每个文件夹里：

- `index.ts` 导出引擎包。除理性讨论外，现在各模式的 `create` 都是 `backend.ts`；要换成自己的流程，把 `create` 换成自己的实现即可，实现要遵守 `src/types.ts` 里的 `DiscussionEngine` 接口（start / sendUserMessage / stop，通过事件回传发言、轮次、状态和总结）。
- `config.ts` 放可调参数的默认值，开讨论时会复制到 `SessionConfig.engineOptions` 传给引擎。

`backend.ts` 是娱乐、辩论、情感交流、工作这几个模式现在用的真实引擎：浏览器只负责把会话配置交给后端、转发事件，每位成员在后端是一段直接发给模型接口的对话（`server/llmAgent.ts`，各自保留历史），各模式的流程写在 `server/session.ts`。`mock.ts` 是模拟引擎，不调用模型，网址加 `?engine=mock` 时所有模式都换成它。前端只通过 `registry.ts` 按模式取引擎。

`discussion/apiEngine.ts` 接的是 `backend/服务.py`：人物和性格从 `/api/options` 读，开讨论时 `POST /api/discuss` 用 SSE 逐条推发言，插话和停止走 `/api/discuss/<会话>/say`、`/stop`。讨论流程（开场、交锋、收尾，被质疑的人优先回应，主持人总结）在 `backend/讨论引擎.py`。开发时先在 `backend` 里运行 `python 服务.py`（不想花额度加 `--试跑`），`npm run dev` 会把这两个接口转过去。

## 调用 AI

在浏览器里写流程的引擎都用同一个 AI 接口，不要各自直连模型服务商，也不要把 API Key 写进前端代码。

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

请求走同源的 `/api/llm/chat`，由 `server/llm-proxy.ts` 补上 Key 后转给服务商。Key、服务商地址和默认模型写在 `frontend/.env.local` 的 `ROUNDTABLE_*` 里（参考 `.env.example`），和 `/api/sessions` 后端共用一套。

## 引擎要遵守的几条约定

- 进入讨论页后不自动开始：`start()` 时只让大家就座（可以 emit `round` 0「等你开口」）。用户对全体说的第一句话（`sendUserMessage` 不带 `targetAgentId`）才开始，这句话就是这一场要处理的事；在那之前点名某个成员只是单聊。没填主题时可以 emit `theme` 事件，按这句话起一个主题。
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
  emit({ type: 'message', message: { id, round, speakerId: agent.agentId, text: '', kind: 'speech', at: Date.now() } });
  let full = '';
  try {
    await chatStream(messages, (chunk) => {
      full += chunk;
      emit({ type: 'message_update', id, text: full });
    }, { signal: ctrl.signal });
  } catch (e) {
    if (isAbort(e)) return;                    // 用户点了停止
    emit({ type: 'error', id: id + '-err', agentId: agent.agentId,
           message: (e as Error).message, retry: () => speak(agent, messages) });
  }
}
```

`message` 事件的具体字段以 `src/types.ts` 里的 `EngineEvent` 为准。
