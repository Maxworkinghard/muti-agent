# -*- coding: utf-8 -*-
"""人物资料包校验脚本，对应《人格数据库与讨论模式规范》第 16 节提交清单。
用法：python 校验.py            校验 人物/ 下所有 json
      python 校验.py 文件.json  校验单个文件
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).parent
REQUIRED = {
    "": ["id", "name", "description", "version", "tags", "modes", "identity", "knowledge",
         "worldview", "boundaries", "visual"],
    "identity": ["role", "profession", "fields", "responsibilities", "originType"],
    "knowledge": ["domains", "strong", "weak", "sourcePreference"],
    "worldview": ["tradition", "coreValues", "valuePriority", "assumptions", "judgmentFocus", "blindSpots"],
    "boundaries": ["uncertaintyPolicy", "factOpinionPolicy", "sourcePolicy", "safetyLimits"],
    "visual": ["avatar", "color", "icon", "defaultLabel"],
}
RATIONAL_EXTRA = {"reasoning": ["canChallenge", "partialAgreement", "openingMove", "coreConviction"]}
# 性格由用户在讨论时挑选，人物文件里不能预设
FORBIDDEN = ["personality", "selectedTraits", "personalityOptions", "communicationStyle", "sampleLines", "traitBehaviors"]
ENGINE_WORDS = ["轮流", "第几轮", "下一位", "发言顺序", "读取几条", "几条消息", "nextSpeaker", "turnOrder", "round"]


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def empty(v):
    return v is None or v == "" or v == [] or v == {}


def check(path, seen):
    errs, warns = [], []
    data = load(path)
    if "persona" not in data:
        return ["缺少 persona 区"], warns
    for k in ("session", "runtime", "result"):
        if k in data:
            errs.append(f"人物文件不应包含 {k} 区，这部分由讨论引擎生成")
    p = data["persona"]
    req = dict(REQUIRED)
    if "rational" in p.get("modes", []):
        req.update(RATIONAL_EXTRA)
        req[""] = req[""] + ["reasoning"]
    for grp, fields in req.items():
        obj = p if grp == "" else p.get(grp, {})
        for f in fields:
            if empty(obj.get(f)):
                errs.append(f"缺少或为空：{(grp + '.') if grp else ''}{f}")
    pid = p.get("id", "")
    if pid:
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", pid):
            errs.append(f"id 格式应为小写英文加连字符：{pid}")
        if pid in seen:
            errs.append(f"id 重复：{pid}（另见 {seen[pid]}）")
        seen[pid] = path.name
    wv = p.get("worldview", {})
    n = len(wv.get("coreValues", []))
    if n and not 3 <= n <= 7:
        errs.append(f"coreValues 应为 3 到 7 个，现在是 {n} 个")
    text = json.dumps(p, ensure_ascii=False)
    for k in FORBIDDEN:
        if f'"{k}"' in text:
            errs.append(f"人物文件不应包含 {k}：性格由用户在讨论时选择")
    color = p.get("visual", {}).get("color", "")
    if color and not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        errs.append(f"color 格式应为 #RRGGBB：{color}")
    for w in ENGINE_WORDS:
        if w in text:
            warns.append(f"出现流程相关词“{w}”，请确认没有把讨论流程写进人物资料")
    return errs, warns


def main():
    files = [Path(a) for a in sys.argv[1:]] or sorted((ROOT / "人物").rglob("*.json"))
    seen, bad = {}, 0
    for f in files:
        try:
            errs, warns = check(f, seen)
        except json.JSONDecodeError as e:
            errs, warns = [f"JSON 格式错误：{e}"], []
        status = "通过" if not errs else "未通过"
        print(f"[{status}] {f.relative_to(ROOT) if f.is_relative_to(ROOT) else f}")
        for e in errs:
            print("   错误：", e)
        for w in warns:
            print("   提醒：", w)
        bad += bool(errs)
    print(f"\n共 {len(files)} 个文件，{len(files) - bad} 个通过，{bad} 个未通过")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
