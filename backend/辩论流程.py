"""正式辩论流程：正方 / 反方 / 主持（兼裁判）。

前端传来的成员带 side（pro / con / host）时，服务.py 走这里；没有 side 时仍走原来的圆桌讨论。

流程（总轮数 R，2 到 6）：
  第 1 轮 立论陈述：主持开场 → 正方一辩立论 → 反方一辩驳立论
  第 2 ~ R-1 轮 交锋质询：一方提问、对方指定辩手必须正面作答，再换边；每轮换人，先问的一方也轮换
  第 R 轮 总结陈词：反方先、正方最后
  最后 判定：主持人（没有主持时由中立裁判）给出胜方、比分、理由和被回避的质询

辩手每次发言都要在 JSON 里填 position（支持辩题 / 反对辩题），和阵营不符时带着纠正说明重说一次。
"""
import json
import re
import time

import 讨论引擎 as E

SIDE_NAME = {"pro": "正方", "con": "反方", "host": "主持"}
# 按队伍人数分配辩位：人少时一人兼几个位置
POSITIONS = {1: ["一辩"], 2: ["一辩", "三辩"], 3: ["一辩", "二辩", "三辩"]}
DUTY = {
    "一辩": "负责立论：界定关键概念，提出判断标准，给出两到三个主要论点。",
    "二辩": "负责质询和驳论：抓住对方论证里最薄弱的一环追问，拆掉对方的论据。",
    "三辩": "负责总结：梳理双方交锋，说明为什么在判断标准下你方胜出。",
}

MOTION = """把用户给的辩题整理成正式辩题。只输出一个 JSON 对象：
{"motion": "陈述句形式的辩题", "pro": "正方持方，一句话，明确支持辩题", "con": "反方持方，一句话，明确反对辩题"}
辩题是问句时，正方回答“是 / 应该 / 会”，反方回答“否 / 不应该 / 不会”。不要加入你自己的观点。"""

JUDGE = """你是这场辩论的裁判，必须中立。只根据场上表现判定，不根据你自己对辩题的看法。
评判标准：论点是否清楚成立、论据是否可靠、有没有正面回答对方的质询、反驳是否击中要害、总结是否收束了交锋。
回避质询、偷换辩题、站到对方立场上，都要扣分。
只输出一个 JSON 对象：
{"winner": "正方 / 反方 / 平局", "proScore": 0到100的整数, "conScore": 0到100的整数,
 "reason": "两三句话说明胜负理由，点出决定胜负的那一次交锋",
 "unanswered": ["被回避或没答好的质询，写明谁问谁"],
 "consensus": ["双方其实都接受的点"], "disagreements": ["仍然对立的核心分歧"], "openQuestions": ["还需要事实或数据验证的问题"],
 "summary": "用自然的几句话向观众总结这场辩论，最后宣布结果"}"""


class Stopped(Exception):
    pass


def split_sides(members):
    pro = [m for m in members if m.get("side") == "pro"]
    con = [m for m in members if m.get("side") == "con"]
    host = next((m for m in members if m.get("side") == "host"), None)
    for team in (pro, con):
        for m, pos in zip(team, POSITIONS[len(team)]):
            m["pos"], m["title"] = pos, SIDE_NAME[m["side"]] + pos
    if host:
        host["title"] = "主持人"
    return pro, con, host


def duty_of(m, team):
    if len(team) == 1:
        return "你一人负责立论、质询和总结。" + DUTY["一辩"]
    if len(team) == 2 and m["pos"] == "三辩":
        return DUTY["二辩"] + DUTY["三辩"]
    return DUTY[m["pos"]]


