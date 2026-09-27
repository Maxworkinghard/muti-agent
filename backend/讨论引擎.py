"""简单讨论引擎：用户给一个问题，几个人物轮流调用大模型讨论，最后由主持人总结。

用法：
  python 讨论引擎.py "问题" --人物 老苏:温和狡猾 阿澜:轻快好奇 灰先生:冷幽默
  python 讨论引擎.py "问题" --人物 ... --轮数 3 --字数 150
  python 讨论引擎.py "问题" --试跑                            # 不调用模型，只检查流程

每个人物都要写成 人物:性格。角色没有默认性格；
角色决定知识和看问题的角度，性格决定态度和说话方式。
不写 --人物 时，使用下面 DEMO 里的一组示例搭配。

每个人物发言前，都会拿到从开场到现在的全部发言原文（不做摘要压缩，也不只取最近几条）。

模型配置：复制 模型配置.示例.json 为 模型配置.json，填好 base_url、model、api_key。
只用 Python 标准库，不需要安装任何包。
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from 组装提示词 import build, _find_persona  # noqa: E402

MAX_TURNS = 2  # 交锋轮里每人最多发言几次，避免两个人一直对吵
DEMO = ["老苏:温和狡猾", "阿澜:轻快好奇", "灰先生:冷幽默"]
sys.stdout.reconfigure(line_buffering=True)  # 不加 -u 也能实时看到输出

MODERATOR = """你是一场理性讨论的中立主持人，不偏向任何一方。
根据讨论记录写总结，包含：
1. 每个人的最终立场（一两句话）
2. 达成共识的地方
3. 仍然存在的分歧
4. 谁在讨论中改变了看法，因为什么
用简洁、自然的中文写成几段话，不用列表、加粗和“首先、其次、综上所述”，不要加入你自己的观点。"""

def load_config():
    f = ROOT / "模型配置.json"
    # 没有 模型配置.json 时，沿用前端 frontend/.env 里的 LLM_BASE_URL、LLM_MODEL、LLM_API_KEY
    env = {}
    env_file = ROOT.parent / "frontend" / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            k, sep, v = line.partition("=")
            if sep and not k.strip().startswith("#"):
                env[k.strip()] = v.strip().strip('"').strip("'")
    # 进程环境变量覆盖 .env，和 Node 后端的顺序一致；serve.mjs 会把合并了 .env.production 的结果这样传进来
    for k in ("LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    if f.exists():
        cfg = json.loads(f.read_text(encoding="utf-8-sig"))
    elif env.get("LLM_BASE_URL") and env.get("LLM_MODEL"):
        cfg = {"base_url": env["LLM_BASE_URL"], "model": env["LLM_MODEL"], "api_key": env.get("LLM_API_KEY", "")}
    else:
        raise SystemExit("找不到 模型配置.json，frontend/.env 和环境变量里也没有 LLM_BASE_URL 和 LLM_MODEL。")
    cfg["api_key"] = os.environ.get("LLM_API_KEY") or cfg.get("api_key", "") or env.get("LLM_API_KEY", "")
    if not cfg["api_key"] or "在这里" in cfg["api_key"]:
        raise SystemExit("还没有填写 api_key（也可以设置环境变量 LLM_API_KEY）。")
    return cfg


def chat(cfg, system, user, want_json=False):
    body = {
        "model": cfg["model"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": cfg.get("temperature", 0.8),
    }
    if want_json and cfg.get("json_mode", True):
        body["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(
        cfg["base_url"].rstrip("/") + "/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + cfg["api_key"],
                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) discussion-engine/1.0",
                 "Accept": "application/json"},
    )
    last = ""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=cfg.get("timeout", 120)) as r:
                return json.loads(r.read().decode("utf-8"))["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:300]
            if e.code in (400, 401, 403, 404):
                raise SystemExit(f"模型接口返回 {e.code}：{msg}")
            last = f"{e.code} {msg}"
        except (urllib.error.URLError, TimeoutError) as e:
            last = str(e)
        print(f"  （调用失败，{attempt + 1}/3：{last}，稍后重试）")
        time.sleep(2 * (attempt + 1))
    raise SystemExit("模型连续调用失败，请检查网络和配置。")


def parse_reply(text):
    m = re.search(r"\{.*\}", text, re.S)
    try:
        d = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        d = {}
    if not d.get("speech"):
        d = {"speech": text.strip(), "respondsTo": None, "stance": "未知", "newPoint": True,
             "challenge": None, "challengeTarget": None}
    for k in ("respondsTo", "challengeTarget"):  # 模型偶尔填多个人，只取第一个
        v = d.get(k)
        if isinstance(v, list):
            v = v[0] if v else None
        if isinstance(v, str):
            v = re.split(r"[、,，/ ]", v.strip())[0] or None
            v = None if v in ("null", "None", "无") else v
        d[k] = v
    if not d.get("challenge"):
        d["challengeTarget"] = None
    return d


def task_for(stage, pending):
    """pending 是这个人要回应的质疑（可能为 None）。"""
    base = {
        "开场": "讨论开场。按照你的“讨论开场时你的做法”来发言，不要直接给出完整答案。",
        "交锋": "回应前面某位参与者的具体说法：同意、部分同意或反对，并给出新的理由、反例或问题。",
        "收尾": "这是最后一轮。说明你现在的最终立场：哪些看法被谁的哪个理由改变了，哪些你仍然坚持，为什么。",
    }[stage]
    if pending:
        return (f"{pending['name']} 刚才质疑了你：“{pending['challenge']}”。"
                f"先正面回应这个质疑（接受、反驳或部分接受，并说明理由）。然后：{base}")
    return base


def open_challenge(log, name):
    """找出针对 name、还没被回应的最早一条质疑。"""
    for x in log:
        if x["challengeTarget"] == name and not x.get("resolved") and x["name"] != name:
            return x
    return None


def next_speaker(members, log, spoken):
    """交锋轮里决定下一个发言的人：被质疑的人优先，其次是本轮还没说过话的人。"""
    last = log[-1]["name"] if log else None
    for m in members:  # 有人被质疑，且他本轮还能发言
        if m["name"] != last and spoken[m["name"]] < MAX_TURNS and open_challenge(log, m["name"]):
            return m
    for m in members:
        if spoken[m["name"]] == 0:
            return m
    return None


def record_line(x):
    """一条发言写成一行：辩论里有辩位和阶段时一并带上，方便看清谁在第几轮说了什么。"""
    who = (x.get("title") or "") + str(x["name"])
    phase = f"（{x['phase']}）" if x.get("phase") else ""
    return f"{who}{phase}：{x['speech']}"


def private_note(priv):
    """只有这位成员和用户知道的私下对话；没有就返回空串。别人拿不到这段。"""
    if not priv:
        return ""
    lines = "\n".join(f"{x['name']}：{x['speech']}" for x in priv)
    return ("【只有你和用户知道的私下对话】\n"
            "（其他角色看不到这些内容，也不知道你们聊过；要不要在公开讨论里提起、由你自己决定。）\n"
            f"{lines}\n\n")


def user_message(question, others, log, task, priv=None):
    """每次调用发给成员的那条消息：议题、参与者、从开场到现在的全部发言，最后是本轮任务。

    这里不做压缩：不写前情摘要，也不只带最近几条，整场讨论都在上下文里。
    priv：这位成员和用户的私聊（点成员说话才有），别人拿不到。
    """
    record = "\n".join(record_line(x) for x in log) or "（还没有人发言）"
    return (f"议题：{question}\n\n参与者：{others}\n\n发言记录（从开场到现在）：\n{record}\n\n"
            + private_note(priv)
            + f"本轮任务：{task}")


def parse_setting(s):
    """灰先生:毒舌 -> ("灰先生", "毒舌")"""
    parts = s.replace("：", ":").split(":")
    if len(parts) != 2 or not parts[1]:
        raise SystemExit(f"“{s}”格式不对，应写成 人物:性格，例如 灰先生:冷幽默")
    return parts[0], parts[1]


def main():
    ap = argparse.ArgumentParser(description="简单讨论引擎")
    ap.add_argument("问题", nargs="?")
    ap.add_argument("--人物", nargs="+", default=DEMO, dest="people", help="人物:性格")
    ap.add_argument("--轮数", type=int, default=3, dest="rounds")
    ap.add_argument("--字数", type=int, default=150, dest="max_chars")
    ap.add_argument("--试跑", action="store_true", dest="dry")
    a = ap.parse_args()

    question = a.问题 or input("请输入讨论的问题：").strip()
    if not question:
        raise SystemExit("问题不能为空。")
    if a.rounds < 2:
        raise SystemExit("轮数至少为 2（开场和收尾）。")

    members = []
    for n, personality in map(parse_setting, a.people):
        persona, _ = _find_persona(n)
        system = build(n, personality, a.max_chars)  # 名称不对时在这里报错
        members.append({"name": persona["name"], "role": persona["identity"]["role"],
                        "personality": personality, "system": system})

    cfg = None if a.dry else load_config()
    log = []
    print(f"\n议题：{question}")
    for m in members:
        print(f"  {m['name']}（{m['role']}）性格：{m['personality']}")

    def speak(m, rnd, stage):
        others = "、".join(f"{o['name']}（{o['role']}）" for o in members if o is not m)
        pending = None if stage == "开场" else open_challenge(log, m["name"])
        msg = user_message(question, others, log, task_for(stage, pending))
        if a.dry:
            print(f"\n[试跑] 发给 {m['name']} 的用户消息：\n{msg}")
            target = next((o["name"] for o in members if o is not m), None)
            raw = json.dumps({"speech": f"（{m['name']} 的示例发言）", "respondsTo": None, "stance": "开场",
                              "newPoint": True, "challenge": "示例质疑", "challengeTarget": target}, ensure_ascii=False)
        else:
            raw = chat(cfg, m["system"], msg, want_json=True)
        r = parse_reply(raw)
        if pending:
            pending["resolved"] = True
        entry = {"round": rnd, "name": m["name"], **{k: r.get(k) for k in
                 ("speech", "respondsTo", "stance", "newPoint", "challenge", "challengeTarget")},
                 "answered": pending["name"] if pending else None}
        log.append(entry)
        tag = f"【{entry['stance']}" + (f" → {entry['respondsTo']}" if entry["respondsTo"] else "") + "】"
        if pending:
            tag += f"（回应 {pending['name']} 的质疑）"
        print(f"\n{m['name']} {tag}\n{entry['speech']}")
        if entry["challengeTarget"]:
            print(f"  ↳ 质疑 {entry['challengeTarget']}：{entry['challenge']}")

    for rnd in range(1, a.rounds + 1):
        stage = "开场" if rnd == 1 else "收尾" if rnd == a.rounds else "交锋"
        print(f"\n===== 第 {rnd} 轮 · {stage} =====")
        if stage == "交锋":
            spoken = {m["name"]: 0 for m in members}
            while (m := next_speaker(members, log, spoken)):
                speak(m, rnd, stage)
                spoken[m["name"]] += 1
        else:  # 开场和收尾：每人一次，按选择顺序；收尾时有未回应的质疑会先回应
            for m in members:
                speak(m, rnd, stage)

    if a.dry:
        final = "（试跑模式，不生成总结）"
    else:
        full = "\n".join(f"第{x['round']}轮 {x['name']}：{x['speech']}" for x in log)
        final = chat(cfg, MODERATOR, f"议题：{question}\n\n讨论记录：\n{full}").strip()
    print("\n===== 主持人总结 =====\n" + final)
    if a.dry:
        return  # 试跑不保存记录

    out = ROOT / "讨论记录"
    out.mkdir(exist_ok=True)
    f = out / (time.strftime("%Y%m%d-%H%M%S") + ".json")
    f.write_text(json.dumps({"question": question, "model": cfg["model"] if cfg else "试跑",
                             "members": [{k: m[k] for k in ("name", "role", "personality")} for m in members],
                             "rounds": a.rounds, "maxChars": a.max_chars, "log": log, "summary": final},
                            ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n记录已保存：{f.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
