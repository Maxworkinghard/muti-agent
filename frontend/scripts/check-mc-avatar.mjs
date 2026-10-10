// Q 版人物 / 椅子的数据检查（不渲染）：
// 1. 人物库 33 人每人都有一份固定造型（按 id），没有多余的；发型零件 ≥ 15 种、实际用到 ≥ 10 种；
// 2. avatar 模块里没有随机数、没有按 id 哈希挑衣服；同一份造型拼两次，发型零件一模一样；
// 3. 搭配约束：每条规则在真实造型和构造的冲突造型上都成立；
// 4. 每人主色 4–5 种（相近色算一个，皮肤不算）；33 人的轮廓（发型 + 头饰 + 外层 + 下装 + 呆毛 / 胡子 / 围巾）两两不同；
// 5. 坐姿几何：鞋底正好落在地面、大腿下沿贴座面；Q 版体型全高约 3～3.6 头身（颈高/头高 1.95–2.60），精修体型（用户 2026-10-09：头不要太大）约 3.9–4.6 头身（2.90–3.60）；椅子族的座面前沿在小腿后面、靠背前面在外套背面后面、
//    靠背顶低于大头后仰时的后脑下沿、扶手内侧在胳膊外面。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
const vite = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const [{ LOOKS }, hair, { resolveLook }, { LIBRARY_PERSONAS }, { RATIONAL_PERSONAS }, rig, { CHAIR }, body] = await Promise.all([
    vite.ssrLoadModule('/src/mc/avatar/looks.ts'), vite.ssrLoadModule('/src/mc/avatar/hair.ts'), vite.ssrLoadModule('/src/mc/avatar/resolve.ts'),
    vite.ssrLoadModule('/src/data/personas.ts'), vite.ssrLoadModule('/src/data/rationalPersonas.ts'), vite.ssrLoadModule('/src/mc/avatar/rig.ts'), vite.ssrLoadModule('/src/mc/props/chairs.ts'),
    vite.ssrLoadModule('/src/mc/avatar/body.ts')]);
  const { makeBody, sitPose, seatClearance, BODY } = body;
  const { planHair, HAIR_LABEL, FRINGE_FLOOR } = hair;
  // 1. 覆盖
  const ids = [...new Set([...LIBRARY_PERSONAS, ...RATIONAL_PERSONAS].map(p => p.id))];
  assert.equal(ids.length, 33, '人物库应有 33 人');
  for (const id of ids) assert.ok(LOOKS[id], id + ' 没有造型配置');
  assert.deepEqual(Object.keys(LOOKS).sort(), [...ids].sort(), 'looks.ts 里有人物库之外的 id');
  for (const [id, l] of Object.entries(LOOKS)) {
    assert.equal(l.id, id); assert.ok(l.why.length > 20, id + ' 缺推导说明');
    assert.ok(BODY[l.body?.type] && ['standard', 'relaxed', 'side'].includes(l.body.sit), id + ' 缺体型或坐姿');
    for (const k of ['skin', 'hairColor', 'hairStyle', 'top', 'palette', 'tendency']) assert.ok(['config', 'inferred', 'request'].includes(l.basis[k]), id + ' 的 ' + k + ' 没标来源');
  }
  const styles = new Set(Object.values(LOOKS).map(l => l.hair.style));
  assert.ok(Object.keys(HAIR_LABEL).length >= 15, '发型零件不到 15 种'); assert.ok(styles.size >= 10, '实际用到的发型只有 ' + styles.size + ' 种');
  console.log('Pass coverage:', ids.length, 'looks,', Object.keys(HAIR_LABEL).length, 'hair styles in library,', styles.size, 'used');
  // 2. 确定性
  for (const f of fs.readdirSync('src/mc/avatar')) { const src = fs.readFileSync('src/mc/avatar/' + f, 'utf8'); assert.ok(!/Math\.random|crypto\.|Date\.now|performance\.now/.test(src), f + ' 里有随机数或时间'); assert.ok(!/agentId/.test(src), f + ' 按 agentId 取外观'); }
  for (const l of Object.values(LOOKS)) { const o = { hat: null, hood: false, glasses: false, ahoge: false }; assert.deepEqual(JSON.stringify(planHair(l.hair.style, o)), JSON.stringify(planHair(l.hair.style, o)), l.id + ' 发型拼两次不一样'); }
  console.log('Pass determinism: no random/time/agentId in src/mc/avatar, hair plans are pure');
  // 3. 搭配约束
  const base = { id: 't', name: 't', skin: '#f1c9a5', hair: { style: 'odango', color: '#2b2136' }, face: { eyes: 'round', iris: '#333', brows: 'soft', mouth: 'smile' }, top: { kind: 'shirt', color: '#eee' }, bottom: { kind: 'skirt', color: '#333' }, shoes: { kind: 'boots', color: '#333' }, acc: [], tendency: { expression: 'neutral', gesture: 1, lean: 0, tilt: 0 }, basis: {}, why: '' };
  const r1 = resolveLook({ ...base, acc: [{ kind: 'hood' }, { kind: 'cap' }, { kind: 'headphones' }] }); assert.equal(r1.hat, null, '兜帽和帽子冲突'); assert.equal(r1.phones, 'neck', '兜帽下头戴耳机改挂脖');
  const r2 = resolveLook({ ...base, acc: [{ kind: 'headphones' }] }); assert.equal(r2.phones, 'neck', '丸子头和头戴耳机冲突');
  const r3 = resolveLook({ ...base, acc: [{ kind: 'scarf' }, { kind: 'tie' }, { kind: 'neckphones' }] }); assert.ok(!r3.has('tie') && r3.phones === null, '围巾让掉领带、挂脖耳机');
  const r4 = resolveLook({ ...base, outer: { kind: 'coat', color: '#777' } }); assert.equal(r4.coatHem, false, '裙子配长外套不要下摆');
  const r5 = resolveLook({ ...base, outer: { kind: 'overalls', color: '#6a9a5a' } }); assert.equal(r5.look.bottom.kind, 'pants'); assert.equal(r5.look.bottom.color, '#6a9a5a', '背带裤带走下装');
  const r6 = resolveLook({ ...base, acc: [{ kind: 'beanie' }, { kind: 'ahoge' }] }); assert.ok(!r6.ahoge, '戴帽子呆毛压平');
  for (const style of Object.keys(HAIR_LABEL)) { const low = Math.min(...planHair(style, { hat: null, hood: false, glasses: true, ahoge: false }).boxes.filter(b => b.z0 >= rig.HEAD.hz - .01).map(b => b.y0), 99); assert.ok(low >= FRINGE_FLOOR.glasses - 1e-9, style + ' 戴眼镜时刘海盖住镜框'); }
  for (const style of Object.keys(HAIR_LABEL)) { const p = planHair(style, { hat: null, hood: true, glasses: false, ahoge: false }); assert.ok(p.boxes.every(b => b.z0 >= rig.HEAD.hz - .01), style + ' 兜帽里还露出侧发后发'); }
  for (const l of Object.values(LOOKS)) { const r = resolveLook(l); if (r.hood) assert.equal(r.hat, null, l.id); if (r.has('scarf')) assert.ok(!r.has('tie') && !r.has('bowtie'), l.id); }
  console.log('Pass conflicts: hood/hat, phones vs buns, scarf vs tie, skirt vs coat hem, overalls, hat vs ahoge, glasses vs fringe, hood hides hair');
  // 4. 调色板与轮廓
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), near = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 30; };
  const sil = new Map();
  for (const l of Object.values(LOOKS)) {
    const r = resolveLook(l), cs = [r.look.hair.color, r.look.hair.tie, r.look.top.color, r.look.outer?.color, r.look.bottom.color, r.look.shoes.color, ...r.acc.filter(a => a.color && !['ahoge', 'beard'].includes(a.kind)).map(a => a.color)].filter(Boolean), pal = [];
    for (const c of cs) if (!pal.some(o => near(o, c))) pal.push(c);
    assert.ok(pal.length >= 4 && pal.length <= 5, l.name + ' 的主色有 ' + pal.length + ' 种：' + pal.join(' '));
    const key = [l.body.type, l.body.head ?? '', l.body.sit, r.look.hair.style, r.hood ? 'hood' : r.hat ?? '', r.phones ?? '', r.look.outer?.kind ?? r.look.top.kind, r.look.bottom.kind, ...['ahoge', 'beard', 'scarf', 'bow'].filter(k => r.has(k))].join('|');
    sil.set(key, [...(sil.get(key) ?? []), l.name]);
  }
  const dup = [...sil.values()].filter(n => n.length > 1); assert.deepEqual(dup, [], '轮廓相同：' + dup.map(n => n.join('/')).join('；'));
  console.log('Pass palettes 4–5 colours each; silhouettes all distinct:', sil.size);
  // 5. 坐姿几何
  const { T, RIG, HIP_Y, NECK_Y, SEAT_H, SIT_DROP, HEAD_SCALE } = rig;
  const hipSeated = SEAT_H + RIG.leg.d / 2 * T, sole = hipSeated - RIG.leg.shin * T;
  assert.ok(Math.abs(sole) < 1e-9, '坐下鞋底离地 ' + sole.toFixed(3));
  assert.ok(Math.abs(SEAT_H - SIT_DROP + HIP_Y * T - hipSeated) < 1e-9, '坐下髋轴不在座面上方半个腿厚');
  const ratio = NECK_Y / (RIG.head.h * HEAD_SCALE); assert.ok(ratio >= 1.95 && ratio <= 2.6, '头身比 1:' + ratio.toFixed(2) + '（全高约 ' + (1 + ratio).toFixed(2) + ' 头身）');
  const shinBack = (RIG.leg.thigh - (RIG.leg.w / 2 - .15)) * T; assert.ok(CHAIR.front <= shinBack - .005, '座面前沿 ' + CHAIR.front + ' 顶到小腿后侧 ' + shinBack.toFixed(3));
  const coatBack = (RIG.torso.d / 2 + 1) * T; assert.ok(-CHAIR.back >= coatBack - 1e-9, '靠背前面顶进外套背面');
  const headBottomSeated = hipSeated + RIG.torso.h * T, tiltDip = RIG.head.d / 2 * HEAD_SCALE * T * Math.sin(.4); assert.ok(CHAIR.backTop <= headBottomSeated - tiltDip + .01, '靠背顶 ' + CHAIR.backTop + ' 会顶进后仰的后脑（' + (headBottomSeated - tiltDip).toFixed(3) + '）');
  const armOut = (RIG.arm.x + RIG.arm.w / 2) * T; assert.ok(CHAIR.armIn - armOut >= .03, '扶手内侧离胳膊不到 3 厘米');
  for (const type of Object.keys(BODY)) for (const style of ['standard', 'relaxed', 'side']) for (const outer of [false, true]) {
    const b = makeBody(type), pose = sitPose(b, style, outer), gap = seatClearance(b, pose);
    const ratioB = b.neckY / (rig.HEAD.h * b.head.scale[1]), [lo, hi] = b.family === 'refined' ? [2.9, 3.6] : [1.95, 2.6];
    assert.ok(ratioB >= lo && ratioB <= hi, type + '（' + b.family + '）头身比 1:' + ratioB.toFixed(2));
    assert.ok(gap.sole < .08, type + ' ' + style + (outer ? ' 外套' : '') + ' 鞋底离地 ' + gap.sole.toFixed(3) + ' T');
    assert.ok(gap.front >= .3, type + ' ' + style + (outer ? ' 外套' : '') + ' 小腿离座面前沿 ' + gap.front.toFixed(3) + ' T');
    const headBottom = SEAT_H + RIG.leg.d / 2 * T + b.torso.h * T, dip = RIG.head.d / 2 * b.head.scale[2] * T * Math.sin(.4);
    assert.ok(CHAIR.backTop <= headBottom - dip + .01, type + ' 靠背顶进后脑 ' + (headBottom - dip).toFixed(3));
    const arm = (b.arm.x + b.arm.w / 2) * T;
    assert.ok(CHAIR.armIn - arm >= .03, type + ' 扶手内侧离胳膊 ' + (CHAIR.armIn - arm).toFixed(3));
  }
  for (const l of Object.values(LOOKS)) {
    const b = makeBody(l.body.type, l.body.head), outer = !!l.outer && !['apron', 'overalls'].includes(l.outer.kind), gap = seatClearance(b, sitPose(b, l.body.sit, outer));
    const ratioB = b.neckY / (rig.HEAD.h * b.head.scale[1]), [lo, hi] = b.family === 'refined' ? [2.9, 3.6] : [1.95, 2.6];
    assert.ok(ratioB >= lo && ratioB <= hi, l.name + '（' + b.family + '）头身比 1:' + ratioB.toFixed(2));
    assert.ok(gap.sole < .08 && gap.front >= .3, l.name + ' 坐姿脚或小腿不合（sole ' + gap.sole.toFixed(3) + ' front ' + gap.front.toFixed(3) + '）');
  }
  console.log('Pass seating: sole on floor, ratio 1:' + ratio.toFixed(2) + ', seat front', CHAIR.front, '< shin', shinBack.toFixed(3) + ', back', CHAIR.back, ', back top', CHAIR.backTop, '<', (headBottomSeated - tiltDip).toFixed(3) + ', arm gap', (CHAIR.armIn - armOut).toFixed(3) + '; ' + Object.keys(BODY).length + ' bodies × 3 sits');
} finally { await vite.close(); }
