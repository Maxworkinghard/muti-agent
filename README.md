# muti-agent

多人格讨论工作台：选模式和主题，选几个人物入座，看他们围绕你的问题讨论或分工协作。

## 目录

- `frontend/`：网页和 Node 后端（`server/`）。所有模式都由 Node 后端直接调用模型；各模式的引擎在 `frontend/src/engines/`。
- `backend/`：理性讨论的人格数据库，包括人物、性格库、提示词和维护它们的 Python 小工具。「理性讨论」模式直接读这里的文件。

## 运行

1. 在 `frontend/` 里把 `.env.example` 复制成 `.env.local`，填上 `ROUNDTABLE_API_KEY`。
2. 在 `frontend/` 里运行 `npm install`、`npm run dev`，打开 http://localhost:5173 。

网址加 `?engine=mock` 时，所有模式都用模拟引擎，不调用模型。
