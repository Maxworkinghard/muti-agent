import assert from 'node:assert/strict';
import { Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { SCENES } from '../src/data/scenes.ts';
import { buildPixelAvatar } from '../src/components/pixelAvatarDraw.ts';
import {
  actorMotion, actorWorldSize, drawingForPose, facingDelta, poseFromAgent, stepFacing,
} from '../src/components/pixelActorMotion.ts';
import {
  DEBATE_FLOOR, DEBATE_ROOM, frameCamera, inwardFrom, planDebateSeats, planToWorld, tableFor, tableLocal, yawAligningLocalX,
} from '../src/components/pixelDebatePlan.ts';
import { facingToward } from '../src/components/stageFacing.ts';

const visual = { skin: '#f1c9a5', hair: '#2b2136', shirt: '#4F9DB8', accent: '#fbf5e4', hairStyle: 'short' };

const bust = buildPixelAvatar(visual, { facing: 'S', standing: false });
assert.equal(bust.height, 16);
assert.ok(bust.rects.every((rect) => rect[1] + rect[3] <= 16));
const stand = buildPixelAvatar(visual, { facing: 'S', standing: true });
assert.equal(stand.height, 24);
assert.ok(stand.rects.some((rect) => rect[4] === '#3d3550' && rect[1] >= 16));
const sit = buildPixelAvatar(visual, { pose: 'sit', facing: 'S' });
assert.equal(sit.height, 22);
assert.ok(sit.rects.some((rect) => rect[4] === '#3d3550'));
assert.ok(sit.rects.some((rect) => rect[4] === '#ab7646'), 'sit pose should include the chair');
assert.ok(buildPixelAvatar(visual, { pose: 'sit', facing: 'E' }).rects.some((rect) => rect[4] === '#ab7646'));
assert.ok(!bust.rects.some((rect) => rect[4] === '#ab7646'));
assert.ok(!stand.rects.some((rect) => rect[4] === '#ab7646'));
assert.equal(buildPixelAvatar(visual, { facing: 'W', standing: true }).height, 24);
const quiet = buildPixelAvatar(visual, { pose: 'stand', facing: 'S' });
const talking = buildPixelAvatar(visual, { pose: 'stand', facing: 'S', gesture: 'talk', frame: 1 });
assert.ok(talking.rects.some((rect) => rect[4] === '#b86a5a' && rect[3] === 2));
assert.ok(!quiet.rects.some((rect) => rect[4] === '#b86a5a' && rect[3] === 2));
const wideTalk = buildPixelAvatar(visual, { pose: 'stand', facing: 'S', gesture: 'talk', frame: 2 });
assert.ok(wideTalk.rects.some((rect) => rect[4] === '#b86a5a' && rect[2] === 4 && rect[3] === 2));
const glance = buildPixelAvatar(visual, { pose: 'sit', facing: 'S', gesture: 'idle', frame: 1 });
assert.ok(glance.rects.some((rect) => rect[0] === 7 && rect[1] === 6 && rect[2] === 1 && rect[3] === 2 && rect[4] === '#2b2136'));
const smile = buildPixelAvatar(visual, { pose: 'sit', facing: 'S', gesture: 'idle', frame: 2 });
assert.ok(smile.rects.some((rect) => rect[4] === '#b86a5a' && rect[2] >= 3));
const blink = buildPixelAvatar(visual, { pose: 'sit', facing: 'S', gesture: 'idle', frame: 3 });
assert.ok(blink.rects.some((rect) => rect[0] === 6 && rect[1] === 6 && rect[2] === 1 && rect[3] === 2 && rect[4] === visual.skin));
assert.ok(!bust.rects.some((rect) => rect[0] === 6 && rect[1] === 6 && rect[2] === 1 && rect[3] === 2 && rect[4] === visual.skin));
const lookUp = buildPixelAvatar(visual, { pose: 'sit', facing: 'S', gesture: 'think', frame: 1 });
assert.ok(lookUp.rects.some((rect) => rect[0] === 6 && rect[1] === 5 && rect[2] === 1 && rect[3] === 2 && rect[4] === '#2b2136'));
const sweaty = buildPixelAvatar({ ...visual, extras: ['sweat'] }, { pose: 'sit', facing: 'S', gesture: 'idle', frame: 2 });
assert.ok(sweaty.rects.some((rect) => rect[4] === '#7cc3e8' && rect[1] === 6));
const sweatyStill = buildPixelAvatar({ ...visual, extras: ['sweat'] }, { facing: 'S' });
assert.ok(sweatyStill.rects.some((rect) => rect[4] === '#7cc3e8' && rect[1] === 4));
assert.ok(!sweatyStill.rects.some((rect) => rect[4] === '#7cc3e8' && rect[1] === 6));
const thinking = buildPixelAvatar(visual, { pose: 'sit', facing: 'S', gesture: 'think' });
assert.ok(thinking.rects.some((rect) => rect[4] === visual.skin && rect[1] === 6 && rect[2] === 2));
assert.ok(!sit.rects.some((rect) => rect[4] === visual.skin && rect[1] === 6 && rect[2] === 2));
assert.equal(buildPixelAvatar(visual, { facing: 'S' }).height, 16);
assert.notEqual(actorMotion('speak', 0, 0, false).frame, actorMotion('speak', 140, 0, false).frame);
assert.equal(actorMotion('speak', 280, 0, false).frame, 2);
assert.equal(actorMotion('speak', 0, 0, true).bob, 0);
assert.equal(actorMotion('think', 0, 0, false).gesture, 'think');
assert.equal(actorMotion('think', 420, 0, false).frame, 1);
assert.equal(actorMotion('sit', 400, 0, false).frame, 0);
assert.equal(actorMotion('sit', 1600, 0, false).frame, 1);
assert.equal(actorMotion('sit', 2200, 0, false).frame, 2);
assert.equal(actorMotion('sit', 2700, 0, false).frame, 3);
assert.ok(Math.abs(actorMotion('sit', 400, 0, false).bob) > 0.01);

assert.equal(poseFromAgent('speaking', false), 'speak');
assert.equal(poseFromAgent('thinking', false), 'think');
assert.equal(poseFromAgent(undefined, false), 'sit');
assert.equal(poseFromAgent(undefined, true), 'stand');
assert.equal(drawingForPose('speak', false), 'stand');
assert.equal(drawingForPose('think', false), 'sit');
assert.equal(drawingForPose('think', true), 'stand');
assert.equal(drawingForPose('sit', false), 'sit');
assert.ok(actorWorldSize('sit').worldHeight < actorWorldSize('stand').worldHeight);
assert.ok(Math.abs(actorWorldSize('sit').worldWidth / actorWorldSize('sit').worldHeight - 16 / 22) < 1e-9);

assert.equal(facingDelta('S', 'SE'), 1);
assert.equal(facingDelta('S', 'SW'), -1);
assert.equal(facingDelta('S', 'N'), 4);
assert.equal(stepFacing('S', 'S'), 'S');
let facing = 'S';
for (let i = 0; i < 4; i++) facing = stepFacing(facing, 'N');
assert.equal(facing, 'N');
assert.equal(stepFacing('S', 'SW'), 'SW');

const origin = planToWorld(50, 50);
assert.ok(Math.abs(origin.x) < 1e-9 && Math.abs(origin.z) < 1e-9);
const back = planToWorld(50, 0);
assert.ok(Math.abs(back.x) < 1e-9 && back.z < 0);
const front = planToWorld(50, 100);
assert.ok(front.z > 0);
assert.equal(DEBATE_FLOOR.width / DEBATE_FLOOR.depth, 1536 / 1024);

assert.equal(SCENES['debate-3d'].pixelStage, undefined);
assert.equal(SCENES.debate.pixelStage, undefined);
assert.equal(SCENES['roundtable-3d'].pixelStage, undefined);
assert.equal(SCENES['office-3d'].pixelStage, undefined);
assert.equal(SCENES['debate-3d'].model3d, '/models/scene-debate.glb');
assert.equal(SCENES['roundtable-3d'].model3d, '/models/scene-roundtable.glb');
assert.equal(SCENES['office-3d'].model3d, '/models/scene-office.glb');
assert.equal(SCENES.debate.image, '/scenes/scene-debate.png');
assert.equal(SCENES['debate-meshy'].model3d, '/models/scene-debate-meshy.glb');
assert.notEqual(SCENES['debate-meshy'].model3d, SCENES['debate-3d'].model3d);
assert.equal(SCENES['debate-meshy'].image, SCENES.debate.image);
// 精模用的是自己那套 GLB 房间，不走代码搭的像素舞台
assert.equal(SCENES['debate-meshy'].pixelStage, undefined);
assert.ok(!SCENES['debate-meshy'].pixelStage, '精模应当加载 scene-debate-meshy.glb，而不是代码搭的像素房间');
// 精模的座位百分比必须按它自己的桌椅量，不能借 MODEL_SEATS.debate：
// 借来的那组会让 6 位辩手全落到地板上。
assert.notDeepEqual(SCENES['debate-meshy'].modelSeats, SCENES['debate-3d'].modelSeats,
  '精模的座位不能和辩论室 · 3D 共用');
assert.equal(SCENES['debate-meshy'].modelSeats.length, 7);
assert.deepEqual(SCENES['debate-meshy'].modelSeats.map((s) => s.group), ['pro', 'pro', 'pro', 'con', 'con', 'con', 'host']);
for (const [i, seat] of SCENES['debate-meshy'].modelSeats.entries()) {
  assert.ok(seat.x > 2 && seat.x < 98 && seat.y > 2 && seat.y < 98, 'modelSeats ' + i + ' 应在房间内');
}
// 正反方各三席坐在自家长桌后面，y 递增到桌尾；主持在讲台后
const proSeats = SCENES['debate-meshy'].modelSeats.filter((s) => s.group === 'pro');
const conSeats = SCENES['debate-meshy'].modelSeats.filter((s) => s.group === 'con');
assert.ok(proSeats.every((s) => s.x < 50), '正方在左半边');
assert.ok(conSeats.every((s) => s.x > 50), '反方在右半边');
assert.ok(SCENES['debate-meshy'].modelSeats[6].y < 20, '主持在靠讲台的那一头');
assert.equal(SCENES['debate-3d'].pixelStage, undefined);
assert.deepEqual(SCENES['debate-3d'].seats, SCENES.debate.seats);
assert.equal(SCENES['debate-3d'].image, SCENES.debate.image);

const planned = planDebateSeats(SCENES.debate.seats);
const host = planned.find((seat) => seat.group === 'host');
const pro = planned.filter((seat) => seat.group === 'pro');
const con = planned.filter((seat) => seat.group === 'con');
assert.ok(host.z < 0);
assert.ok(pro.every((seat) => seat.x < 0));
assert.ok(con.every((seat) => seat.x > 0));
const proMid = pro.reduce((sum, seat) => sum + seat.x, 0) / pro.length;
const proTable = tableFor(pro);
assert.ok(Math.abs(proTable.x) < Math.abs(proMid));
for (const seat of pro) {
  const dx = seat.x - proTable.x;
  const dz = seat.z - proTable.z;
  const cos = Math.cos(proTable.yaw);
  const sin = Math.sin(proTable.yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const nearestX = Math.max(-proTable.length / 2, Math.min(proTable.length / 2, localX));
  const nearestZ = Math.max(-0.35, Math.min(0.35, localZ));
  const clearance = Math.hypot(localX - nearestX, localZ - nearestZ);
  assert.ok(clearance > 0.7, `pro seat ${seat.index} is ${clearance.toFixed(2)} from the table`);
}
const conMid = con.reduce((sum, seat) => sum + seat.x, 0) / con.length;
const conTable = tableFor(con);
assert.ok(Math.abs(conTable.x) < Math.abs(conMid));

assert.ok(Math.abs(yawAligningLocalX(1, 0)) < 1e-9);
assert.ok(Math.abs(yawAligningLocalX(0, 1) - (-Math.PI / 2)) < 1e-9);
assert.ok(Math.abs(yawAligningLocalX(0, -1) - Math.PI / 2) < 1e-9);

const leftIn = inwardFrom(proMid, 0);
assert.ok(leftIn.x > 0);

// 相机在 +Z、略高，看向原点。屏幕向右应是世界 +X，指向观众的轴应朝 +Z。
const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
camera.position.set(0.2, 7.2, 9.4);
camera.lookAt(0, 0.9, -0.4);
camera.updateMatrixWorld();
const rightColumn = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
const towardColumn = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
const planar = (v) => {
  const length = Math.hypot(v.x, v.z);
  return { x: v.x / length, z: v.z / length };
};
const right = planar(rightColumn);
const toward = planar(towardColumn);
assert.ok(right.x > 0.9, `screen right should be +X, got ${right.x.toFixed(3)},${right.z.toFixed(3)}`);
assert.ok(toward.z > 0.9, `toward viewer should be +Z, got ${toward.x.toFixed(3)},${toward.z.toFixed(3)}`);
const basis = { right, toward };
assert.equal(facingToward(host, { x: 0, z: 0 }, basis), 'S');
assert.equal(facingToward(pro[1], { x: 0, z: 0 }, basis), 'E');
assert.equal(facingToward(con[1], { x: 0, z: 0 }, basis), 'W');

// PlaneGeometry 的正面是本地 +Z。lookAt 镜头的水平位置后，正面应指向镜头，而不是背对。
const board = new Mesh(new PlaneGeometry(1, 1));
board.position.set(pro[1].x, 0.6, pro[1].z);
board.lookAt(camera.position.x, board.position.y, camera.position.z);
const boardFront = new Vector3(0, 0, 1).applyQuaternion(board.quaternion);
const toCamera = new Vector3(camera.position.x - board.position.x, 0, camera.position.z - board.position.z).normalize();
assert.ok(boardFront.dot(toCamera) > 0.99, `billboard front faces away from camera (${boardFront.dot(toCamera).toFixed(3)})`);

// ---------- 进门取景：每个到场的人都得在画面里 ----------
const FRAME_ASPECT = 1010 / 673;   // 舞台上这块画布的实际宽高比
/** 按 SetupCast 的席位规则取前 n 个人（正、反轮流，最后一个当主持） */
function castOf(n) {
  const used = { pro: 0, con: 0, host: 0 };
  const out = [];
  for (let i = 0; i < n; i++) {
    const group = i === n - 1 && n >= 5 ? 'host' : used.pro <= used.con && used.pro < 3 ? 'pro' : used.con < 3 ? 'con' : 'host';
    const spots = planned.filter((seat) => seat.group === group);
    const spot = spots[Math.min(used[group], spots.length - 1)];
    used[group]++;
    if (spot) out.push({ x: spot.x, z: spot.z });
  }
  return out;
}
/** 把取景结果装进一台真相机，用它自己的矩阵投影——别再手推 YXZ 的旋转顺序 */
function cameraFor(frame, aspect) {
  const cam = new PerspectiveCamera(frame.fov, aspect, 0.08, 80);
  cam.rotation.order = 'YXZ';
  cam.position.set(frame.position.x, frame.position.y, frame.position.z);
  cam.rotation.set(frame.pitch, frame.yaw, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  return cam;
}
for (const n of [2, 3, 4, 5]) {
  const cast = castOf(n);
  const frame = frameCamera(cast, FRAME_ASPECT, DEBATE_ROOM);
  const cam = cameraFor(frame, FRAME_ASPECT);
  assert.equal(cast.length, n, 'cast of ' + n + ' should place ' + n + ' seats');
  assert.ok(frame.fov >= 58 && frame.fov <= 80, 'fov ' + frame.fov + ' out of range');
  assert.ok(frame.position.z < DEBATE_ROOM.depth / 2 && frame.position.z > -DEBATE_ROOM.depth / 2, 'camera must sit inside the room');
  assert.ok(Math.abs(frame.position.y - 1.72) < 1e-9, 'camera should sit at eye height');
  for (const seat of cast) {
    for (const height of [0.15, 0.75, 1.3]) {
      const v = new Vector3(seat.x, height, seat.z);
      const forward = v.clone().sub(cam.position).dot(cam.getWorldDirection(new Vector3()));
      assert.ok(forward > 0.5, 'cast ' + n + ': seat must sit in front of the camera (got ' + forward.toFixed(2) + ')');
      const ndc = v.project(cam);
      assert.ok(Math.abs(ndc.x) < 1, 'cast ' + n + ': seat off screen horizontally (' + ndc.x.toFixed(3) + ')');
      assert.ok(Math.abs(ndc.y) < 1, 'cast ' + n + ': seat off screen vertically at height ' + height + ' (' + ndc.y.toFixed(3) + ')');
    }
  }
  // 别人不能挡住他：从镜头到座位的连线，不能擦过任何另一个座位
  for (const seat of cast) {
    for (const other of cast) {
      if (other === seat) continue;
      const dx = other.x - frame.position.x;
      const dz = other.z - frame.position.z;
      const sx = seat.x - frame.position.x;
      const sz = seat.z - frame.position.z;
      const t = (dx * sx + dz * sz) / (sx * sx + sz * sz);
      if (t <= 0.05 || t >= 0.98) continue;
      const gap = Math.hypot(dx - sx * t, dz - sz * t);
      assert.ok(gap > 0.55, 'cast ' + n + ': seat at ' + seat.x.toFixed(2) + ' is blocked (gap ' + gap.toFixed(2) + ')');
    }
  }
}

// ---------- 桌面文具在座位那一侧，不在对面 ----------
for (const group of [pro, con]) {
  const table = tableFor(group);
  const sides = group.map((seat) => tableLocal(seat, table).side);
  assert.ok(sides.every((side) => side > 0) || sides.every((side) => side < 0), 'seats should all sit on one side of their table');
  assert.ok(Math.abs(sides[0]) > 0.7, 'seats should clear the table edge');
}
console.log('像素辩论室：座位在桌旁、朝向随这台相机、人物正面朝向镜头、进门取景全员在画面内，均通过。');
