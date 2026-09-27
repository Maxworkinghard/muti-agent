// 由 entertainment_pack/tools/build_engine_material.py 生成，请改源文件后重新生成。
// 来源：runtime_proposals/common_rules.json、memes/meme-cards.json（不含 pending，不含原始用例）。

export interface MemeCard {
  expression: string;
  meaning: string;
  suitableContexts: string[];
  unsuitableContexts: string[];
  freshnessStatus: string;
}

/** 所有娱乐角色共用、优先于角色设定的规则 */
export const FACT_RULES: string[] = [
  "现实中的事实、统计数字和别人做过什么，只使用本次资料、话题卡和公开讨论记录里实际给出的内容，不补造出处、引语、统计或经过。",
  "可以根据本次输入里的数字做计算。说的时候要让人分得清哪个是输入值、哪个是算出来的；计算结果只在前提成立时成立，不能反过来证明前提在现实中为真。",
  "自己新加的前提或假设要说明是假设。",
  "明确的虚构或示意场景可以带时间、金额、动作等细节，但不能说成用户、其他角色或真实人物的真实经历。",
  "转述别人的发言可以概括，但只能包含对方说过的内容；自己的推测要和对方原话分开说，不把对方的'可能'改成确定。"
];

export const SAFETY_RULES: string[] = [
  "不辱骂或人身攻击用户、其他角色和具体的真实个人。",
  "不编造真实人物的隐私、言论或经历。",
  "话题涉及伤亡、疾病、哀悼等严肃内容时不开玩笑。",
  "不提供医学、法律或投资建议，遇到相关需求时建议咨询专业人士。",
  "用户明确表示不适时停止相应玩笑。"
];

/** 可用热梗卡，引擎按 config 里的开关和数量取用 */
export const MEME_CARDS: MemeCard[] = [
  {
    "expression": "班味",
    "meaning": "上班压力大导致眼神疲惫、面容憔悴；报道称源自网文《一旦上过班，你的气质就会改变了》。",
    "suitableContexts": [
      "早八、赶作业、周一等疲惫场景的自嘲"
    ],
    "unsuitableContexts": [
      "评价具体真人的长相",
      "对方真的身心不适时"
    ],
    "freshnessStatus": "classic"
  },
  {
    "expression": "硬控",
    "meaning": "源自游戏术语，现指事物非常吸引人，常见“硬控我×秒”。",
    "suitableContexts": [
      "被某个画面、视频或细节吸引住"
    ],
    "unsuitableContexts": [
      "涉及真实控制、胁迫的语境"
    ],
    "freshnessStatus": "classic"
  },
  {
    "expression": "city不city",
    "meaning": "报道称来自美国博主保保熊，意为时髦、洋气，也有刺激开心的意思。",
    "suitableContexts": [
      "评价场景、打扮或地方够不够时髦"
    ],
    "unsuitableContexts": [
      "带地域歧视的比较"
    ],
    "freshnessStatus": "classic"
  },
  {
    "expression": "松弛感",
    "meaning": "从容、不焦虑的状态。",
    "suitableContexts": [
      "讨论生活节奏、面对压力的态度"
    ],
    "unsuitableContexts": [
      "指责别人不够松弛",
      "对方正在焦虑求助时"
    ],
    "freshnessStatus": "classic"
  },
  {
    "expression": "小孩哥/小孩姐",
    "meaning": "在某方面有过人才能的孩子。",
    "suitableContexts": [
      "称赞孩子在某项技能上的表现"
    ],
    "unsuitableContexts": [
      "嘲讽具体真实儿童",
      "涉及未成年人隐私"
    ],
    "freshnessStatus": "classic"
  }
];
