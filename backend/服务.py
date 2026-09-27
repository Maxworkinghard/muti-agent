"""网页服务：把 讨论引擎.py 接到 roundtable-ui 前端（只做理性讨论）。

用法：
  python 服务.py                 # 调用真实模型，打开 http://127.0.0.1:8000
  python 服务.py --试跑          # 不调用模型，用示例发言检查界面
  python 服务.py --端口 9000

接口：
  GET  /api/options                 人物、性格列表
  POST /api/discuss                 开始一场讨论，用 SSE 逐条推送事件
  POST /api/discuss/<会话>/say      用户插话 {text, target}
  POST /api/discuss/<会话>/stop     停止
其余路径返回 ../frontend/dist 里构建好的网页。

讨论流程完全复用 讨论引擎.py 里的函数，那个文件没有改动。
"""
import argparse
import json
import mimetypes
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import 讨论引擎 as E
from 组装提示词 import build, _find_persona

ROOT = Path(__file__).resolve().parent
DIST = ROOT.parent / "frontend" / "dist"
SESSIONS = {}  # 会话 id -> {"inbox": Queue, "stop": Event}
OPT = {"dry": False, "delay": 1.2}


class Stopped(Exception):
    pass


def _load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def options():
    personas = []
    for f in sorted((ROOT / "人物").rglob("*.json")):
        p = _load(f)["persona"]
        if "rational" not in p.get("modes", []):
            continue
        personas.append({
            "id": p["id"], "name": p["name"], "role": p["identity"]["role"],
            "profession": p["identity"].get("profession", ""), "description": p.get("description", ""),
            "domains": p["knowledge"]["domains"], "strong": p["knowledge"].get("strong", []),
            "tradition": p["worldview"]["tradition"], "coreValues": p["worldview"]["coreValues"],
            "judgmentFocus": p["worldview"].get("judgmentFocus", []),
            "coreConviction": p["reasoning"].get("coreConviction", ""),
            "color": p.get("visual", {}).get("color", "#5f82b0"),
            "raw": p,
        })
    personalities = [{k: s.get(k) for k in ("id", "name", "description", "behaviors", "habits")}
                     for s in _load(ROOT / "性格库" / "性格.json")["personalities"]]
    model, err = "试跑", None
    if not OPT["dry"]:
        try:
            model = E.load_config()["model"]
        except SystemExit as e:
            model, err = None, str(e)
    return {"personas": personas, "personalities": personalities, "dryRun": OPT["dry"],
            "model": model, "configError": err,
            "limits": {"members": [2, 5], "rounds": [2, 6], "maxChars": [50, 400]}}


def prepare(body):
    """检查前端传来的参数，出错时抛 ValueError（返回 400）。"""
    q = str(body.get("question", "")).strip()
    if not q:
        raise ValueError("问题不能为空。")
    people = body.get("members") or []
    if not 2 <= len(people) <= 5:
        raise ValueError("人物要选 2 到 5 个。")
    rounds, max_chars = int(body.get("rounds", 3)), int(body.get("maxChars", 150))
    if not 2 <= rounds <= 6:
        raise ValueError("轮数要在 2 到 6 之间。")
    if not 50 <= max_chars <= 400:
        raise ValueError("字数上限要在 50 到 400 之间。")
    members, seen = [], set()
    for x in people:
        try:
            persona, _ = _find_persona(x.get("name", ""))
            system = build(persona["name"], x.get("personality") or "", max_chars)
        except SystemExit as e:
            raise ValueError(str(e))
        if persona["name"] in seen:
            raise ValueError(f"{persona['name']} 被选了两次。")
        seen.add(persona["name"])
        members.append({"name": persona["name"], "role": persona["identity"]["role"],
                        "personality": x["personality"], "system": system})
    brief = str(body.get("brief", "")).strip()[:1000]
    return q, brief, members, rounds, max_chars


