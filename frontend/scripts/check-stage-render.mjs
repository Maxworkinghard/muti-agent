import assert from 'node:assert/strict';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { createServer } from 'vite';

const vite = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-stage-check', server: { middlewareMode: true } });
const savedGlobals = Object.fromEntries(['window', 'document', 'Element'].map((name) => [name, globalThis[name]]));
try {
  // 在加载模块前设置 window，因为 stageRenderSize 需要访问 window.devicePixelRatio
  globalThis.window = { devicePixelRatio: 2 };
  const { stageRenderSize, savedStageQuality } = await vite.ssrLoadModule('/src/rendering/stageQuality.ts');

  // 验证 stageRenderSize 根据质量档位和 devicePixelRatio 正确缩放
  const [w1, h1] = stageRenderSize('ultra', 960, 640);
  assert.equal(w1, 1920); // 960 * min(2, 2) = 1920
  assert.equal(h1, 1280); // 640 * 2 = 1280

  const [w2, h2] = stageRenderSize('medium', 1920, 1080);
  assert.equal(w2, 2400); // 1920 * min(2, 1.25) = 1920 * 1.25 = 2400
  assert.equal(h2, 1350); // 1080 * 1.25 = 1350

  // 低 DPI 设备（devicePixelRatio=1）不会超过 pixelRatio
  globalThis.window = { devicePixelRatio: 1 };
  const { stageRenderSize: stageRenderSize2 } = await vite.ssrLoadModule('/src/rendering/stageQuality.ts');
  const [w3, h3] = stageRenderSize2('ultra', 1920, 1080);
  assert.equal(w3, 1920); // 1920 * min(1, 2) = 1920
  assert.equal(h3, 1080);

  globalThis.window = { devicePixelRatio: 2 };
  assert.equal(savedStageQuality({ getItem() { throw Error('blocked'); } }), 'medium');
  assert.equal(savedStageQuality({ getItem() { return 'ultra'; } }), 'ultra');

  class ElementStub extends EventTarget {
    editing = false;
    closest() { return this.editing ? this : null; }
  }
  class Canvas extends ElementStub {
    focus() {}
    setPointerCapture() {}
  }
  globalThis.Element = ElementStub;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { pointerLockElement: null });
  const { StageFreeCamera } = await vite.ssrLoadModule('/src/components/stageFreeCamera.ts');
  const event = (type, code, target) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { code, metaKey: false, altKey: false });
    if (target) Object.defineProperty(e, 'target', { value: target });
    window.dispatchEvent(e);
  };
  const camera = new PerspectiveCamera(60, 1, 0.01, 30);
  const reset = () => { camera.position.set(5, 1.6, 5); camera.lookAt(5, 2.3, 0); };
  const space = { bounds: new Box3(new Vector3(0, 0, 0), new Vector3(10, 3, 10)), floorY: 0, ceilingY: 3, cell: 0.05, eyeHeight: 1.6 };
  const controller = new StageFreeCamera(new Canvas(), { ...space, occupied: (p) => p.z >= 3 && p.z <= 3.1 && p.y < 0.9 });
  reset();
  assert.equal(controller.enter(camera, 'walk'), true);
  event('keydown', 'KeyW'); event('keydown', 'ShiftLeft');
  for (let i = 0; i < 180; i++) controller.update(1 / 60, camera);
  assert.equal(camera.position.y, 1.6, '抬头及加速不应让行走变成飞行');
  assert.ok(camera.position.z >= 3.1, '不能跨过低于镜头的桌椅');
  assert.ok(Math.abs(camera.position.x - 5) < 1e-8, '碰撞探点不能污染移动坐标');
  event('keyup', 'KeyW'); event('keyup', 'ShiftLeft');
  controller.exit(); reset(); controller.enter(camera, 'free');
  event('keydown', 'KeyW');
  for (let i = 0; i < 35; i++) controller.update(1 / 60, camera);
  assert.ok(camera.position.z < 3, '飞行应当可以从矮桌上方经过');
  assert.ok(camera.position.y > 1.6, '飞行方向随抬头变化');
  event('keyup', 'KeyW');
  const before = camera.position.clone();
  event('keydown', 'Space'); controller.update(0.05, camera); event('keyup', 'Space');
  assert.ok(camera.position.y > before.y, '空格应升高飞行镜头');
  const typing = new ElementStub(); typing.editing = true;
  event('keydown', 'KeyW', typing); const paused = camera.position.clone(); controller.update(0.05, camera);
  assert.ok(camera.position.equals(paused), '输入框不能触发镜头移动');
  controller.enter(camera, 'walk');
  let exits = 0; controller.onExit = () => exits++;
  event('keydown', 'Escape'); assert.equal(exits, 1); assert.equal(controller.active, false);
  controller.dispose();
  const blocked = new StageFreeCamera(new Canvas(), { ...space, occupied: () => true });
  reset(); assert.equal(blocked.enter(camera, 'walk'), false); assert.equal(blocked.active, false);
  blocked.dispose();
  console.log('PASS: 渲染尺寸与设备边界；行走/飞行输入；矮障碍与探点回归；打字与 Esc 退出');
} finally {
  for (const [key, value] of Object.entries(savedGlobals)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
  await vite.close();
}
