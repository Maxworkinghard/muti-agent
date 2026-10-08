// 场景设计层：六间房都有意图、配色方案和分区；圆桌座位离桌沿在尺度范围内；办公室保留 13 个工位和 6 把会议椅。
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite = await createServer({ configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const [{ SCENE_PLANS }, { SCHEMES }, { roundGap }, { SCALE }, { MC_SCENE_KINDS }] = await Promise.all([
    vite.ssrLoadModule('/src/mc/design/plans.ts'),
    vite.ssrLoadModule('/src/mc/design/scheme.ts'),
    vite.ssrLoadModule('/src/mc/design/space.ts'),
    vite.ssrLoadModule('/src/mc/design/scale.ts'),
    vite.ssrLoadModule('/src/mc/rooms/names.ts'),
  ]);
  assert.deepEqual(SCENE_PLANS.map(p => p.kind), MC_SCENE_KINDS, '设计入口要按场景顺序覆盖六间房');
  for (const plan of SCENE_PLANS) {
    assert.ok(SCHEMES[plan.scheme], plan.kind + ' 的配色方案不存在');
    assert.ok(plan.intent.length > 16, plan.kind + ' 缺少设计意图');
    assert.ok(plan.zones.length >= 3, plan.kind + ' 至少要有三块有名字的地面');
    const ids = new Set(plan.zones.map(z => z.id));
    assert.equal(ids.size, plan.zones.length, plan.kind + ' 分区 id 重复');
    for (const zone of plan.zones) assert.ok(zone.max[0] > zone.min[0] && zone.max[1] > zone.min[1] && zone.note, plan.kind + ' / ' + zone.id + ' 分区没有范围或说明');
    const room = plan.build();
    assert.equal(room.kind, plan.kind);
    for (const table of room.layout.tables.filter(t => t.shape === 'round')) {
      const radius = table.length / 2, seats = [...room.anchors, ...(room.work?.meeting ?? [])].filter(a => Math.hypot(a.seat[0] - table.center[0], a.seat[2] - table.center[2]) < radius + 1.2);
      assert.ok(seats.length >= 6, table.id + ' 周围没有一圈座位');
      for (const seat of seats) {
        const gap = roundGap(radius, seat.seat[0], seat.seat[2], table.center[0], table.center[2]);
        assert.ok(gap >= SCALE.roundGapMin && gap <= SCALE.roundGapMax, table.id + ' 座位空隙 ' + gap.toFixed(2) + ' 不在 ' + SCALE.roundGapMin + '–' + SCALE.roundGapMax);
      }
    }
  }
  const office = SCENE_PLANS.find(p => p.kind === 'office').build();
  assert.equal(office.anchors.length, 13, '办公室要保留 13 个工位');
  assert.equal(office.work.meeting.length, 6, '会议角要有 6 把椅子');
  assert.ok(office.work.overflow, '会议椅坐满后要有站位');
  assert.equal(office.work.visits.length, 13, '每个工位都要有走访时站的位置');
  console.log('Pass design:', SCENE_PLANS.map(p => p.kind + ':' + p.zones.length).join(' '));
} finally { await vite.close(); }
