# 人格数据库

按《人格数据库与讨论模式规范》v1.0 整理。人物资料只描述角色知道什么、从什么角度想问题；性格由用户在讨论时挑选；讨论流程（发言顺序、轮次、上下文读取、结束条件）由讨论引擎统一决定。三者都不互相写死。

## 目录

| 路径 | 内容 |
| --- | --- |
| [人物模板.json](人物模板.json) | 人物资料包的统一模板，新人物照着填写 |
| [性格库/性格.json](性格库/性格.json) | 8 个性格，每个包含讨论做法和说话语气；每个人物选 1 个 |
| 人物/理性/ | 理性讨论人物 |
| 人物/娱乐/ | 娱乐讨论人物（待添加） |
| [校验.py](校验.py) | 检查人物文件是否符合提交清单 |
| [提示词/](提示词/使用说明.md) | 由 JSON 生成的角色、性格提示词，调用模型时使用 |
| [生成提示词.py](生成提示词.py) | 修改 JSON 后运行，重新生成 提示词/ 下的文件 |
| [组装提示词.py](组装提示词.py) | 按选中的人物和性格拼出完整的系统提示词 |
| [讨论引擎.py](讨论引擎.py) | 输入一个问题，让选中的人物调用大模型讨论，最后由主持人总结 |
| [模型配置.示例.json](模型配置.示例.json) | 复制并改名为 模型配置.json，填写模型地址和 API Key；不建这个文件时，用 frontend/.env.local 里的 ROUNDTABLE_* |
| [服务.py](服务.py) | 网页服务：给前端「理性讨论」模式提供 /api/options、/api/discuss |

## 一个发言者由两部分组成

- **角色**（人物 JSON：identity、knowledge、worldview、reasoning）：决定知识面、看问题的角度、坚持什么。角色文件里不写任何语气、态度和台词。
- **性格**（性格库，用户挑 1 个）：决定讨论中的做法和语气，比如冷静较真、毒舌。

角色没有默认性格，任何角色都能搭配任何性格。性格不能覆盖角色的思想体系和知识边界，冲突时以角色为准。

## 现有理性人物

| 人物 | 角色 | 思想体系 | 看问题的角度 |
| --- | --- | --- | --- |
| 老苏 | 追问者 | 苏格拉底式哲学 | 关键词的定义是否清楚 |
| 阿澜 | 直觉派 | 数学直觉主义与探究式学习 | 具体例子和图像，推到无穷会怎样 |
| K | 逻辑家 | 分析哲学与批判性思维 | 论证的每一步是否成立 |
| 灰先生 | 怀疑者 | 皮浪主义与笛卡尔式怀疑 | 我们凭什么知道 |
| 南姐 | 现实派 | 实用主义与关怀伦理 | 对具体的人有什么影响 |

## 字段统一说明

规范中不同章节的字段名不一致，本库统一为：

- 知识：`knowledge.domains / strong / weak / sourcePreference`（规范第 3 节写作 strongKnowledge、weakKnowledge）
- 思想体系：`worldview.tradition / coreValues / valuePriority / assumptions / judgmentFocus / blindSpots`（第 7 节写作 basicAssumptions）
- 另外补充了 `worldview.conflictRule`（价值冲突时怎么取舍）和 `reasoning.canChallenge / partialAgreement / openingMove / coreConviction / thinkingHabits`（反对什么、部分同意时怎么处理、开场切入点、核心信念、专业带来的思考习惯），对应规范第 6 节和第 10 节的要求。
- 规范里的 `personality` 区（默认性格、默认风格、示例台词）已取消，改由用户在讨论时选择。
- 文件顶层只有 `persona`；`session`、`runtime`、`result` 由引擎生成。

## 避免重复

- `tags` 只写检索话题；模式写在 `modes`，细分领域写在 `knowledge.domains`，`fields` 只写大类。
- `valuePriority` 和 `coreValues` 是同一组词，只是顺序不同。
- 常问的问题写进 `judgmentFocus`，反驳手法写进 `identity.responsibilities`，不另设字段。
- `thinkingHabits` 只写由专业带来的思考动作，不写语气；语气全部交给性格库。
- `visual.defaultLabel` 与 `identity.role` 内容相同，但规范把它列为必填，所以保留。

早期的 Markdown 草稿已移到工作目录的 `work/旧草稿/`，以本目录的 JSON 为准。

## 校验

```
python 校验.py              # 校验 人物/ 下所有文件
python 校验.py 某人物.json  # 校验单个文件
```

会检查必填字段、id 格式和唯一性、核心价值数量、颜色格式，确认人物文件里没有预设性格，并提醒人物资料里是否混入了流程相关的词。
