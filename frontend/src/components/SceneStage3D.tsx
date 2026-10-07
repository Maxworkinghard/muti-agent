import { useEffect, useRef, useState } from 'react';
import {
  Box3, Euler, Group, Mesh, MeshBasicMaterial, OrthographicCamera, PCFShadowMap, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SceneDef, Seat } from '../types';
import type { StageView } from './stageFacing';
import { ScenePixelActors, type SceneCastMember } from './scenePixelActors';
import { Occupancy } from './stageOccupancy';
import { StageFreeCamera } from './stageFreeCamera';
import { UniversalControls } from './universalControls';
import { createStagePost } from '../rendering/stagePost';
import { stageRenderSize, STAGE_QUALITY } from '../rendering/stageQuality';
import { AVATAR_SHARE, CEILING_COLOR, FOLLOW, LOOK_SPEED, PITCH_LIMIT, ROOM_VIEW, SCALE_RANGE, SEAT_LIFT, UP, stageTuningFor } from './sceneStageConstants';
import type { Shot, StageCue, StageRoomMetrics, StageViewMode } from './sceneStageConstants';
import { clamp, flatAxis, spring } from './sceneStageMath';
import { disposeModel } from './sceneStageDispose';
import { setupStageLighting } from './sceneStageLighting';
import { createStageShots } from './sceneStageShots';
import { clearSeatHeads, computeStageSeats, createStageCeiling, loadStageModel, prepareStageModel } from './sceneStageModel';
import '../styles/stage-controls.css';

export type { StageCue, StageViewMode } from './sceneStageConstants';

/**
 * The imported room is an additional stage. Existing persona sprites keep their identity and actions.
 * 默认站进屋里，镜头跟着讨论走（跟拍）；拖动画面就把镜头交给用户，也可以切到从外面俯瞰整间房。
 */