def debate_block(m, motion, pro, con):
    if m["side"] == "host":
        return (f"\n---\n\n## 本场是正式辩论，你是主持人兼裁判\n辩题：{motion['motion']}\n"
                f"正方：{motion['pro']}（{'、'.join(x['name'] for x in pro)}）\n"
                f"反方：{motion['con']}（{'、'.join(x['name'] for x in con)}）\n"
                "- 你必须保持中立，不表达你自己对辩题的立场，不替任何一方补论点。\n"
                "- 你可以用你的性格说话，但只做开场、控场、回应观众和最后的判定。\n"
                "- 输出 JSON 时多加一个字段 \"position\"，填 \"中立\"。")
    team, rivals = (pro, con) if m["side"] == "pro" else (con, pro)
    mine, other = (motion["pro"], motion["con"]) if m["side"] == "pro" else (motion["con"], motion["pro"])
    want = "支持辩题" if m["side"] == "pro" else "反对辩题"
    return (f"\n---\n\n## 本场是正式辩论，你是{m['title']}\n辩题：{motion['motion']}\n"
            f"你方主张：{mine}\n对方主张：{other}\n"
            f"队友：{'、'.join(x['title'] + x['name'] for x in team if x is not m) or '无'}；"
            f"对手：{'、'.join(x['title'] + x['name'] for x in rivals)}\n"
            f"- 你的分工：{duty_of(m, team)}\n"
            "- 你必须始终为你方主张辩护。即使你这个人物平时未必这么看，也要用你的知识和思想体系为这一方找最强的理由。\n"
            "- 本场规则覆盖通用规则里“被说服就让步”那一条：具体事实可以承认，但要说明为什么它推翻不了你方结论；阵营不能换。\n"
            "- 不要重复队友已经说过的论点，接着队友往下推进。\n"
            f"- 输出 JSON 时多加一个字段 \"position\"，这里必须填 \"{want}\"。")


def fake_motion(q):
    s = re.sub(r"[？?吗呢吧。\s]+$", "", q.strip())
    return {"motion": s, "pro": f"支持：{s}", "con": f"反对：{s}"}


def get_motion(cfg, question, ctx):
    if cfg is None:
        return fake_motion(question)
    try:
        d = json.loads(re.search(r"\{.*\}", E.chat(cfg, MOTION, f"辩题：{ctx}", want_json=True), re.S).group(0))
        if d.get("motion") and d.get("pro") and d.get("con"):
            return d
    except Exception:
        pass
    return fake_motion(question)


def position_of(raw):
    try:
        return str(json.loads(re.search(r"\{.*\}", raw, re.S).group(0)).get("position", ""))
    except Exception:
        return ""


def wrong_side(m, pos):
    return ("反对" in pos) if m["side"] == "pro" else ("支持" in pos) if m["side"] == "con" else False


