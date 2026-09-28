import assert from 'node:assert/strict';
import { facingFromDirection, facingToward, centroid } from '../src/components/stageFacing.ts';

// 相机在 +Z 侧看向原点：屏幕向右是 +X，观众方向是 +Z
const cam = { right: { x: 1, z: 0 }, toward: { x: 0, z: 1 } };

// 人物朝向观众 -> S
assert.equal(facingFromDirection(0, 1, cam), 'S');
// 背对观众 -> N
assert.equal(facingFromDirection(0, -1, cam), 'N');
// 朝世界 +X：从观众看是往屏幕右边走 -> E
assert.equal(facingFromDirection(1, 0, cam), 'E');
// 朝世界 -X -> W
assert.equal(facingFromDirection(-1, 0, cam), 'W');
// 斜向
assert.equal(facingFromDirection(1, 1, cam), 'SE');
assert.equal(facingFromDirection(-1, -1, cam), 'NW');
assert.equal(facingFromDirection(1, -1, cam), 'NE');
assert.equal(facingFromDirection(-1, 1, cam), 'SW');

// 相机转了 90°：观众在 +X 侧。此时朝世界 +X 的人是正对观众
const cam2 = { right: { x: 0, z: -1 }, toward: { x: 1, z: 0 } };
assert.equal(facingFromDirection(1, 0, cam2), 'S');
assert.equal(facingFromDirection(-1, 0, cam2), 'N');
// 屏幕向右这时是世界 -Z，所以朝 +Z 的人显示成侧身朝左（W）
assert.equal(facingFromDirection(0, 1, cam2), 'W');

// 转身规则：坐在 z=-2 的人看向原点（原点在 +Z 方向）
assert.equal(facingToward({ x: 0, z: -2 }, { x: 0, z: 0 }, cam), 'S');
// 房间那侧的人反过来是 N
assert.equal(facingToward({ x: 0, z: 2 }, { x: 0, z: 0 }, cam), 'N');
// 侧面两人朝向互为 W/E
assert.equal(facingToward({ x: -2, z: 0 }, { x: 0, z: 0 }, cam), 'E');
assert.equal(facingToward({ x: 2, z: 0 }, { x: 0, z: 0 }, cam), 'W');

// 位于中心的人不翻转，别出现 0/0
assert.equal(facingToward({ x: 0, z: 0 }, { x: 0, z: 0 }, cam), 'S');

// 重心
assert.deepEqual(centroid([{ x: 0, z: 0 }, { x: 2, z: 4 }]), { x: 1, z: 2 });
assert.equal(centroid([]), null);

// 相机绕房间转一圈，八个人各坐一个方向的极端情况：结果必须落在八个合法朝向里
const all = new Set();
for (let a = 0; a < 360; a += 5) {
  const rad = a * Math.PI / 180;
  const c = { right: { x: Math.cos(rad), z: Math.sin(rad) }, toward: { x: -Math.sin(rad), z: Math.cos(rad) } };
  for (let d = 0; d < 360; d += 5) {
    const r2 = d * Math.PI / 180;
    all.add(facingFromDirection(Math.sin(r2), Math.cos(r2), c));
  }
}
assert.deepEqual([...all].sort(), ['E','N','NE','NW','S','SE','SW','W']);

console.log('舞台朝向：八个方位、转身规则、重心、任意相机角度均通过。');
