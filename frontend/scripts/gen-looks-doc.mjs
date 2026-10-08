// 从 src/mc/avatar/looks.ts 生成 docs/art/02-character-looks.md：33 个人物的 Q 版造型推导、每个字段的来源（原设定 / 推断）、
// 调色板、轮廓特征，以及零件库数量和搭配约束。造型改了以后重新运行：node scripts/gen-looks-doc.mjs
import fs from 'node:fs';
import { createServer } from 'vite';
const vite = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const [{ LOOKS }, { HAIR_LABEL }, { resolveLook }, { LIBRARY_PERSONAS }, { RATIONAL_PERSONAS }, rig, body] = await Promise.all([
    vite.ssrLoadModule('/src/mc/avatar/looks.ts'), vite.ssrLoadModule('/src/mc/avatar/hair.ts'), vite.ssrLoadModule('/src/mc/avatar/resolve.ts'),
    vite.ssrLoadModule('/src/data/personas.ts'), vite.ssrLoadModule('/src/data/rationalPersonas.ts'), vite.ssrLoadModule('/src/mc/avatar/rig.ts'),
    vite.ssrLoadModule('/src/mc/avatar/body.ts')]);
  const personas = new Map([...LIBRARY_PERSONAS, ...RATIONAL_PERSONAS].map(p => [p.id, p]));
  const L = {
    eyes: { round: '圆眼', sharp: '锐眼（外眼角上挑）', droopy: '下垂眼', sleepy: '睡眼', sparkle: '亮晶晶的眼', narrow: '细长眼' },
    brows: { soft: '柔眉', straight: '平眉', thick: '粗眉', arched: '挑眉', worried: '八字眉', sharp: '剑眉' },
    mouth: { smile: '浅笑', flat: '抿嘴', cat: '猫嘴', smirk: '歪嘴笑', grin: '露齿笑', small: '小嘴' },
    expr: { neutral: '默认', happy: '开心', surprised: '惊讶', thinking: '思考', angry: '生气', shy: '害羞' },
    top: { tee: 'T 恤', shirt: '衬衫', sweater: '毛衣', hoodie: '连帽卫衣', turtleneck: '高领衫', blouse: '罩衫', polo: 'Polo 衫' },
    outer: { cardigan: '开衫', blazer: '西装外套', jacket: '夹克', coat: '系腰带长风衣', vest: '马甲', zip: '拉链外套', varsity: '棒球服', apron: '围裙', overalls: '背带裤' },
    bottom: { pants: '长裤', jeans: '牛仔裤', shorts: '短裤', skirt: '百褶裙', cargo: '工装裤' },
    shoes: { sneakers: '球鞋', boots: '短靴', loafers: '乐福鞋', slippers: '拖鞋' },
    acc: { glasses: '方框眼镜', roundGlasses: '圆框眼镜', headphones: '头戴耳机', neckphones: '挂脖耳机', headset: '单耳耳麦', beanie: '毛线帽', cap: '棒球帽', beret: '贝雷帽', hood: '兜帽', scarf: '围巾', tie: '领带', bowtie: '领结', ribbon: '蝴蝶结', clip: '发夹', bow: '大发结', pen: '耳后一支笔', beard: '胡子', watch: '手表', ahoge: '呆毛', earring: '耳钉', goggles: '护目镜', monocle: '单片眼镜', shawl: '披肩', necklace: '项链', shoulderBag: '挎包', waistBag: '腰包', backpack: '背包', charm: '挂件', pin: '胸针', tool: '工具', headband: '发带', flower: '花饰' },
    pattern: { plain: '素色', stripe: '条纹', plaid: '格纹', knit: '针织' },
    mark: { blush: '腮红', freckles: '雀斑', sweat: '汗滴', mole: '痣' },
  };
  const basisName = b => ({ config: '原设定', inferred: '推断', request: '用户要求（配置标记，需回查确认）' })[b] ?? '—';
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const near = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 30; };
  /** 主色：头发、上衣、外套、下装、鞋、带颜色的配件；相近的颜色（RGB 距离 < 30）算一个。皮肤不算。 */
  const palette = look => { const r = resolveLook(look).look, cs = [r.hair.color, r.hair.tie, r.top.color, r.outer?.color, r.bottom.color, r.shoes.color, ...r.acc.filter(a => a.color && !['ahoge', 'beard'].includes(a.kind)).map(a => a.color)].filter(Boolean), out = [];
    for (const c of cs) if (!out.some(o => near(o, c))) out.push(c); return out; };
  const silhouette = look => { const r = resolveLook(look), b = body.makeBody(look.body.type, look.body.head); return [body.BODY[b.type].label, body.HEAD_SHAPES[b.shape].label + '头型', body.SIT_LABEL[look.body.sit], HAIR_LABEL[r.look.hair.style], r.hood ? '兜帽' : r.hat ? L.acc[r.hat] : '', r.phones ? L.acc[{ head: 'headphones', neck: 'neckphones', set: 'headset' }[r.phones]] : '', r.look.outer ? L.outer[r.look.outer.kind] : L.top[r.look.top.kind], L.bottom[r.look.bottom.kind], ...['ahoge', 'beard', 'scarf', 'bow'].filter(k => r.has(k)).map(k => L.acc[k])].filter(Boolean).join(' + '); };
  const groups = [['情绪陪伴组', ['jie-mo', 'hao-hao', 'leng-cui', 'fu-du-ji', 'shu-dong', 'nuan-bao-bao', 'pao-zhang']],
    ['娱乐组（宿舍室友 + 播客主持）', ['ent-affirmer-001', 'ent-cold-observer-001', 'ent-contrarian-001', 'ent-counter-contrarian-001', 'ent-imagination-001', 'ent-life-friend-001', 'ent-normal-001', 'podcast-host-amai']],
    ['产品研发组', ['ji-mu', 'suan-pan', 'fang-da-jing', 'ban-shou', 'zhao-yao-jing', 'nao-zhong', 'pin-tu', 'chi-lun', 'tiao-se-pan', 'bu-chong-wang', 'mie-huo-qi', 'la-ba', 'gang-bi']],
    ['理性辩论组', ['math-intuitionist-001', 'skeptic-001', 'socratic-questioner-001', 'pragmatic-philosopher-001', 'logic-analyst-001']]];
  const listed = groups.flatMap(g => g[1]), missing = Object.keys(LOOKS).filter(id => !listed.includes(id));
  if (missing.length) throw new Error('分组里漏了：' + missing.join(','));
  const T = rig.T, R = rig.RIG;
  let md = `# 33 个人物的 Q 版造型：推导与依据

> 当前造型配置说明，由 \`scripts/gen-looks-doc.mjs\` 从 \`looks.ts\`、\`rig.ts\`、\`body.ts\` 生成，不要手改。此文记录实现，不代表视觉验收通过；验收定义见根目录 [VERIFY.md](../../../VERIFY.md)。
> 每个人的造型是按人物 id 写死的静态配置（没有随机数、没有按 id 哈希挑衣服），推导顺序：设定 → 气质 → 特征 → 发型 → 服装 → 配色 → 表情和姿态倾向。
> 字段来源沿用配置中的标记：**原设定** = 人物文件已有；**推断** = Agent 补充；**用户要求** = 配置标为 request，须回查原始确认记录，不能凭此认定整套造型已获认可。
> 设定原文见 \`00-roster.md\`。

## 1. 基准骨架与实际体型

以下数值来自 \`rig.ts\` 的基准骨架。实际人物经 \`body.makeBody()\` 使用各自的体型和头型；基准数值不是所有人的统一尺寸，也不是全项目的永久美术规范。

| 项 | 数值 |
|---|---|
| 单位 | 1 T = 1/48 米 = 贴图 1 像素 |
| 头 | ${R.head.w}×${R.head.h}×${R.head.d} T，基准缩放 ${rig.HEAD_SCALE} 倍（头上 1 像素 ≈ ${rig.HEAD_SCALE} T） |
| 躯干 | ${R.torso.w}×${R.torso.h}×${R.torso.d} T |
| 腿 | 宽 ${R.leg.w}、深 ${R.leg.d}；大腿 ${R.leg.thigh} T、小腿 ${R.leg.shin} T（含鞋 ${R.leg.shoe} T） |
| 胳膊 | ${R.arm.w}×${R.arm.h}×${R.arm.d} T |
| 身高（不含头发） | ${(rig.HEAD_TOP * T).toFixed(2)} 米；头 : 身 = ${(R.head.h * rig.HEAD_SCALE).toFixed(1)} : ${rig.NECK_Y} ≈ 1 : ${(rig.NECK_Y / (R.head.h * rig.HEAD_SCALE)).toFixed(2)} |
| 统一座面高 | ${rig.SEAT_H} 米；坐下根点下沉 ${rig.SIT_DROP.toFixed(3)} 米；大腿水平、小腿竖直，鞋底正好落在地面 |
| 眼高 | 站 ${rig.EYE_STAND.toFixed(3)} 米；坐（座位锚点以上）${rig.EYE_SIT.toFixed(3)} 米 |

基准坐姿膝轴到脚底为座面高加半个腿厚（${rig.SEAT_H} + ${(R.leg.d / 2 * T).toFixed(3)} 米）；实际人物的坐姿由 \`body.sitPose()\` 推导，不沿用历史样板的 1:1.3–1:1.5 比例。当前各体型尺寸如下（不含头发）：

| 体型 | 头型 | 身高（米） | 全高 / 头高 |
|---|---|---|---|
${Object.keys(body.BODY).map(type => { const b = body.makeBody(type); return `| ${body.BODY[type].label} | ${body.HEAD_SHAPES[b.shape].label} | ${(b.headTop * T).toFixed(3)} | ${(b.headTop / (rig.HEAD.h * b.head.scale[1])).toFixed(2)} |`; }).join('\n')}

## 2. 零件库和搭配约束

零件库（\`src/mc/avatar/types.ts\`、\`hair.ts\`）：

| 类 | 数量 | 零件 |
|---|---|---|
| 发型 | ${Object.keys(HAIR_LABEL).length} | ${Object.values(HAIR_LABEL).join('、')} |
| 体型 | ${Object.keys(body.BODY).length} | ${Object.values(body.BODY).map(b => b.label).join('、')} |
| 头型 | ${Object.keys(body.HEAD_SHAPES).length} | ${Object.values(body.HEAD_SHAPES).map(h => h.label).join('、')} |
| 坐姿 | ${Object.keys(body.SIT_LABEL).length} | ${Object.values(body.SIT_LABEL).join('、')} |
| 眼型 | ${Object.keys(L.eyes).length} | ${Object.values(L.eyes).join('、')} |
| 眉型 | ${Object.keys(L.brows).length} | ${Object.values(L.brows).join('、')} |
| 默认嘴型 | ${Object.keys(L.mouth).length} | ${Object.values(L.mouth).join('、')} |
| 表情 | ${Object.keys(L.expr).length} | ${Object.values(L.expr).join('、')}（另有说话三帧口型、眨眼） |
| 上衣 | ${Object.keys(L.top).length} | ${Object.values(L.top).join('、')} |
| 外套 / 外层 | ${Object.keys(L.outer).length} | ${Object.values(L.outer).join('、')} |
| 下装 | ${Object.keys(L.bottom).length} | ${Object.values(L.bottom).join('、')} |
| 鞋 | ${Object.keys(L.shoes).length} | ${Object.values(L.shoes).join('、')} |
| 配饰 | ${Object.keys(L.acc).length} | ${Object.values(L.acc).join('、')} |
| 花纹 | ${Object.keys(L.pattern).length} | ${Object.values(L.pattern).join('、')} |
| 脸上标记 | ${Object.keys(L.mark).length} | ${Object.values(L.mark).join('、')} |

搭配约束（\`src/mc/avatar/resolve.ts\`，冲突时按固定规则让步）：

1. 帽子（毛线帽 / 棒球帽 / 贝雷帽）或兜帽：头顶的发冠压薄成一层，头顶的发髻、丸子、呆毛、尖刺、飞机头、卷团去掉。
2. 兜帽戴上：两侧和后面的头发、马尾都收进兜帽里，只留刘海；同时不戴帽子，头戴耳机改挂脖子。
3. 头戴耳机 + 丸子头 / 双马尾 / 头顶发髻：耳机挪到脖子上。
4. 眼镜：刘海下沿不低于镜框上沿，不盖住镜片。
5. 长发或马尾垂到背上：卫衣背后的帽兜堆去掉（被头发盖住，避免穿插）；长发和马尾挂在后脑勺正下方，坐下时落在椅背后面，不穿过椅背和后背。
6. 围巾：领带、领结、蝴蝶结让给围巾；挂脖耳机也去掉。
7. 裙子 + 长外套：外套下摆去掉（只到腰）。
8. 背带裤：下装颜色跟背带裤走；裙子改成裤子。
9. 胡子：平时嘴是胡子底下一条缝，说话时露出口型。

## 3. 轮廓区分

下表按当前配置列出体型、头型、坐姿、发型、头饰、外层和下装的组合。这是数据层区分，不能据此声称实际画面中的人物辨识度或视觉质量已验收。

| 轮廓 | 人物 |
|---|---|
`;
  const sil = new Map(); for (const id of listed) { const k = silhouette(LOOKS[id]); sil.set(k, [...(sil.get(k) ?? []), LOOKS[id].name]); }
  for (const [k, names] of [...sil].sort((a, b) => a[0].localeCompare(b[0], 'zh'))) md += `| ${k} | ${names.join('、')}${names.length > 1 ? '（⚠ 轮廓相同）' : ''} |\n`;
  const dup = [...sil.values()].filter(n => n.length > 1);
  md += `\n${dup.length ? `⚠ 有 ${dup.length} 组轮廓完全相同，需要再拉开。` : `33 个人的轮廓组合两两不同（${sil.size} 种）。`}\n\n## 4. 逐人造型\n\n每人一节：设定摘要、推导、字段表（值 + 来源）、调色板（主色，不含肤色；相近色算一个）、搭配约束触发了哪些让步。\n`;
  for (const [title, ids] of groups) {
    md += `\n### ${title}\n`;
    for (const id of ids) {
      const look = LOOKS[id], p = personas.get(id), res = resolveLook(look), b = look.basis, pal = palette(look);
      const acc = look.acc.map(a => L.acc[a.kind] + (a.color ? ` \`${a.color}\`` : '')).join('、') || '—';
      md += `\n#### ${look.name}（\`${id}\`）\n\n`;
      md += `- 设定：${p ? p.identity : '（人物库里没有这个 id）'}\n- 推导：${look.why}\n\n`;
      md += `| 字段 | 值 | 来源 |\n|---|---|---|\n`;
      md += `| 肤色 | \`${look.skin}\` | ${basisName(b.skin)} |\n`;
      const actualBody = body.makeBody(look.body.type, look.body.head);
      md += `| 体型 / 头型 / 坐姿 | ${body.BODY[actualBody.type].label} / ${body.HEAD_SHAPES[actualBody.shape].label} / ${body.SIT_LABEL[look.body.sit]}；身高 ${(actualBody.headTop * T).toFixed(3)} 米 | ${basisName(b.body)} |\n`;
      md += `| 发色 | \`${look.hair.color}\`${look.hair.tie ? `（发圈 \`${look.hair.tie}\`）` : ''} | ${basisName(b.hairColor)} |\n`;
      md += `| 发型 | ${HAIR_LABEL[look.hair.style]}（${look.hair.style}） | ${basisName(b.hairStyle)} |\n`;
      md += `| 五官 | ${L.eyes[look.face.eyes]}、${L.brows[look.face.brows]}、${L.mouth[look.face.mouth]}，瞳色 \`${look.face.iris}\`${look.face.marks?.length ? '，' + look.face.marks.map(m => L.mark[m]).join('、') : ''} | ${basisName(b.eyes)} |\n`;
      md += `| 上衣 | ${L.top[look.top.kind]} \`${look.top.color}\`${look.top.pattern && look.top.pattern !== 'plain' ? '，' + L.pattern[look.top.pattern] : ''} | ${basisName(b.top)} |\n`;
      md += `| 外层 | ${look.outer ? `${L.outer[look.outer.kind]} \`${look.outer.color}\`` : '—'} | ${look.outer ? basisName(b.outer) : '—'} |\n`;
      md += `| 下装 | ${L.bottom[res.look.bottom.kind]} \`${res.look.bottom.color}\`${look.bottom.socks ? `，长袜 \`${look.bottom.socks}\`` : ''} | ${basisName(b.bottom)} |\n`;
      md += `| 鞋 | ${L.shoes[look.shoes.kind]} \`${look.shoes.color}\` | ${basisName(b.shoes)} |\n`;
      md += `| 配饰 | ${acc} | ${basisName(b.acc)} |\n`;
      md += `| 表情 / 姿态倾向 | 默认${L.expr[look.tendency.expression]}；手势 ×${look.tendency.gesture}；坐姿${look.tendency.lean > 0 ? '前倾 ' + look.tendency.lean : look.tendency.lean < 0 ? '后靠 ' + (-look.tendency.lean) : '端正'}；${look.tendency.tilt ? '歪头 ' + look.tendency.tilt : '不歪头'} | ${basisName(b.tendency)} |\n`;
      md += `| 调色板（${pal.length} 色） | ${pal.map(c => '`' + c + '`').join(' ')}${pal.length > 5 ? ' ⚠ 超过 5 色' : ''} | ${basisName(b.palette)} |\n`;
      md += `| 轮廓 | ${silhouette(look)} | — |\n`;
      if (res.notes.length) md += `\n搭配约束让步：${res.notes.join('；')}。\n`;
    }
  }
  fs.writeFileSync('docs/art/02-character-looks.md', md);
  console.log('docs/art/02-character-looks.md', listed.length, 'looks,', sil.size, 'silhouettes,', dup.length, 'duplicates');
} finally { await vite.close(); }
