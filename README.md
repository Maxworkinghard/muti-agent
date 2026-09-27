# muti-agent

多人格讨论工作台：选模式和主题，选几个人物入座，看他们围绕你的问题讨论或分工协作。讨论中可以暂停、插话、继续，讨论结束后还能接着追问。

## 四个模式

| 模式 | 引擎 | 人物 |
| --- | --- | --- |
| 娱乐 | 浏览器里的娱乐引擎（`frontend/src/engines/entertainment/`），每场随机 7～8 轮 | `frontend/personas/entertainment/` 7 人 |
| 辩论 | Python 辩论后端（`backend/服务.py` + `backend/辩论流程.py`）：正方、反方，中立主持固定兼裁判 | `backend/人物/理性/` 5 人 |
| 情感分析 | Node 会话后端（`frontend/server/`） | `frontend/personas/emotion/` 7 人 |
| 工作 | Node 会话后端（`frontend/server/`） | `frontend/personas/product/` 5 人 |

## 目录

- `frontend/`：网页和 Node 后端（`server/`），人物在 `personas/`，给各组的交接说明在 `docs/handoff/`。
- `backend/`：辩论用的人格数据库（人物、性格库、提示词）和 Python 辩论服务。
- `persona-protocol/`：人物文件格式的校验器，前端加载人物和图鉴导入都用它；命令行用法 `node persona-protocol/src/cli.mjs 文件.json`。

## 运行

1. 在 `frontend/` 里把 `.env.example` 复制成 `.env`，填上 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`（辩论后端也读这一份）。
2. 辩论后端：在 `backend/` 里运行 `python 服务.py`（端口 8000）。
3. 网页：在 `frontend/` 里运行 `npm install`、`npm run dev`，打开 http://localhost:5173 。

网址加 `?engine=mock` 时，所有模式都用模拟引擎，不调用模型。
