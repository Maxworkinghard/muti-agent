# muti-agent

多人格讨论工作台：选模式和主题，选几个人物入座，看他们围绕你的问题讨论或分工协作。

## 目录

- `frontend/`：网页和 Node 后端（`server/`）。娱乐、辩论、产品开发三个模式由 Node 后端直接调用模型；各模式的引擎在 `frontend/src/engines/`。
- `backend/`：理性讨论的人格数据库和讨论引擎（Python，只用标准库），`服务.py` 给前端的「理性讨论」模式提供接口。

## 运行

1. 在 `frontend/` 里把 `.env.example` 复制成 `.env.local`，填上 `ROUNDTABLE_API_KEY`。Python 后端没有自己的 `模型配置.json` 时也用这套配置。
2. 在 `frontend/` 里运行 `npm install`、`npm run dev`，打开 http://localhost:5173 。
3. 要用「理性讨论」模式，再开一个终端，在 `backend/` 里运行 `python 服务.py`（不调用模型的试跑：`python 服务.py --试跑`）。

网址加 `?engine=mock` 时，所有模式都用模拟引擎，不调用模型。
