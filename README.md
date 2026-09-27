# muti-agent

多人格讨论工作台：选模式和主题，选几个人物入座，看他们围绕你的问题讨论或分工协作。

## 目录

- `frontend/`：网页和 Node 后端（`server/`）。所有模式都由 Node 后端直接调用模型；各模式的引擎在 `frontend/src/engines/`，人物在 `frontend/personas/`（每个人物一个 JSON 文件）；给各组的交接说明（要交的人物字段和引擎接口）在 `frontend/docs/handoff/`。
- `backend/`：理性讨论的人格数据库，包括人物、性格库、提示词和维护它们的 Python 小工具。「理性讨论」模式直接读这里的文件。
- `persona-protocol/`：人物文件格式（人格资料包协议 v1.0）的校验器，前端加载 `frontend/personas/` 和图鉴导入时用的是同一份；也可以在命令行运行 `node persona-protocol/src/cli.mjs 文件.json`。

## 运行

1. 在 `frontend/` 里把 `.env.example` 复制成 `.env.local`，填上 `ROUNDTABLE_API_KEY`。
2. 在 `frontend/` 里运行 `npm install`、`npm run dev`，打开 http://localhost:5173 。

网址加 `?engine=mock` 时，所有模式都用模拟引擎，不调用模型。
