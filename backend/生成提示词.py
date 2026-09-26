"""把人物 JSON 和性格库编译成提示词文件。修改 JSON 后重新运行本脚本。

用法：python 生成提示词.py
输出：提示词/角色/*.md、提示词/性格/*.md
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "提示词"
LEVEL = {"低": "少用口语，偏书面", "中": "书面和口语各半", "高": "口语化，像当面聊天"}
METAPHOR = {"少": "很少用比喻", "中": "偶尔用比喻", "多": "经常用比喻和类比"}
LENGTH = {"短": "句子短，一句话只说一件事", "中": "句子长短适中", "长": "可以用较长的句子，把来龙去脉讲清楚"}


def bullets(items):
    return "\n".join("- " + x for x in items)


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def role_md(p):
    i, k, w, r, b = p["identity"], p["knowledge"], p["worldview"], p["reasoning"], p["boundaries"]
    habits = ("\n\n你的专业带来的思考习惯：\n\n" + bullets(r["thinkingHabits"])) if r.get("thinkingHabits") else ""
    return f"""# {p['name']}（{i['role']}）

你是{p['name']}，讨论中的{i['role']}，身份是{i['profession']}。{p['description']}。

这份资料只决定你知道什么、从什么角度看问题、坚持什么。你的态度和说话方式由后面的性格决定。

## 你在讨论中负责

{bullets(i['responsibilities'])}

## 你的知识

你熟悉：{'、'.join(k['domains'])}。

你特别擅长：

{bullets(k['strong'])}

你不擅长下面这些方面。话题进入这些领域时，不要跟着别人用专业术语下判断，改用你擅长的方式参与（比如追问、举例、指出前提），并说明这不是你的专长：

{bullets(k['weak'])}

你偏好的证据：{'、'.join(k['sourcePreference'])}。

## 你的思想体系

你的立场来自{w['tradition']}。

你看重的价值，按优先顺序是：{' > '.join(w['valuePriority'])}。{w['conflictRule']}

你的基本看法：

{bullets(w['assumptions'])}

判断一个观点时，你先检查：

{bullets(w['judgmentFocus'])}

你知道自己的盲点。别人指出时要承认，不要硬撑：

{bullets(w['blindSpots'])}

## 你怎么反对，怎么同意

你擅长反对这些观点：

{bullets(r['canChallenge'])}

部分同意时，你的做法：{r['partialAgreement']}

你的核心信念：{r['coreConviction']}只有遇到直接击中它的理由才让步；让步时只让出被击中的那一部分，并继续守住其余部分。

讨论开场时你的做法：{r['openingMove']}{habits}

## 边界

- {b['uncertaintyPolicy']}
- {b['factOpinionPolicy']}
- {b['sourcePolicy']}
{bullets(b['safetyLimits'])}
"""


def personality_md(s):
    return f"""# 性格：{s['name']}

{s['description']}

讨论时的做法：

{bullets(s['behaviors'])}

说话方式：

- {LENGTH[s['sentenceLength']]}。
- {LEVEL[s['colloquial']]}。
- {METAPHOR[s['usesMetaphor']]}。
- 口头习惯，可以偶尔用，不要每次都用：{'；'.join('“' + h + '”' for h in s['habits'])}
- 小毛病，适度体现，不要夸张：{s['flaw']}

每次发言都必须做到：

{bullets(s['mustDo'])}

性格不改变你的观点、价值判断和知识边界，但要在每次发言里听得出来：别人不看名字，也应该能认出是你在说话。
"""


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("写入", path.relative_to(ROOT))


def main():
    for f in sorted((ROOT / "人物").rglob("*.json")):
        p = load(f)["persona"]
        write(OUT / "角色" / f.relative_to(ROOT / "人物").with_suffix(".md"), role_md(p))
    for s in load(ROOT / "性格库" / "性格.json")["personalities"]:
        write(OUT / "性格" / (s["name"] + ".md"), personality_md(s))


if __name__ == "__main__":
    main()
