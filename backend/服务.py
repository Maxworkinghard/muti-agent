"""网页服务：把 讨论引擎.py 接到 frontend 前端（只做理性讨论）。

用法：
  python 服务.py                 # 调用真实模型，打开 http://127.0.0.1:8000
  python 服务.py --试跑          # 不调用模型，用示例发言检查界面
  python 服务.py --端口 9000

接口：
  GET  /api/options                 人物、性格列表
  POST /api/discuss                 开始一场讨论，用 SSE 逐条推送事件
  POST /api/discuss/<会话>/say      用户插话 {text, target}
  POST /api/discuss/<会话>/pause    暂停（下一位发言前停住，插话照常回应）
  POST /api/discuss/<会话>/resume   继续
  POST /api/discuss/<会话>/ask      讨论结束后追问 {text, target}，直接返回回答 {name, speech}
  POST /api/discuss/<会话>/stop     停止
其余路径返回 ../frontend/dist 里构建好的网页。

讨论流程完全复用 讨论引擎.py 里的函数。
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
import 辩论流程 as D
from 组装提示词 import build, _find_persona

ROOT = Path(__file__).resolve().parent
DIST = ROOT.parent / "frontend" / "dist"
SESSIONS = {}  # 会话 id -> {"inbox": Queue, "stop": Event, "pause": Event, "keep": dict}
FINISHED = {}  # 已结束的会话 id -> (结束时间, keep)，给追问用，保留一小时
KEEP_SECONDS = 3600
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
    sides = [x.get("side") for x in people]
    debate = any(sides)
    if debate:
        if any(s not in ("pro", "con", "host") for s in sides):
            raise ValueError("辩论里每个人都要分到正方、反方或主持。")
        if not (1 <= sides.count("pro") <= 3 and 1 <= sides.count("con") <= 3 and sides.count("host") <= 1):
            raise ValueError("辩论需要正方、反方各 1 到 3 人，主持最多 1 人。")
    elif not 2 <= len(people) <= 5:
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
                        "personality": x["personality"], "system": system, "side": x.get("side")})
    brief = str(body.get("brief", "")).strip()[:1000]
    return q, brief, members, rounds, max_chars, debate


def save_record(data):
    out = ROOT / "讨论记录"
    out.mkdir(exist_ok=True)
    f = out / (time.strftime("%Y%m%d-%H%M%S") + ".json")
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(f.relative_to(ROOT))


def run(question, brief, members, rounds, max_chars, emit, inbox, stop, pause=None, keep=None):
    """和 讨论引擎.main() 的流程一样，只是把 print 换成 emit，并在每次发言前处理用户插话。"""
    dry = OPT["dry"]
    ctx = question + (f"\n（用户开场时的补充说明：{brief}）" if brief else "")
    cfg = None if dry else E.load_config()
    log, count = [], {m["name"]: 0 for m in members}
    cur = {"round": 1}
    emit({"type": "start", "question": question, "rounds": rounds, "maxChars": max_chars,
          "model": cfg["model"] if cfg else "试跑",
          "members": [{k: m[k] for k in ("name", "role", "personality")} for m in members]})

    def call(m, msg, fake, for_user=False):
        while not for_user and pause is not None and pause.is_set() and not stop.is_set():
            handle_user(cur["round"])
            time.sleep(0.2)
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
        msg = E.user_message(ctx, others, log, E.task_for(stage, pending))
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
            r = call(m, E.user_message(ctx, others, log, task),
                     {"speech": f"（试跑）{m['name']} 回应你：“{u['text'][:20]}”。", "respondsTo": "用户",
                      "stance": "部分同意", "newPoint": True, "challenge": None, "challengeTarget": None},
                     for_user=True)
            entry = {"round": rnd, "name": m["name"], **{k: r.get(k) for k in
                     ("speech", "stance", "newPoint", "challenge", "challengeTarget")},
                     "respondsTo": "用户", "answered": None}
            log.append(entry)
            count[m["name"]] += 1
            emit({"type": "speech", "entry": entry, "toUser": True})

    for rnd in range(1, rounds + 1):
        cur["round"] = rnd
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
    handle_user(rounds)

    emit({"type": "summarizing", "text": "主持人正在写总结…"})
    if dry:
        final = "（试跑模式）各方立场：……\n共识：……\n分歧：……"
    else:
        full = "\n".join(f"第{x['round']}轮 {x['name']}：{x['speech']}" for x in log)
        final = E.chat(cfg, E.MODERATOR, f"议题：{ctx}\n\n讨论记录：\n{full}").strip()
    emit({"type": "summary", "text": final})
    if keep is not None:
        keep.update(members=members, topic=ctx, log=log, count=count, cfg=cfg, rounds=rounds, host=None,
                    system_key="system", debate=False, summary=final)
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


def answer_after(keep, text, target):
    """讨论结束后的追问：点名的人回答，没点名由主持人（没有主持时由发言最少的人）回答。"""
    members = keep["members"]
    m = next((x for x in members if x["name"] == target), None) or keep.get("host") \
        or min(members, key=lambda x: keep["count"][x["name"]])
    log = keep["log"]
    log.append({"round": keep["rounds"], "name": "用户", "title": "观众", "speech": text, "respondsTo": target,
                "phase": "赛后追问"})
    others = "、".join(o["name"] for o in members if o is not m)
    if keep["debate"]:
        how = ("作为主持人兼裁判中立地回答，可以解释你的判定理由" if m.get("side") == "host"
               else "仍然站在你方立场上回答")
    else:
        how = "结合刚才的讨论回答"
    task = (f"讨论已经结束，用户{'对你' if target else '对大家'}追问：“{text}”。{how}。"
            "问得简单就一两句话，复杂再展开。respondsTo 填“用户”，challenge 填 null。")
    if keep["cfg"] is None:
        time.sleep(OPT["delay"])
        speech = f"（试跑）{m['name']} 回答你的追问：“{text[:20]}”。"
    else:
        if keep["debate"]:
            msg = E.full_message(keep["topic"], others, log, task, keep.get("verdict", ""))
        else:
            msg = E.user_message(keep["topic"], others, keep["summary"], log, task)
        raw = E.chat(keep["cfg"], m[keep["system_key"]], msg, want_json=True)
        speech = E.parse_reply(raw).get("speech") or raw.strip()
    log.append({"round": keep["rounds"], "name": m["name"], "title": m.get("title", ""), "speech": speech,
                "respondsTo": "用户", "phase": "回答追问"})
    keep["count"][m["name"]] += 1
    return {"name": m["name"], "speech": speech, "title": m.get("title")}


def _clean_finished():
    now = time.time()
    for k in [k for k, (t, _) in FINISHED.items() if now - t > KEEP_SECONDS]:
        FINISHED.pop(k, None)


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
        if len(parts) == 5 and parts[:3] == ["", "api", "discuss"] and parts[4] == "ask":
            _clean_finished()
            keep = FINISHED.get(parts[3])
            if not keep:
                return self._json(404, {"error": "这场讨论的记录已经过期，请重新开一场。"})
            text = str(body.get("text", "")).strip()
            if not text:
                return self._json(400, {"error": "内容不能为空。"})
            try:
                return self._json(200, answer_after(keep[1], text[:500], body.get("target") or None))
            except SystemExit as e:
                return self._json(502, {"error": str(e)})
            except Exception as e:
                return self._json(500, {"error": f"回答追问时出错：{e}"})
        if len(parts) == 5 and parts[:3] == ["", "api", "discuss"] and parts[4] in ("say", "stop", "pause", "resume"):
            s = SESSIONS.get(parts[3])
            if not s:
                return self._json(404, {"error": "这场讨论已经结束或不存在。"})
            if parts[4] == "stop":
                s["stop"].set()
            elif parts[4] == "pause":
                s["pause"].set()
            elif parts[4] == "resume":
                s["pause"].clear()
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
        sess = {"inbox": queue.Queue(), "stop": threading.Event(), "pause": threading.Event(), "keep": {}}
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
            *base, debate = args
            if debate:
                f = D.run_debate(*base, emit, sess["inbox"], sess["stop"], OPT["dry"], OPT["delay"], save_record,
                                 pause=sess["pause"], keep=sess["keep"])
            else:
                f = run(*base, emit, sess["inbox"], sess["stop"], pause=sess["pause"], keep=sess["keep"])
            if sess["keep"]:
                _clean_finished()
                FINISHED[sid] = (time.time(), sess["keep"])
            emit({"type": "done", "file": f})
        except (Stopped, D.Stopped):
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
