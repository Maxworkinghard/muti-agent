"""把 通用规则 + 角色 + 性格 拼成一段系统提示词。

用法：
  python 组装提示词.py 灰先生 --性格 毒舌 --字数 200
  python 组装提示词.py 灰先生 --性格 冷幽默 -o 输出.md

角色没有默认性格，每次都必须指定 1 个。

在程序里调用：
  from 组装提示词 import build
  system_prompt = build("灰先生", "毒舌")
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
P = ROOT / "提示词"


def _load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def _find_persona(name):
    for f in (ROOT / "人物").rglob("*.json"):
        p = _load(f)["persona"]
        if name in (p["name"], p["id"], f.stem):
            return p, f.relative_to(ROOT / "人物").with_suffix(".md")
    raise SystemExit("找不到人物：" + name)


def build(name, personality, max_chars=150):
    persona, role_path = _find_persona(name)
    lib = _load(ROOT / "性格库" / "性格.json")["personalities"]
    if not personality:
        raise SystemExit(f"请为 {persona['name']} 选择性格，角色没有默认值。")
    hit = next((s for s in lib if personality in (s["name"], s["id"])), None)
    if not hit:
        raise SystemExit(f"性格不存在：{personality}。可选：{'、'.join(s['name'] for s in lib)}")

    parts = [(P / "通用规则.md").read_text(encoding="utf-8").replace("{{字数上限}}", str(max_chars)),
             (P / "角色" / role_path).read_text(encoding="utf-8"),
             (P / "性格" / (hit["name"] + ".md")).read_text(encoding="utf-8")]
    return "\n---\n\n".join(parts)


def main():
    ap = argparse.ArgumentParser(description="组装人物系统提示词")
    ap.add_argument("人物")
    ap.add_argument("--性格", dest="personality", required=True)
    ap.add_argument("--字数", type=int, default=150, dest="max_chars")
    ap.add_argument("-o", dest="out")
    a = ap.parse_args()
    text = build(a.人物, a.personality, a.max_chars)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        print("已保存到", a.out)
    else:
        print(text)


if __name__ == "__main__":
    main()