export function SceneStage3D({ scene, cast, actors, cue, onLoaded, onSeatPositions, onStageView, onModeChange, onFollowChange }: {
  scene: SceneDef;
  /** 在座的人的座位下标：全景按他们取景，跟拍时据此判断谁在听 */
  cast: number[];
  actors: SceneCastMember[];
  /** 现在该拍谁 */
  cue: StageCue;
  onLoaded: (error?: string) => void;
  onSeatPositions: (positions: Seat[]) => void;
  /** 相机朝向和每个座位的世界坐标：人物靠它算出自己该朝哪边站，而不是永远盯着观众 */
  onStageView: (view: StageView) => void;
  /** 切换视角时通知外面，提示文案跟着改 */
  onModeChange?: (mode: StageViewMode) => void;
  /** 跟拍开关变化时通知外面 */
  onFollowChange?: (follow: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tuning = stageTuningFor(scene);
  const [mode, setMode] = useState<StageViewMode>('inside');
  const modeRef = useRef<StageViewMode>(mode);
  modeRef.current = mode;
  const [follow, setFollow] = useState(true);
  const [renderInfo, setRenderInfo] = useState('');
  const [viewError, setViewError] = useState('');
  const [loading, setLoading] = useState(true);
  const [controlLocked, setControlLocked] = useState(false);
  const [pov, setPov] = useState('');
  const povRef = useRef(pov);
  povRef.current = pov;
  const enterMotionRef = useRef<((mode: 'walk' | 'free') => void) | null>(null);
  const enterPovRef = useRef<((id: string) => void) | null>(null);
  const universalControlsRef = useRef<UniversalControls | null>(null);
  const followRef = useRef(follow);
  const castRef = useRef(cast);
  castRef.current = cast;
  const actorsRef = useRef(actors);
  actorsRef.current = actors;
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const callbacks = useRef({ onLoaded, onSeatPositions, onStageView, onModeChange, onFollowChange });
  callbacks.current = { onLoaded, onSeatPositions, onStageView, onModeChange, onFollowChange };
  /** 补的天花板：只在「进屋」时显示，俯瞰时要让开视线 */
  const ceilingRef = useRef<Mesh | null>(null);
  const ceilingPartsRef = useRef<Mesh[]>([]);
  const controlsRef = useRef<OrbitControls | null>(null);
  const refreshViewRef = useRef<(() => void) | null>(null);
  /** 跟拍开关：关掉时从当前画面原地接手，打开时从当前画面平滑转回跟拍机位 */
  const setFollowRef = useRef<((on: boolean) => void) | null>(null);
  /** 自由视角镜头：进出与「跟拍」一样从当前画面无缝接手 */
  const freeCamRef = useRef<StageFreeCamera | null>(null);
  const freeWasFollowingRef = useRef(false);
  /** 上一次的相机模式：modeRef 在渲染时已经是新值，这里自己记 */
  const prevModeRef = useRef<StageViewMode>('inside');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !scene.model3d) return;
    setLoading(true);
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    } catch {
      callbacks.current.onLoaded('当前设备无法启动 WebGL，已切换回场景原图');
      return;
    }
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMappingExposure = tuning.exposure;
    // 应用高质量设置
    const qualityConfig = STAGE_QUALITY['medium'];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qualityConfig.pixelRatio));
    renderer.shadowMap.enabled = qualityConfig.shadow > 0;
    renderer.shadowMap.type = PCFShadowMap;
    // 房间和灯都不动，只有镜头在动：阴影图只在墙面显隐变化时重画
    renderer.shadowMap.autoUpdate = false;
    // 背景色跟着天花板走：万一还有缝，露出来的是屋里的暖色，而不是一块黑
    renderer.setClearColor(CEILING_COLOR);
    renderer.domElement.setAttribute('aria-label', scene.name + '，可切换室内跟拍、俯视、第一人称行走、自由飞行和角色视角');
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const world = new Scene();
    const { sun } = setupStageLighting(world, renderer, tuning);

    // 屋里看：透视相机。跟拍时由下面的镜头弹簧摆位，用户接手后原地转头
    const walk = new PerspectiveCamera(ROOM_VIEW.fov, 1, 0.01, 100);
    const post = createStagePost(renderer, world, walk, 'medium');
    walk.rotation.order = 'YXZ';
    let lastAspect = 0;
    // 俯瞰：正交相机 + 轨道控制器，用来一次看清整间房
    const orbit = new OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
    orbit.zoom = 1.08;
    const controls = new OrbitControls(orbit, renderer.domElement);
    controls.enabled = modeRef.current === 'overview';
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = 1.15;
    controls.minZoom = 0.7;
    controls.maxZoom = 2.6;

    const seats: Vector3[] = [];
    const seatSurfaces: Mesh[] = [];
    let ceiling: Mesh | null = null;
    let model: Group | null = null;
    let actorLayer: ScenePixelActors | null = null;
    /** 房间的占位网格：找机位时判断视线有没有被挡用（见 stageOccupancy.ts） */
    let occupancy: Occupancy | null = null;
    let bounds: Box3 | null = null;
    let roomMetrics: StageRoomMetrics | null = null;
    const walls: { mesh: Mesh; side: string }[] = [];
    let ready = false;
    let disposed = false;
    let frame = 0;
    let lastPositions = '';
    let lastView = '';
    let pendingView: StageView | null = null;
    let lastViewAt = 0;
    let lastDiagnosticAt = 0;
    let looking = false;
    let lookX = 0;
    let lookY = 0;
    let manualYaw = 0;
    let manualPitch = 0;
    /** 人物半身在世界里的高度，以及屋里能放镜头的高度范围 */
    let avatarHeight = 0;
    let floorY = 0;
    let ceilingY = 0;
    /** 自由视角镜头：模型和占位网格就绪后第一次进入时创建 */
    let freeCam: StageFreeCamera | null = null;

    // 镜头弹簧：现在的位置 / 看的点 / 视场角，各自的速度，以及要去的机位
    const rig = {
      pos: new Vector3(), target: new Vector3(), fov: ROOM_VIEW.fov as number,
      vPos: new Vector3(), vTarget: new Vector3(), vFov: 0,
      goal: null as Shot | null,
    };
    let shotKey = '';
    let shotSince = 0;
    let lastTick = 0;
    const ray = new Raycaster();
    const shots = createStageShots({
      scene, walk, ray, seats, seatSurfaces, castRef,
      getBounds: () => bounds,
      getRoomMetrics: () => roomMetrics,
      getOccupancy: () => occupancy,
      getAvatarHeight: () => avatarHeight,
      getFloorY: () => floorY,
      getCeilingY: () => ceilingY,
    });

    const activeCamera = () => (modeRef.current === 'overview' ? orbit : walk);

    // 开发环境的舞台诊断；截图和帧序列检查使用同一个真实渲染器。
    if (import.meta.env.DEV) Object.assign(window, { __stage3d: { personShot: shots.personShot, pairShot: shots.pairShot, wideShot: shots.wideShot, fitFov: shots.fitFov, clearView: shots.clearView, headVisible: shots.headVisible, foregroundClear: shots.foregroundClear, seats, clearLine: shots.clearLine, personInWay: shots.personInWay, keepInside: shots.keepInside, ray, seatSurfaces, get avatarHeight() { return avatarHeight; }, get floorY() { return floorY; }, get ceilingY() { return ceilingY; }, get bounds() { return bounds; }, walk, rig, castRef, cueRef, followRef, modeRef, get shotKey() { return shotKey; }, get shotSince() { return shotSince; }, get ready() { return ready; }, Vector3,
      /** 页面在后台时没有动画帧：手动按 16ms 一帧快进 ms 毫秒，再渲染一帧 */
      get actorLayer() { return actorLayer; }, actorsRef,
      step(ms: number) { let t = Math.max(lastTick, shotSince, performance.now()); const end = t + ms; while (t < end) { t += 16; if (modeRef.current === 'inside' && followRef.current) driveCamera(t); lastTick = t; publishPositions(t); actorLayer?.update(actorsRef.current, seats, activeCamera(), t, reduceMotion); } post.setCamera(activeCamera()); post.render(); return t; } } });

    const publishPositions = (now = performance.now()) => {
      if (!ready || !bounds) return;
      const camera = activeCamera();
      camera.updateMatrixWorld();
      const center = bounds.getCenter(new Vector3());
      // 跟拍升到屋顶以上拍全景时，补的顶和吊顶会挡住视线：镜头在屋顶以上就隐藏，降回屋里再显示
      if (modeRef.current !== 'overview') {
        const roof = camera.position.y < bounds.max.y;
        if (ceiling && ceiling.visible !== roof) ceiling.visible = roof;
        for (const part of ceilingPartsRef.current) part.visible = roof;
      }
      // 从外部俯视时切掉靠镜头的墙；室内和自由视角仍是四面完整的房间。
      let wallsChanged = false;
      for (const wall of walls) {
        const toward = wall.side === 'left' ? center.x - camera.position.x
          : wall.side === 'right' ? camera.position.x - center.x
          : wall.side === 'back' ? center.z - camera.position.z
          : camera.position.z - center.z;
        const visible = modeRef.current !== 'overview' || toward <= 0;
        if (wall.mesh.visible !== visible) { wall.mesh.visible = visible; wallsChanged = true; }
      }
      if (wallsChanged) renderer.shadowMap.needsUpdate = true;
      // 锚点落在桌面/讲台面。人物身体按镜头的视场角和景深缩放（推近就大、拉远就小），
      // 名牌保留固定字号；俯视时人物当地图上的标记看，不小于 overviewMin。
      const lift = bounds.getSize(new Vector3()).y * SEAT_LIFT;
      const forward = camera.getWorldDirection(new Vector3());
      const positions = seats.map((seat) => {
        const point = new Vector3(seat.x, seat.y + lift, seat.z);
        // 站在他前面的人：他已经在你身后了，别把名牌扔到画面外（按人物大小算，近景时镜头离人本来就近）
        const depth = point.clone().sub(camera.position).dot(forward);
        if (depth < avatarHeight * 0.8) return { x: -100, y: -100 };
        const ndc = point.project(camera);
        // 镜头升到屋顶以上（无人机全景）时和俯视一样，人物当地图标记看，不能小到认不出
        const scale = modeRef.current !== 'overview'
          ? clamp(host.clientHeight * avatarHeight / (2 * depth * Math.tan(walk.fov * Math.PI / 360) * 36), camera.position.y < bounds!.max.y ? SCALE_RANGE.min : SCALE_RANGE.overviewMin, SCALE_RANGE.max)
          : clamp(host.clientHeight * avatarHeight * orbit.zoom / ((orbit.top - orbit.bottom) * 36), SCALE_RANGE.overviewMin, SCALE_RANGE.max);
        return { x: +((ndc.x + 1) * 50).toFixed(2), y: +((1 - ndc.y) * 50).toFixed(2), scale: +scale.toFixed(3) };
      });
      const key = JSON.stringify(positions);
      if (key !== lastPositions) {
        lastPositions = key;
        callbacks.current.onSeatPositions(positions);
      }

      const right = flatAxis(new Vector3().setFromMatrixColumn(camera.matrixWorld, 0));
      const toward = flatAxis(new Vector3().setFromMatrixColumn(camera.matrixWorld, 2));
      if (!right || !toward) return;
      const view: StageView = {
        right,
        toward,
        seats: seats.map((seat) => ({ x: +seat.x.toFixed(4), z: +seat.z.toFixed(4) })),
      };
      const viewKey = JSON.stringify(view);
      if (viewKey !== lastView) {
        lastView = viewKey;
        pendingView = view;
      }
      flushView(now);
    };
    // 朝向只有八档，镜头移动时最多每 0.2 秒通知一次，免得每帧都让外面重新渲染；停下后补发最后一次
    const flushView = (now: number) => {
      if (!pendingView || now - lastViewAt <= 200) return;
      lastViewAt = now;
      callbacks.current.onStageView(pendingView);
      pendingView = null;
    };
    refreshViewRef.current = () => publishPositions();

    /** 镜头直接摆到某个机位（第一次进屋、或用户设置了减少动态效果） */
    const placeAt = (shot: Shot) => {
      rig.pos.copy(shot.pos);
      rig.target.copy(shot.target);
      rig.fov = shot.fov;
      rig.vPos.set(0, 0, 0);
      rig.vTarget.set(0, 0, 0);
      rig.vFov = 0;
    };
    /** 跟拍：按外面的提示选机位，镜头在机位之间平滑移动，停着时轻微呼吸 */
    const driveCamera = (now: number) => {
      const dt = Math.min(1 / 30, Math.max(0, (now - lastTick) / 1000));
      const c = cueRef.current;
      const key = shots.keyOf(c);
      if (key !== shotKey && (!rig.goal || now - shotSince >= FOLLOW.hold)) {
        const first = !rig.goal;
        rig.goal = shots.shotFor(c);
        shotKey = key;
        shotSince = now;
        if (first || reduceMotion) placeAt(rig.goal);
      }
      if (!rig.goal) return;
      spring(rig.pos, rig.vPos, rig.goal.pos, FOLLOW.omega, dt);
      spring(rig.target, rig.vTarget, rig.goal.target, FOLLOW.omega, dt);
      rig.vFov += (FOLLOW.omega * FOLLOW.omega * (rig.goal.fov - rig.fov) - 2 * FOLLOW.omega * rig.vFov) * dt;
      rig.fov += rig.vFov * dt;
      const t = now / 1000;
      const amp = reduceMotion ? 0 : rig.pos.distanceTo(rig.target) * FOLLOW.breathe;
      walk.position.set(
        rig.pos.x + Math.sin(t * 0.21) * amp,
        rig.pos.y + Math.sin(t * 0.17 + 1) * amp * 0.5,
        rig.pos.z + Math.cos(t * 0.13) * amp,
      );
      walk.lookAt(rig.target);
      if (Math.abs(walk.fov - rig.fov) > 1e-3) {
        walk.fov = rig.fov;
        walk.updateProjectionMatrix();
      }
    };
    /** 用户接手镜头：停在现在的画面，之后原地转头 */
    const takeOver = () => {
      if (!followRef.current) return;
      followRef.current = false;
      setFollow(false);
      const euler = new Euler().setFromQuaternion(walk.quaternion, 'YXZ');
      manualYaw = euler.y;
      manualPitch = clamp(euler.x, -PITCH_LIMIT, PITCH_LIMIT);
      walk.rotation.set(manualPitch, manualYaw, 0);
    };
    /** 交还镜头：从用户现在看的画面出发，平滑转回跟拍机位 */
    const resume = () => {
      if (followRef.current) return;
      const forward = walk.getWorldDirection(new Vector3());
      rig.pos.copy(walk.position);
      rig.target.copy(walk.position).addScaledVector(forward, rig.goal ? rig.goal.target.distanceTo(walk.position) : 1);
      rig.fov = walk.fov;
      rig.vPos.set(0, 0, 0);
      rig.vTarget.set(0, 0, 0);
      rig.vFov = 0;
      shotKey = '';
      shotSince = 0;
      followRef.current = true;
      setFollow(true);
    };
    setFollowRef.current = (on) => (on ? resume() : takeOver());

    /** 行走和飞行共用输入与碰撞；行走固定眼高，并检查脚、躯干和头部。 */
    const enterMotion = (nextMode: 'walk' | 'free') => {
      if (!ready || !occupancy || !bounds) return;
      if (modeRef.current !== 'walk' && modeRef.current !== 'free') freeWasFollowingRef.current = followRef.current;
      takeOver();
      if (modeRef.current === 'overview') {
        walk.position.copy(shots.vantage());
        walk.lookAt(bounds.getCenter(new Vector3()));
      }
      if (!freeCam) {
        freeCam = new StageFreeCamera(renderer.domElement, {
          bounds,
          floorY,
          ceilingY,
          cell: occupancy.cellSize,
          eyeHeight: Math.min(avatarHeight * 2.8, (ceilingY - floorY) * 0.82),
          occupied: (point) => occupancy!.occupied(point),
        });
        freeCam.onExit = () => { if (modeRef.current === 'free' || modeRef.current === 'walk') setMode('inside'); };
        freeCamRef.current = freeCam;
      }
      if (!freeCam.enter(walk, nextMode)) {
        setViewError('当前位置无法落脚，请先切到俯视后再进入行走。');
        setPov('');
        setMode('inside');
        setFollowRef.current?.(true);
        return;
      }
      setViewError('');
      setPov('');
      setMode(nextMode);
    };
    enterMotionRef.current = enterMotion;

    enterPovRef.current = (id) => {
      const person = actorsRef.current.find((actor) => actor.id === id);
      const seat = person && seats[person.seatIndex];
      if (!ready || !seat || !bounds) return;
      takeOver();
      freeWasFollowingRef.current = false;
      const others = actorsRef.current.filter((actor) => actor.id !== id).map((actor) => seats[actor.seatIndex]).filter(Boolean);
      const target = others.length ? others.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(others.length) : bounds.getCenter(new Vector3());
      walk.position.copy(seat).addScaledVector(UP, avatarHeight * 0.65);
      target.y = walk.position.y;
      walk.fov = 70;
      walk.lookAt(target);
      walk.updateProjectionMatrix();
      const facing = new Euler().setFromQuaternion(walk.quaternion, 'YXZ');
      manualYaw = facing.y;
      manualPitch = facing.x;
      setPov(id);
      setMode('actor');
      setViewError('');
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const gl = renderer.getContext();
      const maxSize = Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      const [renderWidth, renderHeight] = stageRenderSize('medium', width, height);
      const qualityConfig = STAGE_QUALITY['medium'];
      const size = { ratio: renderWidth / width, shadow: qualityConfig.shadow, limited: false };
      renderer.setPixelRatio(size.ratio);
      renderer.setSize(width, height, false);
      const buffer = renderer.getDrawingBufferSize(new Vector2());
      post.setSize(buffer.x, buffer.y);
      renderer.shadowMap.enabled = size.shadow > 0;
      sun.castShadow = size.shadow > 0;
      if (sun.shadow.mapSize.x !== size.shadow || !size.shadow) {
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        sun.shadow.mapSize.set(size.shadow || 1, size.shadow || 1);
      }
      renderer.shadowMap.needsUpdate = true;
      setRenderInfo(`${buffer.x} × ${buffer.y} · ${size.shadow ? '阴影 ' + size.shadow : '无阴影'}${size.limited ? ' · 设备上限' : ''}`);
      const aspect = width / height;
      walk.aspect = aspect;
      walk.updateProjectionMatrix();
      if (bounds && Math.abs(aspect - lastAspect) > 0.01) {
        // 画面比例变了，全景要重新框人；跟拍机位跟着换（不是瞬移，弹簧照常走）
        lastAspect = aspect;
        shots.clearShots();
        shotKey = '';
        shotSince = 0;
      }
      if (model && bounds) {
        // 俯瞰视角按房间外框取景，和以前一样
        const corners: Vector3[] = [];
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z])
              corners.push(new Vector3(x, y, z).applyMatrix4(orbit.matrixWorldInverse));
        const xRange = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x));
        const yRange = Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y));
        const viewHeight = Math.max(xRange / aspect, yRange) * 1.2;
        orbit.left = -viewHeight * aspect / 2;
        orbit.right = viewHeight * aspect / 2;
        orbit.top = viewHeight / 2;
        orbit.bottom = -viewHeight / 2;
      } else {
        orbit.left = -aspect;
        orbit.right = aspect;
        orbit.top = 1;
        orbit.bottom = -1;
      }
      orbit.updateProjectionMatrix();
      publishPositions();
    };
    controls.addEventListener('change', () => publishPositions());

    const onPointerDown = (event: PointerEvent) => {
      if (!['inside', 'actor'].includes(modeRef.current) || event.button !== 0) return;
      takeOver();
      looking = true;
      lookX = event.clientX;
      lookY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!looking || !['inside', 'actor'].includes(modeRef.current)) return;
      manualYaw -= (event.clientX - lookX) * LOOK_SPEED;
      manualPitch = clamp(manualPitch - (event.clientY - lookY) * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT);
      lookX = event.clientX;
      lookY = event.clientY;
      walk.rotation.set(manualPitch, manualYaw, 0);
      publishPositions();
    };
    const onPointerUp = () => { looking = false; };
    const onWheel = (event: WheelEvent) => {
      if (!['inside', 'actor'].includes(modeRef.current)) return;   // 俯瞰视角把滚轮留给 OrbitControls
      event.preventDefault();
      takeOver();
      walk.fov = clamp(walk.fov + event.deltaY * 0.03, 30, 78);
      walk.updateProjectionMatrix();
      publishPositions();
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const observer = new ResizeObserver(resize);
    observer.observe(host);

    void loadStageModel(scene.model3d).then((loadedModel) => {
      if (disposed) { disposeModel(loadedModel); return; }
      model = loadedModel;
      const prepared = prepareStageModel(model, {
        overview: modeRef.current === 'overview',
        anisotropy: Math.min(STAGE_QUALITY['medium'].anisotropy, renderer.capabilities.getMaxAnisotropy()),
        sat: tuning.sat,
      });
      roomMetrics = prepared.roomMetrics;
      ceilingPartsRef.current = prepared.ceilingParts;
      seatSurfaces.push(...prepared.seatSurfaces);
      walls.push(...prepared.walls);
      world.add(model);
      bounds = new Box3().setFromObject(model);
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      post.setScale(Math.max(size.x, size.y, size.z));
      // 阴影相机按各房间自己的外框取景：四个房间大小不一，固定的 ±1.3 只框得住精模
      const reach = Math.max(size.x, size.z) * 0.75;
      Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 12 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.position.set(center.x - 2, center.y + 4, center.z + 3);
      sun.target.position.copy(center);
      world.add(sun.target);
      // 这套模型只有四面墙、顶上敞着，从屋里抬头会直接看到背景色。
      // 照墙面的配色补一层顶，把房间封上。顶要铺得比房间大一圈——墙顶是斜的，
      // 只盖房间本身的话，墙矮的那几段上方会漏出一条黑缝。
      // 精模自带水平天花板、木梁和灯具；其他房间沿用暖色补顶。
      if (ceilingPartsRef.current.length === 0) {
        ceiling = createStageCeiling(bounds, modeRef.current !== 'overview');
        ceilingRef.current = ceiling;
        world.add(ceiling);
      }
      controls.target.copy(center);
      orbit.position.copy(center).add(new Vector3(size.x * 0.12, size.length() * 1.1, size.length() * 0.9));
      orbit.lookAt(center);
      orbit.updateMatrixWorld();
      avatarHeight = (roomMetrics?.avatarHeight ?? size.y * (AVATAR_SHARE[scene.sourceSceneId ?? scene.id] ?? 0.1)) * 1.15;
      // 镜头不能顶到天花板上挂的东西（木梁、吊灯）：以最低的那件为上限
      ceilingY = roomMetrics?.ceiling ?? bounds.max.y;
      for (const part of ceilingPartsRef.current) ceilingY = Math.min(ceilingY, new Box3().setFromObject(part).min.y);
      if (roomMetrics) floorY = roomMetrics.floor;
      else {
        // 默认机位脚下就是地板：从那儿往下打一条线量地面高度
        const home = shots.vantage();
        ray.set(new Vector3(home.x, bounds.max.y + 1, home.z), new Vector3(0, -1, 0));
        floorY = ray.intersectObjects(seatSurfaces, false).find((hit) => hit.point.y <= bounds!.min.y + size.y * 0.15)?.point.y ?? bounds.min.y;
      }
      seats.push(...computeStageSeats(scene, bounds, roomMetrics, ray, seatSurfaces, floorY, avatarHeight));
      occupancy = new Occupancy(seatSurfaces, bounds);
      walk.near = Math.max(0.0001, Math.min(0.01, avatarHeight * 0.1));
      walk.far = Math.max(4, size.length() * 8);
      orbit.near = walk.near;
      orbit.far = walk.far;
      clearSeatHeads(seats, bounds, occupancy, avatarHeight);
      actorLayer = new ScenePixelActors(avatarHeight);
      world.add(actorLayer.root);
      renderer.shadowMap.needsUpdate = true;
      ready = true;
      setLoading(false);
      shots.warmUp();
      // 先把镜头摆到开场机位再发布人物位置，免得第一帧按原点的相机把人摆歪
      walk.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
      lastAspect = walk.aspect;
      if (modeRef.current === 'inside') {
        if (followRef.current) driveCamera(performance.now());
        else {
          const shot = shots.wideShot();
          walk.position.copy(shot.pos); walk.lookAt(shot.target); walk.fov = shot.fov;
          const facing = new Euler().setFromQuaternion(walk.quaternion, 'YXZ');
          manualYaw = facing.y; manualPitch = facing.x;
        }
      } else if (modeRef.current === 'walk' || modeRef.current === 'free') enterMotion(modeRef.current);
      else if (modeRef.current === 'actor' && povRef.current) enterPovRef.current?.(povRef.current);
      resize();
      callbacks.current.onLoaded();
    }).catch(() => {
      if (!disposed) { setLoading(false); callbacks.current.onLoaded('3D 模型加载失败，已切换回场景原图'); }
    });

    const tick = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      if (document.hidden) { lastTick = now; return; }
      if (ready && modeRef.current === 'inside' && followRef.current) driveCamera(now);
      if (ready && (modeRef.current === 'free' || modeRef.current === 'walk')) freeCamRef.current?.update(Math.min(1 / 30, Math.max(0, (now - lastTick) / 1000)), walk);
      lastTick = now;
      if (modeRef.current === 'overview') controls.update();
      if (ready && modeRef.current !== 'overview') publishPositions(now);
      else flushView(now);
      if (ready) actorLayer?.update(actorsRef.current, seats, activeCamera(), now, reduceMotion);
      if (actorLayer) for (const actor of actorLayer.actors.values()) actor.root.visible = !(modeRef.current === 'actor' && actor.member.id === povRef.current);
      const camera = activeCamera();
      post.setCamera(camera);
      if (ready && bounds) {
        const target = modeRef.current === 'inside' && followRef.current ? rig.target : modeRef.current === 'overview' ? controls.target : bounds.getCenter(new Vector3());
        const direction = camera.getWorldDirection(new Vector3());
        let distance = target.clone().sub(camera.position).dot(direction);
        if (modeRef.current !== 'overview' && !(modeRef.current === 'inside' && followRef.current) && occupancy) {
          distance = bounds.getSize(new Vector3()).length();
          for (let reach = avatarHeight; reach < distance; reach += occupancy.cellSize) {
            if (occupancy.occupied(camera.position.clone().addScaledVector(direction, reach))) { distance = reach; break; }
          }
        }
        post.setFocus(Math.max(avatarHeight, distance));
      }
      post.render();
      if (now - lastDiagnosticAt > 250 || !renderer.domElement.hasAttribute('data-stage-render')) {
        lastDiagnosticAt = now;
        renderer.domElement.setAttribute('data-stage-render', JSON.stringify({ ...post.describe(), scene: scene.id, mode: modeRef.current, pov: povRef.current || null, position: camera.position.toArray(), navigation: { floorY, ceilingY, avatarHeight, bounds: bounds ? { min: bounds.min.toArray(), max: bounds.max.toArray() } : null }, shadow: renderer.shadowMap.enabled ? sun.shadow.mapSize.x : 0, anisotropy: Math.min(16, renderer.capabilities.getMaxAnisotropy()), pixelRatio: renderer.getPixelRatio(), width: renderer.domElement.width, height: renderer.domElement.height, antialias: renderer.getContext().getContextAttributes()?.antialias }));
      }
      if (ready && shots.warm.length) shots.shotFor(shots.warm.shift()!);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      freeCam?.dispose();
      freeCamRef.current = null;
      enterMotionRef.current = null;
      enterPovRef.current = null;
      sun.shadow.map?.dispose();
      controlsRef.current = null;
      refreshViewRef.current = null;
      setFollowRef.current = null;
      ceilingPartsRef.current = [];
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      if (ceiling) {
        ceiling.geometry.dispose();
        (ceiling.material as MeshBasicMaterial).dispose();
        ceilingRef.current = null;
      }
      if (model) disposeModel(model);
      actorLayer?.dispose();
      post.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
    };
  }, [scene]);

  // 切视角时把当前模式告诉外面，提示文案跟着改
  useEffect(() => {
    modeRef.current = mode;
    const indoor = mode !== 'overview';
    if (ceilingRef.current) ceilingRef.current.visible = indoor;
    for (const part of ceilingPartsRef.current) part.visible = indoor;
    if (controlsRef.current) controlsRef.current.enabled = mode === 'overview';
    // 离开自由视角：停掉自由镜头；原来在跟拍的话，从当前画面平滑转回跟拍机位
    if (['free', 'walk'].includes(prevModeRef.current) && !['free', 'walk'].includes(mode)) {
      freeCamRef.current?.exit();
      if (freeWasFollowingRef.current && mode === 'inside') {
        freeWasFollowingRef.current = false;
        setFollowRef.current?.(true);
      }
    }
    prevModeRef.current = mode;
    refreshViewRef.current?.();
    callbacks.current.onModeChange?.(mode);
  }, [mode]);

  useEffect(() => {
    followRef.current = follow;
    callbacks.current.onFollowChange?.(follow);
  }, [follow]);

  return (
    <div className="stage-3d-canvas" ref={hostRef} aria-busy={loading}>
      {loading && <span className="stage-loading-status" role="status">正在加载 3D 场景…</span>}
      <div className="stage-cam-bar stage-controls">
        {mode === 'inside' && <button
          className={'stage-cam-toggle follow' + (follow ? ' on' : '')}
          aria-pressed={follow}
          onClick={(event) => { event.stopPropagation(); setFollowRef.current?.(!follow); }}
          title={follow ? '镜头正跟着说话的人走；点一下停在当前画面，自己拖动看' : '把镜头交还：重新跟着说话的人走'}
        >{follow ? <><i className="rec">●</i> 跟拍</> : '○ 跟拍'}</button>}
        <label>视角<select aria-label="舞台视角" disabled={loading} value={mode === 'actor' ? 'actor' : mode} onChange={(event) => {
          const next = event.target.value as StageViewMode;
          if (next === 'walk' || next === 'free') enterMotionRef.current?.(next);
          else { setPov(''); setMode(next); if (next === 'inside') setFollowRef.current?.(true); }
        }}>
          <option value="inside">{follow ? '室内跟拍' : '室内手动'}</option><option value="overview">俯视</option>
          <option value="walk">第一人称行走</option><option value="free">自由飞行</option>
          {mode === 'actor' && <option value="actor">角色视角</option>}
        </select></label>
        <label>角色<select aria-label="角色视角" value={mode === 'actor' ? pov : ''} disabled={loading || !actors.length} onChange={(event) => {
          if (event.target.value) enterPovRef.current?.(event.target.value);
          else { setPov(''); setMode('inside'); setFollowRef.current?.(true); }
        }}>
          <option value="">观战镜头</option>
          {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name ?? `角色 ${actor.seatIndex + 1}`}</option>)}
        </select></label>
        <span className="stage-render-info">{renderInfo}</span>
      </div>
      {viewError && <span className="stage-model-error" role="status">{viewError}</span>}
    </div>
  );
}