def run(question, brief, members, rounds, max_chars, emit, inbox, stop):
    """和 讨论引擎.main() 的流程一样，只是把 print 换成 emit，并在每次发言前处理用户插话。"""
    dry = OPT["dry"]
    ctx = question + (f"\n（用户开场时的补充说明：{brief}）" if brief else "")
    cfg = None if dry else E.load_config()
    log, summary, count = [], "讨论刚开始。", {m["name"]: 0 for m in members}
    emit({"type": "start", "question": question, "rounds": rounds, "maxChars": max_chars,
          "model": cfg["model"] if cfg else "试跑",
          "members": [{k: m[k] for k in ("name", "role", "personality")} for m in members]})

    def call(m, msg, fake):
        if stop.is_set():
            raise Stopped()
        emit({"type": "thinking", "name": m["name"]})
        if dry:
            time.sleep(OPT["delay"])
            raw = json.dumps(fake, ensure_ascii=False)
        else:
            raw = E.chat(cfg, m["system"], msg, want_json=True)
        if stop.is_set():
            raise Stopped()
        return E.parse_reply(raw)

    def speak(m, rnd, stage):
        others = "、".join(f"{o['name']}（{o['role']}）" for o in members if o is not m)
        pending = None if stage == "开场" else E.open_challenge(log, m["name"])
        msg = E.user_message(ctx, others, summary, log, E.task_for(stage, pending))
        target = next((o["name"] for o in members if o is not m), None)
        r = call(m, msg, {"speech": f"（试跑）{m['name']} 在第 {rnd} 轮{stage}时的示例发言。",
                          "respondsTo": None if stage == "开场" else target,
                          "stance": "开场" if stage == "开场" else "部分同意", "newPoint": True,
                          "challenge": "示例质疑：你说的这个词到底指什么？", "challengeTarget": target})
        if pending:
            pending["resolved"] = True
        entry = {"round": rnd, "name": m["name"], **{k: r.get(k) for k in
                 ("speech", "respondsTo", "stance", "newPoint", "challenge", "challengeTarget")},
                 "answered": pending["name"] if pending else None}
        log.append(entry)
        count[m["name"]] += 1
        emit({"type": "speech", "entry": entry})

    def handle_user(rnd):
        while not inbox.empty():
            u = inbox.get()
            names = [m["name"] for m in members]
            m = next((x for x in members if x["name"] == u.get("target")), None) \
                or min(members, key=lambda x: count[x["name"]])
            log.append({"round": rnd, "name": "用户", "speech": u["text"], "respondsTo": u.get("target"),
                        "stance": "插话", "newPoint": True, "challenge": None, "challengeTarget": None,
                        "answered": None})
            others = "、".join(n for n in names if n != m["name"])
            task = (f"旁听的用户刚才{'对你' if u.get('target') else '对大家'}说：“{u['text']}”。"
                    f"先直接回应用户（respondsTo 填“用户”），再把它和正在讨论的议题联系起来。")
            r = call(m, E.user_message(ctx, others, summary, log, task),
                     {"speech": f"（试跑）{m['name']} 回应你：“{u['text'][:20]}”。", "respondsTo": "用户",
                      "stance": "部分同意", "newPoint": True, "challenge": None, "challengeTarget": None})
            entry = {"round": rnd, "name": m["name"], **{k: r.get(k) for k in
                     ("speech", "stance", "newPoint", "challenge", "challengeTarget")},
                     "respondsTo": "用户", "answered": None}
            log.append(entry)
            count[m["name"]] += 1
            emit({"type": "speech", "entry": entry, "toUser": True})

    for rnd in range(1, rounds + 1):
        stage = "开场" if rnd == 1 else "收尾" if rnd == rounds else "交锋"
        emit({"type": "round", "round": rnd, "stage": stage})
        if stage == "交锋":
            spoken = {m["name"]: 0 for m in members}
            while True:
                handle_user(rnd)
                m = E.next_speaker(members, log, spoken)
                if not m:
                    break
                speak(m, rnd, stage)
                spoken[m["name"]] += 1
        else:
            for m in members:
                handle_user(rnd)
                speak(m, rnd, stage)
        if not dry and rnd < rounds:
            emit({"type": "summarizing", "text": "主持人正在整理前情摘要…"})
            full = "\n".join(f"{x['name']}：{x['speech']}" for x in log)
            summary = E.chat(cfg, E.SUMMARY, f"议题：{ctx}\n\n{full}").strip()
    handle_user(rounds)

    emit({"type": "summarizing", "text": "主持人正在写总结…"})
    if dry:
        final = "（试跑模式）各方立场：……\n共识：……\n分歧：……"
    else:
        full = "\n".join(f"第{x['round']}轮 {x['name']}：{x['speech']}" for x in log)
        final = E.chat(cfg, E.MODERATOR, f"议题：{ctx}\n\n讨论记录：\n{full}").strip()
    emit({"type": "summary", "text": final})
    if dry:
        return None
    out = ROOT / "讨论记录"
    out.mkdir(exist_ok=True)
    f = out / (time.strftime("%Y%m%d-%H%M%S") + ".json")
    f.write_text(json.dumps({"question": question, "brief": brief, "model": cfg["model"],
                             "members": [{k: m[k] for k in ("name", "role", "personality")} for m in members],
                             "rounds": rounds, "maxChars": max_chars, "log": log, "summary": final},
                            ensure_ascii=False, indent=2), encoding="utf-8")
    return str(f.relative_to(ROOT))


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _json(self, code, data):
        b = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}") if n else {}

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/options":
            return self._json(200, options())
        f = (DIST / path.lstrip("/")).resolve()
        if not f.is_file() or DIST.resolve() not in f.parents:
            f = DIST / "index.html"
        if not f.is_file():
            return self._json(404, {"error": "前端还没有构建，请在 frontend 里运行 pnpm build，或用 pnpm dev 打开 5173 端口。"})
        b = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(f.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        try:
            body = self._body()
        except (ValueError, UnicodeDecodeError):
            return self._json(400, {"error": "请求不是合法的 JSON。"})
        parts = path.split("/")
        if path == "/api/discuss":
            return self.discuss(body)
        if len(parts) == 5 and parts[:3] == ["", "api", "discuss"] and parts[4] in ("say", "stop"):
            s = SESSIONS.get(parts[3])
            if not s:
                return self._json(404, {"error": "这场讨论已经结束或不存在。"})
            if parts[4] == "stop":
                s["stop"].set()
            else:
                text = str(body.get("text", "")).strip()
                if not text:
                    return self._json(400, {"error": "内容不能为空。"})
                s["inbox"].put({"text": text[:500], "target": body.get("target") or None})
            return self._json(200, {"ok": True})
        self._json(404, {"error": "没有这个接口。"})

    def discuss(self, body):
        try:
            args = prepare(body)
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        sid = str(body.get("sessionId") or time.time())
        sess = {"inbox": queue.Queue(), "stop": threading.Event()}
        SESSIONS[sid] = sess
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

        def emit(e):
            try:
                self.wfile.write(("data: " + json.dumps(e, ensure_ascii=False) + "\n\n").encode("utf-8"))
                self.wfile.flush()
            except OSError:
                sess["stop"].set()  # 浏览器关掉了页面
                raise Stopped()

        try:
            f = run(*args, emit, sess["inbox"], sess["stop"])
            emit({"type": "done", "file": f})
        except Stopped:
            try:
                emit({"type": "stopped"})
            except Stopped:
                pass
        except SystemExit as e:  # 讨论引擎 用 SystemExit 报配置和接口错误
            try:
                emit({"type": "error", "message": str(e)})
            except Stopped:
                pass
        except Exception as e:
            try:
                emit({"type": "error", "message": f"引擎出错：{e}"})
            except Stopped:
                pass
        finally:
            SESSIONS.pop(sid, None)


def main():
    ap = argparse.ArgumentParser(description="理性讨论网页服务")
    ap.add_argument("--端口", type=int, default=8000, dest="port")
    ap.add_argument("--试跑", action="store_true", dest="dry")
    ap.add_argument("--试跑间隔", type=float, default=1.2, dest="delay")
    a = ap.parse_args()
    OPT.update(dry=a.dry, delay=a.delay)
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    srv.daemon_threads = True
    print(f"已启动：http://127.0.0.1:{a.port}" + ("（试跑模式，不调用模型）" if a.dry else ""))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