def run_debate(question, brief, members, rounds, max_chars, emit, inbox, stop, dry, delay, save, pause=None, keep=None):
    """pause：用户暂停时置位，下一位发言前停住，期间照常回应用户；
    keep：结束后把成员、辩题、记录存进去，给结束后的追问用。"""
    ctx = question + (f"\n（用户开场时的补充说明：{brief}）" if brief else "")
    cfg = None if dry else E.load_config()
    pro, con, host = split_sides(members)
    motion = get_motion(cfg, question, ctx)
    for m in members:
        m["dsystem"] = m["system"] + debate_block(m, motion, pro, con)
    topic = f"{motion['motion']}（正方：{motion['pro']}；反方：{motion['con']}）" + (f"\n（用户补充：{brief}）" if brief else "")
    log = []
    count = {m["name"]: 0 for m in members}
    cur = {"round": 1}
    emit({"type": "start", "question": question, "rounds": rounds, "maxChars": max_chars, "debate": True,
          "motion": motion, "model": cfg["model"] if cfg else "试跑",
          "members": [{k: m[k] for k in ("name", "role", "personality", "side", "title")} for m in members]})

    def call(m, msg, fake, for_user=False):
        # 暂停时停在这里，期间用户的话照常回应
        while not for_user and pause is not None and pause.is_set() and not stop.is_set():
            handle_user(cur["round"])
            time.sleep(0.2)
        if stop.is_set():
            raise Stopped()
        emit({"type": "thinking", "name": m["name"]})
        if dry:
            time.sleep(delay)
            raw = json.dumps(fake, ensure_ascii=False)
        else:
            raw = E.chat(cfg, m["dsystem"], msg, want_json=True)
        if stop.is_set():
            raise Stopped()
        return E.parse_reply(raw), raw

    def speak(m, rnd, phase, task, target=None, answered=None):
        others = "、".join(f"{o['title']}{o['name']}" for o in members if o is not m)
        want = "支持辩题" if m["side"] == "pro" else "反对辩题" if m["side"] == "con" else "中立"
        fake = {"speech": f"（试跑）{m['title']}{m['name']}：第 {rnd} 轮{phase}。", "respondsTo": target,
                "stance": phase, "newPoint": True, "position": want,
                "challenge": "（试跑）请正面回答：你方的判断标准是什么？" if phase == "质询" else None,
                "challengeTarget": target if phase == "质询" else None}
        r, raw = call(m, E.full_message(topic, others, log, task), fake)
        check = "ok"
        if wrong_side(m, position_of(raw)):
            fix = (f"你刚才的发言站到了对方立场上。你是{m['title']}，必须{want}。"
                   f"按你方主张重新发言，任务不变：{task}")
            r, raw = call(m, E.full_message(topic, others, log, fix), fake)
            check = "mismatch" if wrong_side(m, position_of(raw)) else "corrected"
        entry = {"round": rnd, "name": m["name"], "side": m["side"], "title": m["title"], "phase": phase,
                 **{k: r.get(k) for k in ("speech", "respondsTo", "stance", "newPoint", "challenge", "challengeTarget")},
                 "answered": answered, "sideCheck": check}
        if phase == "质询":
            entry["challengeTarget"] = target
            entry["challenge"] = r.get("challenge") or r.get("speech")
        log.append(entry)
        count[m["name"]] += 1
        emit({"type": "speech", "entry": entry})
        return entry

    def handle_user(rnd):
        while not inbox.empty():
            u = inbox.get()
            # 点名就由被点名的人回答，没点名由主持人回答
            m = next((x for x in members if x["name"] == u.get("target")), None) or host \
                or min(pro + con, key=lambda x: count[x["name"]])
            log.append({"round": rnd, "name": "用户", "title": "观众", "speech": u["text"], "respondsTo": u.get("target"),
                        "stance": "插话", "newPoint": True, "challenge": None, "challengeTarget": None, "answered": None})
            others = "、".join(o["name"] for o in members if o is not m)
            how = "作为主持人中立地回应，再把话题拉回辩题" if m["side"] == "host" else "站在你方立场上回应，再把它和你方论点联系起来"
            task = f"观众刚才{'对你' if u.get('target') else '对全场'}说：“{u['text']}”。先直接回应观众（respondsTo 填“用户”），{how}。"
            r, _ = call(m, E.full_message(topic, others, log, task),
                        {"speech": f"（试跑）{m['name']} 回应你：“{u['text'][:20]}”。", "respondsTo": "用户",
                         "stance": "回应观众", "newPoint": True, "challenge": None, "challengeTarget": None},
                        for_user=True)
            entry = {"round": rnd, "name": m["name"], "side": m["side"], "title": m["title"], "phase": "回应观众",
                     **{k: r.get(k) for k in ("speech", "stance", "newPoint")},
                     "respondsTo": "用户", "challenge": None, "challengeTarget": None, "answered": None}
            log.append(entry)
            count[m["name"]] += 1
            emit({"type": "speech", "entry": entry, "toUser": True})

    def label(rnd):
        if rnd == 1:
            return "立论陈述"
        if rnd == rounds:
            return "总结陈词"
        return "交锋质询" + (f" {rnd - 1}" if rounds > 3 else "")

    def exchange(asker, answerer, rnd):
        handle_user(rnd)
        q = speak(asker, rnd, "质询",
                  f"交锋质询：向{answerer['title']}{answerer['name']}提一个具体、能正面回答的问题，"
                  f"直指对方论证中最薄弱的一环。challengeTarget 填“{answerer['name']}”。"
                  + ("抓住对方最新的说法，别重复前面问过的。" if rnd >= 3 else ""),
                  target=answerer["name"])
        handle_user(rnd)
        speak(answerer, rnd, "答辩",
              f"{asker['title']}{asker['name']}刚才质询你：“{q['challenge']}”。先正面回答这个问题，不许回避或转移；"
              "再用一句话把回答转回你方论点。respondsTo 填对方名字，challenge 填 null。",
              target=asker["name"], answered=asker["name"])

    def pick(team, k, start):
        return team[(k + start) % len(team)]

    for rnd in range(1, rounds + 1):
        cur["round"] = rnd
        emit({"type": "round", "round": rnd, "stage": label(rnd)})
        if rnd == 1:
            handle_user(rnd)
            if host:
                speak(host, rnd, "主持",
                      f"开场主持：宣布辩题“{motion['motion']}”，说明正方（{motion['pro']}）和反方（{motion['con']}）的持方，"
                      f"介绍双方辩手，说明流程：立论、{max(rounds - 2, 0)} 轮交锋质询、总结陈词（反方先、正方最后），"
                      f"每次发言不超过 {max_chars} 字。challenge 填 null。")
            else:
                emit({"type": "system", "text": f"辩题：{motion['motion']}｜正方：{motion['pro']}｜反方：{motion['con']}"})
            handle_user(rnd)
            speak(pro[0], rnd, "立论", "立论陈述：界定关键概念，提出你方的判断标准，给出两到三个主要论点。这一段不提问，challenge 填 null。")
            handle_user(rnd)
            speak(con[0], rnd, "立论", f"立论陈述：先用一两句话指出正方一辩{pro[0]['name']}立论里的漏洞，"
                                      "再界定关键概念，提出你方的判断标准，给出两到三个主要论点。challenge 填 null。",
                  target=pro[0]["name"])
        elif rnd < rounds:
            k = rnd - 2
            # 提问优先由二辩（下标 1）开始轮换，回答由一辩开始轮换
            pairs = [(pick(pro, k, 1), pick(con, k, 0)), (pick(con, k, 1), pick(pro, k, 0))]
            if k % 2:
                pairs.reverse()  # 两方轮流先问
            for a, b in pairs:
                exchange(a, b, rnd)
        else:
            for m in (con[-1], pro[-1]):  # 反方先总结，正方最后
                handle_user(rnd)
                speak(m, rnd, "总结", "总结陈词：梳理这场辩论里双方最关键的一两次交锋，指出对方没有回答好的质询，"
                                    "说明在你方的判断标准下为什么你方胜出。不再提出新论点，challenge 填 null。")
    handle_user(rounds)

    judge = host["name"] if host else "中立裁判"
    emit({"type": "summarizing", "text": f"{judge}正在评判…"})
    full = "\n".join(f"第{x['round']}轮 {x.get('title', '')}{x['name']}（{x.get('phase', x.get('stance'))}）：{x['speech']}"
                     for x in log)
    if dry:
        verdict = {"winner": "平局", "proScore": 80, "conScore": 80, "reason": "（试跑模式）没有调用模型。",
                   "unanswered": [], "consensus": [], "disagreements": [], "openQuestions": [],
                   "summary": "（试跑模式）双方各自完成了立论、质询、答辩和总结。"}
    else:
        system = (host["system"] + "\n---\n\n" + JUDGE) if host else JUDGE
        raw = E.chat(cfg, system, f"辩题：{topic}\n\n辩论记录：\n{full}", want_json=True)
        try:
            verdict = json.loads(re.search(r"\{.*\}", raw, re.S).group(0))
        except Exception:
            verdict = {"winner": "未判定", "summary": raw.strip()}
    verdict["judge"] = judge
    emit({"type": "summary", "text": verdict.get("summary", ""), "verdict": verdict})
    if keep is not None:
        keep.update(members=members, topic=topic, log=log, count=count, cfg=cfg, rounds=rounds, host=host,
                    system_key="dsystem", debate=True,
                    verdict=f"裁判判定：{verdict.get('winner', '')}。{verdict.get('reason', '')}")
    if dry:
        return None
    return save({"question": question, "brief": brief, "motion": motion, "model": cfg["model"],
                 "members": [{k: m[k] for k in ("name", "role", "personality", "side", "title")} for m in members],
                 "rounds": rounds, "maxChars": max_chars, "log": log, "verdict": verdict})

