# muti-agent

多人格讨论工作台：选模式和主题，选几个人物入座，看他们围绕你的问题讨论或分工协作。讨论中可以暂停、插话、继续，讨论结束后还能接着追问。

> **项目准备换方向。** 下面介绍的是换方向之前的版本（圆桌版：娱乐 / 辩论 / 情感分析 / 工作四个模式），它已经完整冻结在分支 [`legacy/v1-roundtable`](https://github.com/Maxworkinghard/muti-agent/tree/legacy/v1-roundtable) 上，之后 main 上的改动不会影响它。

## 换方向之前的版本

### 体验旧版

在仓库根目录执行（第一次会自动检出旧版、安装依赖）：

```bash
npm run legacy
```

脚本把旧版检出到 `.legacy/v1-roundtable`（git worktree，不影响当前工作区，已加入 `.gitignore`），同时启动旧版的页面和辩论后端，打开 http://localhost:5174 即可。端口和新版默认的 5173 / 8000 错开，两个版本可以同时开着对比；要换端口用 `LEGACY_PORT`、`LEGACY_DEBATE_PORT`。模型配置沿用当前的 `frontend/.env`；没有 key 时辩论模式以试跑方式运行（示例发言），其余三个模式会提示缺少 `LLM_API_KEY`。

不用 git 的话，也可以在 GitHub 上切到 `legacy/v1-roundtable` 分支下载 ZIP，按那份 README 的「运行」一节启动。

### 回退

旧版的代码只在 `legacy/v1-roundtable` 上保留一份，**不要删除或改动这个分支**。新方向走不通、需要整体回到旧版时：

```bash
git fetch origin legacy/v1-roundtable
git checkout -b rollback-v1 origin/main
git restore --source=origin/legacy/v1-roundtable --worktree --staged .   # 工作区整体换成旧版内容
git commit -m "回退到换方向之前的版本（legacy/v1-roundtable）"
git push -u origin rollback-v1                                           # 再开 PR 合进 main
```

这样回退是一次普通提交，换方向期间的历史都还在，随时可以再改回来；不需要改写 main 的历史。只想取回旧版的个别文件时，把最后的 `.` 换成对应路径即可。

## 界面

**1. 模式 · 主题 · 场景**：娱乐 / 辩论 / 情感分析 / 工作 四选一，填上想讨论的问题，再挑一张场景图。

![模式 · 主题 · 场景](docs/screens/01-mode-topic-scene.png)

**2. 选择人物**：从该模式的人物库里挑人入座，辩论要正反方各至少一人，中立主持固定兼裁判。

![选择人物](docs/screens/02-cast.jpg)

**3. 讨论**：左边是场景，右边是工作区，可以暂停、对全体插话，也可以点成员私下说（只有他看得到，其他角色不知道），讨论结束还能接着追问。

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

本地由两个进程组成：前端开发服务器（必需），以及只在辩论模式用到的辩论后端。

| 进程 | 职责 | 默认地址 |
| --- | --- | --- |
| 前端开发服务器（Vite） | 页面与热更新、Node 会话后端与模型转发、API 反向代理 | http://localhost:5173 |
| 辩论后端（Python） | 辩论模式的人物库与讨论流程（`/api/options`、`/api/discuss`） | http://127.0.0.1:8000 |

**环境要求**：Node.js `^20.19.0 || >=22.12.0`（Vite 8 的要求）、Python 3.10 及以上；首次运行先在 `frontend/` 执行一次 `npm install`。

### 1. 配置模型凭据

把 `frontend/.env.example` 复制为 `frontend/.env`，填写三个变量：

| 变量 | 含义 | 示例 |
| --- | --- | --- |
| `LLM_API_KEY` | 服务商 API Key | `sk-...` |
| `LLM_BASE_URL` | 兼容 OpenAI `/chat/completions` 的接口地址 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名 | `deepseek-chat` |

- Node 侧依次加载 `.env`、`.env.local`，同名变量以 `.env.local` 为准；旧变量名 `ROUNDTABLE_*` 仍然兼容；
- Python 辩论后端的优先级：`backend/模型配置.json` → `frontend/.env`（有前者就用前者）；进程环境变量里的 `LLM_*` 覆盖 `.env` 里的同名项，`LLM_API_KEY` 连 `模型配置.json` 里的也覆盖，因此同一份 `.env` 同时供两个后端使用；
- `.env` 只在服务器端读取，不会打包进前端，也不纳入版本控制；
- 未配置的后果：四种模式发言时都会提示缺少 `LLM_API_KEY`，辩论后端在启动阶段直接报错退出。

### 2. 启动辩论后端（仅辩论模式需要）

```bash
cd backend
python 服务.py                # 调用真实模型
python 服务.py --试跑         # 不调用模型，用示例发言检查界面
python 服务.py --端口 9000     # 换端口，前端需同步设置 DEBATE_BACKEND
```

### 3. 启动网页

```bash
cd frontend
npm run dev
```

一个 Vite 进程同时提供三样东西：页面与热更新、Node 会话后端（`/api/health`、`/api/sessions`、`/api/llm/*`，Key 只留在服务器端）、到辩论后端的反向代理（`/api/discuss`、`/api/options`）。

- 端口默认为 5173，被占用时 Vite 会自动顺延，**以终端输出的地址为准**；
- 请用终端输出的 `localhost` 地址打开（只监听 IPv6 回环时，`127.0.0.1` 连不上）；
- 辩论后端不在默认地址时：`DEBATE_BACKEND=http://127.0.0.1:9000 npm run dev`。

### 4. 单端口发布（可选）

`node serve.mjs` 把静态页、Node 会话后端和 Python 辩论后端合并到一根端口，并把辩论后端作为子进程启动。

发布前设置至少 16 个字符的 `APP_ACCESS_PASSWORD`（可放在 `frontend/.env.production` 或进程环境变量）。服务启动后，浏览器访问页面会要求登录：用户名固定为 `roundtable`，密码是该变量的值。页面和全部 API 共用此校验；对外访问请使用 HTTPS，避免 Basic 凭据在传输中泄露。未配置密码时单端口服务会拒绝启动。

`serve.mjs` 在仓库根目录，下面两条也在根目录执行：

```bash
npm run build              # 构建页面和 Node 后端（即 frontend/ 里的 build 和 build:server）
APP_ACCESS_PASSWORD='replace-with-a-long-random-password' PORT=8080 npm start  # 默认端口 5173；辩论后端端口用 DEBATE_PORT 指定，默认 8000
```

若存在 `frontend/.env.production`，它会覆盖 `.env`，两个后端都生效（本地 `npm run dev` 不读它）。
