# muti-agent

多人格讨论工作台：选模式和主题，选几个人物入座，看他们围绕你的问题讨论或分工协作。讨论中可以暂停、插话、继续，讨论结束后还能接着追问。

## 界面

**1. 模式 · 主题 · 场景**：娱乐 / 辩论 / 情感分析 / 工作 四选一，填上想讨论的问题，再挑一张场景图。

![模式 · 主题 · 场景](docs/screens/01-mode-topic-scene.png)

**2. 选择人物**：从该模式的人物库里挑人入座，辩论要正反方各至少一人，中立主持固定兼裁判。

![选择人物](docs/screens/02-cast.jpg)

**3. 讨论**：左边是场景，右边是工作区，可以暂停、插话、点名单独对话，讨论结束还能接着追问。

![讨论](docs/screens/03-discussion.png)

场景图在 `frontend/public/scenes/`，五张分别是圆桌会议室、辩论室、办公室、中南大学教室、草地野餐，也可以上传自己的图。例如中南大学教室：

![中南大学教室](frontend/public/scenes/scene-classroom.png)

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
- `docs/screens/`：README 里用到的三张界面截图。

## 运行

1. 在 `frontend/` 里把 `.env.example` 复制成 `.env`，填上 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`（辩论后端也读这一份）。
2. 辩论后端：在 `backend/` 里运行 `python 服务.py`（端口 8000）。
3. 网页：在 `frontend/` 里运行 `npm install`、`npm run dev`，打开 http://localhost:5173 。

网址加 `?engine=mock` 时，所有模式都用模拟引擎，不调用模型。
