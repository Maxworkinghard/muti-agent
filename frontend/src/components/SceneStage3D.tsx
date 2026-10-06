import { useEffect, useRef, useState } from 'react';
import {
  Box3, DirectionalLight, DoubleSide, Euler, Group, HemisphereLight,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, NoToneMapping, OrthographicCamera, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
} from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneDef, Seat } from '../types';
import type { StageView } from './stageFacing';
import { ScenePixelActors, type SceneCastMember } from './scenePixelActors';
import { Occupancy } from './stageOccupancy';

/**
 * Rendering constants chosen by sweeping light intensity, saturation and tone curve
 * against an unlit (MeshBasicMaterial) pass of the same model and scoring the mean
 * absolute difference per pixel. Each scene was scored independently; the values
 * below are the best shared setting (mean error 9.1 vs 18.9 for the previous
 * NeutralToneMapping setup). sat stays 1 for every scene: the texture needs no
 * correction once the tone curve is out of the way.
 */
const STAGE_TUNING = {
  hemi: 3.0,
  groundColor: 0xa89a90,
  key: 0.4,
  fill: 0.1,
  exposure: 1,
  sat: 1,
} as const;

/** 屋里看出去时的取景：站在房间一头、眼睛高度，朝中心看 */
const ROOM_VIEW = {
  fov: 62,
  /** 眼睛在房间净高里的位置 */
  eye: 0.40,
  /** 从房间中心往观众侧退多少（占房间进深） */
  back: 0.40,
  /** 站位再往旁边偏一点（占房间宽度），避开正对镜头的那件家具 */
  side: 0.0,
  /** 视线落点的高度 */
  look: 0.26,
} as const;
/**
 * 各场景的站位微调：默认正对房间中心站着，个别房间里正中间摆着家具
 * （例如圆桌那张正对镜头的大椅子）就横向挪开一点，别让它糊在镜头上。
 */
const SCENE_VIEW: Record<string, { side?: number; back?: number; eye?: number; look?: number; fov?: number }> = {
  // 圆桌正中有把大椅子顶在镜头上，横向挪开半个座位、站高一点
  roundtable: { side: 0.13, eye: 0.52, back: 0.34 },
  // 办公室中间是一圈文件柜，站高些越过它才看得见两边的工位
  office: { eye: 0.70, back: 0.46, look: 0.20, fov: 66 },
  'debate-meshy': { eye: 0.54, back: 0.46, look: 0.54, fov: 56 },
};
/** 补的天花板颜色：取自墙面的暖色，和这套房间的配色一致 */
const CEILING_COLOR = '#e6d3ae';
/** 抬头低头的上下限 */
const PITCH_LIMIT = 1.15;
const LOOK_SPEED = 0.004;
/** 座位点往上抬多少再当锚点（占房间净高）。0 = 正好落在桌面/讲台面上 */
const SEAT_LIFT = 0;

/**
 * 跟拍：镜头跟着讨论走，像导播切机位。没人说话拍全景；有人在想，镜头先移到他那边；
 * 开口了推到中近景（离得近的交流对象一起入画），能看清表情和手势，也看得懂大家的交流关系。
 * frac 是人物半身占画面高度的比例；omega 是镜头弹簧的角频率（3 左右约 1.5 秒到位）。
 */
const FOLLOW = {
  speak: { frac: 0.2, fov: 46 },
  think: { frac: 0.15, fov: 48 },
  /** 一个镜头至少停这么久再切：你一句我一句时镜头不来回甩 */
  hold: 2600,
  omega: 2.6,
  /** 镜头停着时的轻微呼吸，占到人物距离的比例；画面不至于像监控一样死 */
  breathe: 0.002,
  /** 全景往下俯的角度：先试 16°（画面上沿压在后墙顶附近，天花板基本出画），框不全再升高 */
  widePitches: [16, 28, 40, 55].map((deg) => (deg * Math.PI) / 180),
  /** 屋里框不全时，从屋顶上方往下拍的俯角 */
  dronePitch: (50 * Math.PI) / 180,
} as const;
/**
 * 人物半身（36px 那张像素小人）在世界里有多高，占房间包围盒高度的比例。
 * 精模自带 roomMetrics.avatarHeight；其余三间没有尺寸标定，按「半身约为桌高的 2/3」
 * （桌高约 0.75 米，坐着露出桌面的头肩约 0.5 米）换算：在每个人座位和房间中心之间往下打线量桌面，
 * 圆桌桌高 0.085、辩论室 0.058、办公室 0.0845（模型单位，房间高分别是 0.3475、0.4243、0.222）。
 */
const AVATAR_SHARE: Record<string, number> = { roundtable: 0.163, debate: 0.091, office: 0.254 };
/** 人物缩放的上下限：太远时也要认得出，推近时不至于糊满画面 */
const SCALE_RANGE = { min: 0.55, max: 7, overviewMin: 0.8 } as const;
const UP = new Vector3(0, 1, 0);

export type StageViewMode = 'inside' | 'overview';

/** 外面告诉舞台现在该拍谁：座位下标为 null 时拍全景 */
export interface StageCue {
  seat: number | null;
  shot: 'wide' | 'think' | 'speak';
  /** 上一位发言者／被回应的人，让镜头保留交流对象。 */
  listener?: number;
}

interface Shot { pos: Vector3; target: Vector3; fov: number }

function disposeModel(model: Group) {
  const textures = new Set<Texture>();
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

/**
 * Optional saturation trim, around perceptual luma so hue and relative brightness
 * are preserved. Measured against the source art, the Meshy base colour texture is
 * already faithful, so the stage runs at 1.0 (no boost) and this is only a knob for
 * per-scene taste.
 */
function boostSaturation(material: MeshStandardMaterial, amount: number) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.saturationAmount = { value: amount };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float saturationAmount;')
      .replace(
        '#include <map_fragment>',
        ['#include <map_fragment>',
         'vec3 stageLuma = vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));',
         'diffuseColor.rgb = clamp(mix(stageLuma, diffuseColor.rgb, saturationAmount), 0.0, 1.0);'].join('\n'),
      );
  };
  material.needsUpdate = true;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 临界阻尼弹簧走一步：起步和收尾都是缓的，中途换目标也不会急停急转 */
function spring(x: Vector3, v: Vector3, goal: Vector3, omega: number, dt: number) {
  for (const k of ['x', 'y', 'z'] as const) {
    v[k] += (omega * omega * (goal[k] - x[k]) - 2 * omega * v[k]) * dt;
    x[k] += v[k] * dt;
  }
}

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
  const tuning = scene.id === 'debate-meshy' ? { ...STAGE_TUNING, hemi: 2.5, key: 0.7, fill: 0.15 } : STAGE_TUNING;
  const [mode, setMode] = useState<StageViewMode>('inside');
  const modeRef = useRef<StageViewMode>(mode);
  modeRef.current = mode;
  const [follow, setFollow] = useState(true);
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

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !scene.model3d) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      callbacks.current.onLoaded('当前设备无法启动 WebGL，已切换回场景原图');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    // The imported maps are flat, hand-authored pixel art. Any filmic curve (ACES,
    // Neutral, AgX) compresses their saturated, mid-bright colours, which is what
    // made the rooms read washed out, so render them straight through.
    renderer.toneMapping = NoToneMapping;
    renderer.toneMappingExposure = tuning.exposure;
    renderer.shadowMap.enabled = scene.id === 'debate-meshy';
    renderer.shadowMap.type = PCFSoftShadowMap;
    // 房间和灯都不动，只有镜头在动：阴影图只在墙面显隐变化时重画
    renderer.shadowMap.autoUpdate = false;
    // 背景色跟着天花板走：万一还有缝，露出来的是屋里的暖色，而不是一块黑
    renderer.setClearColor(CEILING_COLOR);
    renderer.domElement.setAttribute('aria-label', scene.name + '，镜头跟着说话的人走；拖动可自己转头看，滚轮推拉，可切到俯视');
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('role', 'img');
    host.appendChild(renderer.domElement);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    // Tuned by measuring the lit render against an unlit pass of the same texture
    // (see frontend/public/models/README.md). A hemisphere light near full sky
    // irradiance plus a light key reproduces the baked colours with only a little
    // directional falloff to keep the room readable as 3D.
    const world = new Scene();
    world.add(new HemisphereLight(0xffffff, tuning.groundColor, tuning.hemi));
    const sun = new DirectionalLight(0xfff3e2, tuning.key);
    sun.position.set(-2, 4, 3);
    if (renderer.shadowMap.enabled) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: 1, far: 8 });
      sun.shadow.bias = -0.00006;
      sun.shadow.normalBias = 0.002;
    }
    world.add(sun);
    const bounce = new DirectionalLight(0xdfe7ff, tuning.fill);
    bounce.position.set(3, 2, -3);
    world.add(bounce);

    // 屋里看：透视相机。跟拍时由下面的镜头弹簧摆位，用户接手后原地转头
    const walk = new PerspectiveCamera(ROOM_VIEW.fov, 1, 0.01, 100);
    const roomView = () => ({ ...ROOM_VIEW, ...(SCENE_VIEW[scene.id] ?? SCENE_VIEW[scene.sourceSceneId ?? scene.id]) });
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
    let roomMetrics: { floor: number; ceiling: number; eyeHeight: number; lookHeight: number; seatLift: number; avatarHeight: number } | null = null;
    const walls: { mesh: Mesh; side: string }[] = [];
    let ready = false;
    let disposed = false;
    let frame = 0;
    let lastPositions = '';
    let lastView = '';
    let pendingView: StageView | null = null;
    let lastViewAt = 0;
    let looking = false;
    let lookX = 0;
    let lookY = 0;
    let manualYaw = 0;
    let manualPitch = 0;
    /** 人物半身在世界里的高度，以及屋里能放镜头的高度范围 */
    let avatarHeight = 0;
    let floorY = 0;
    let ceilingY = 0;

    // 镜头弹簧：现在的位置 / 看的点 / 视场角，各自的速度，以及要去的机位
    const rig = {
      pos: new Vector3(), target: new Vector3(), fov: ROOM_VIEW.fov as number,
      vPos: new Vector3(), vTarget: new Vector3(), vFov: 0,
      goal: null as Shot | null,
    };
    let shotKey = '';
    let shotSince = 0;
    let lastTick = 0;
    const shotCache = new Map<string, Shot | null>();
    const ray = new Raycaster();

    const activeCamera = () => (modeRef.current === 'inside' ? walk : orbit);

    /** 相机在水平面上的轴：局部 X 是屏幕向右，局部 +Z 从场景指向观众 */
    const flatAxis = (v: Vector3) => {
      const length = Math.hypot(v.x, v.z);
      return length < 1e-6 ? null : { x: +(v.x / length).toFixed(2), z: +(v.z / length).toFixed(2) };
    };

    /** 默认机位：站在观众那头、眼睛高度 */
    const vantage = () => {
      const view = roomView();
      const center = bounds!.getCenter(new Vector3());
      const size = bounds!.getSize(new Vector3());
      return new Vector3(
        center.x + size.x * view.side,
        roomMetrics ? roomMetrics.floor + roomMetrics.eyeHeight : bounds!.min.y + size.y * view.eye,
        center.z + size.z * view.back,
      );
    };
    const castSeats = () => castRef.current.map((i) => seats[i]).filter((seat): seat is Vector3 => Boolean(seat));

    /** 从 from 看向 target 时，要多大的竖直视场角才能把这些点都框进来（留 margin 倍余量） */
    const fitFov = (from: Vector3, target: Vector3, points: Vector3[], margin: number) => {
      const probe = new PerspectiveCamera(50, walk.aspect, 0.01, 100);
      probe.position.copy(from);
      probe.lookAt(target);
      probe.updateMatrixWorld();
      let need = 0;
      for (const point of points) {
        const q = point.clone().applyMatrix4(probe.matrixWorldInverse);
        // 有人在镜头侧面或身后：多大的视场角都框不进来
        if (q.z > -1e-3) return 180;
        need = Math.max(need, Math.abs(q.y) / -q.z, Math.abs(q.x) / -q.z / walk.aspect);
      }
      return (2 * Math.atan(need * margin) * 180) / Math.PI;
    };

    /**
     * 全景：从观众那头稍高处往下拍，像辩论节目的摇臂机位：把在座的人都框进来，
     * 视线微微朝下，画面给人和桌子，少拍天花板。
     */
    const wideShot = (): Shot => {
      const view = roomView();
      const pos = vantage();
      const people = castSeats();
      if (!people.length) {
        const center = bounds!.getCenter(new Vector3());
        const size = bounds!.getSize(new Vector3());
        return { pos, target: new Vector3(center.x, roomMetrics ? roomMetrics.floor + roomMetrics.lookHeight : bounds!.min.y + size.y * view.look, center.z), fov: view.fov };
      }
      const target = new Vector3();
      for (const seat of people) target.add(seat);
      target.divideScalar(people.length);
      target.y += avatarHeight * 0.55;
      const corners = people.flatMap((seat) => [
        seat.clone().add(new Vector3(-avatarHeight * 0.4, -avatarHeight * 0.15, 0)),
        seat.clone().add(new Vector3(avatarHeight * 0.4, avatarHeight * 1.05, 0)),
      ]);
      // 从人群中心朝默认机位的方向往后退，直到能把所有人框进来（围坐一圈时默认机位在圈里，得退到圈外）；
      // 人散在四周的房间（办公室）平视怎么退都框不全，就把镜头升高、往下俯得更多。
      // 俯角从小往大试，用第一个框得全的；都不行就取视场角最小的那个
      const away = new Vector3(pos.x - target.x, 0, pos.z - target.z);
      if (away.lengthSq() < 1e-8) away.set(0, 0, 1);
      away.normalize();
      const size = bounds!.getSize(new Vector3());
      const start = Math.hypot(pos.x - target.x, pos.z - target.z);
      let best: Shot | null = null;
      for (const pitch of FOLLOW.widePitches) {
        for (let reach = start; reach <= Math.hypot(size.x, size.z); reach += Math.max(size.x, size.z) * 0.05) {
          const at = keepInside(target.clone().addScaledVector(away, reach).setY(target.y + reach * Math.tan(pitch)));
          at.y = clamp(at.y, floorY + avatarHeight, ceilingY - avatarHeight);
          const fov = fitFov(at, target, corners, 1.12);
          if (!best || fov < best.fov) best = { pos: at, target, fov };
          if (fov <= 48) return { pos: at, target, fov: Math.max(30, fov) };
        }
      }
      // 屋里怎么站都框不全（顶上敞开、人沿四面墙坐的办公室）：升到屋顶上方往下拍，像无人机开场。
      // 镜头在屋顶以上时补的顶会自动隐藏（见 publishPositions），有人开口再降进屋里
      for (let reach = start; reach <= Math.hypot(size.x, size.z) * 2; reach += Math.max(size.x, size.z) * 0.05) {
        const at = target.clone().addScaledVector(away, reach * Math.cos(FOLLOW.dronePitch));
        at.y = Math.max(target.y + reach * Math.sin(FOLLOW.dronePitch), bounds!.max.y + avatarHeight);
        const fov = fitFov(at, target, corners, 1.15);
        if (fov <= view.fov) return { pos: at, target, fov: Math.max(30, fov) };
      }
      return { ...best!, fov: clamp(best!.fov, 30, view.fov) };
    };

    /**
     * 从人物的头往镜头看过去，四周要有空：中间那条线必须通，往左、右、上各偏开四分之一距离的三条线至少通两条。
     * 只查中间一条线的话，镜头会贴着隔板或柜子站，人看得见，画面却被半堵墙占了
     */
    const clearView = (head: Vector3, pos: Vector3) => {
      if (!headVisible(head, pos)) return false;
      const toward = pos.clone().sub(head);
      const side = new Vector3().crossVectors(toward, UP).normalize().multiplyScalar(toward.length() * 0.25);
      const lift = UP.clone().multiplyScalar(toward.length() * 0.25);
      const open = [pos.clone().add(side), pos.clone().sub(side), pos.clone().add(lift)].filter((p) => clearLine(head, p)).length;
      return open >= 2 && roomy(pos, head);
    };
    /**
     * 他的脸从镜头那儿看得见吗：从头部中间、左右、上下五个点各拉一条线，至少三条通就算看得见。
     * 人物画在场景里会被近处的东西挡；面前一根细话筒架挡住一点没关系，整张脸被挡才算挡住
     */
    const headVisible = (head: Vector3, pos: Vector3) => {
      const side = new Vector3().crossVectors(pos.clone().sub(head), UP).normalize().multiplyScalar(avatarHeight * 0.3);
      const points = [head, head.clone().add(side), head.clone().sub(side), head.clone().addScaledVector(UP, avatarHeight * 0.3), head.clone().addScaledVector(UP, -avatarHeight * 0.25)];
      let open = 0;
      for (const [i, point] of points.entries()) {
        if (clearLine(point, pos)) open++;
        // 已经够三条，或者剩下的全通也凑不够，就不用再打了
        if (open >= 3 || open + points.length - 1 - i < 3) break;
      }
      return open >= 3;
    };
    /**
     * 镜头正前方近处不能有东西糊在画面上（比如脸前一支大话筒、贴着镜头的柜子）：从镜头往画面中间一行、偏上一行
     * 各打三条短线（到人物一半距离），偏下一行打更短的三条（四分之一距离），碰到东西就不要这个机位
     */
    const foregroundClear = (pos: Vector3, target: Vector3, fov: number) => {
      const forward = target.clone().sub(pos);
      const reach = forward.length() * 0.5;
      forward.normalize();
      const right = new Vector3().crossVectors(forward, UP).normalize();
      const up = new Vector3().crossVectors(right, forward).normalize();
      const tanV = Math.tan((fov * Math.PI) / 360);
      const tanH = tanV * walk.aspect;
      // 下面一行只查一半距离：桌面在下方做前景没关系，贴着镜头的柜子、打印机才算糊
      for (const [v, share] of [[0, 1], [0.55, 1], [-0.45, 0.5]]) {
        for (const u of [-0.6, 0, 0.6]) {
          const dir = forward.clone().addScaledVector(right, u * tanH).addScaledVector(up, v * tanV).normalize();
          if (blocked(pos, pos.clone().addScaledVector(dir, reach * share))) return false;
        }
      }
      return true;
    };
    /** 镜头身边要留出空：左、右、左前、右前在三成拍摄距离内碰到东西，说明镜头贴着隔板或柜子站 */
    const roomy = (pos: Vector3, head: Vector3) => {
      const ahead = new Vector3(head.x - pos.x, 0, head.z - pos.z);
      const reach = ahead.length() * 0.3;
      ahead.normalize();
      const left = new Vector3(-ahead.z, 0, ahead.x);
      return [left, left.clone().negate(), left.clone().add(ahead).normalize(), left.clone().negate().add(ahead).normalize()]
        .every((dir) => !blocked(pos, pos.clone().addScaledVector(dir, reach)));
    };
    /**
     * 从人物的头往镜头拉一条线，中间不能撞上墙、柜子、大盆栽，也不能被他面前的话筒挡住脸。
     * 起点离头 0.12 个半身高（且不少于一个占位格），只跳过和头紧挨着的那一点；
     * 加载时已经把嵌进桌上东西的头挪了出来（见座位校正）
     */
    const clearLine = (head: Vector3, pos: Vector3) => !blocked(head, pos, Math.max(avatarHeight * 0.12, occupancy?.cellSize ?? 0));
    /** 两点之间有没有被挡：在占位网格里走（快）；网格还没建好时退回逐个三角面求交 */
    const blocked = (from: Vector3, to: Vector3, skip = 0) => {
      if (occupancy) return occupancy.blocked(from, to, skip);
      const toward = to.clone().sub(from);
      const length = toward.length();
      toward.divideScalar(length);
      ray.set(from.clone().addScaledVector(toward, skip), toward);
      ray.near = 0;
      ray.far = Math.max(0, length - skip);
      const hit = ray.intersectObjects(seatSurfaces.filter((mesh) => mesh.visible), false).length > 0;
      ray.far = Infinity;
      return hit;
    };
    /** 镜头和他之间别正好隔着另一个人，否则前景一个大脑袋把他挡住 */
    const personInWay = (pos: Vector3, head: Vector3, index: number) => {
      const toward = head.clone().sub(pos);
      const length = toward.length();
      toward.divideScalar(length);
      return castRef.current.some((i) => {
        if (i === index || !seats[i]) return false;
        const other = seats[i].clone().setY(seats[i].y + avatarHeight * 0.5).sub(pos);
        const along = other.dot(toward);
        if (along <= 0 || along >= length * 0.92) return false;
        return other.addScaledVector(toward, -along).length() < avatarHeight * 0.9;
      });
    };
    const keepInside = (pos: Vector3) => {
      const size = bounds!.getSize(new Vector3());
      const inset = Math.min(size.x, size.z) * 0.06;
      pos.x = clamp(pos.x, bounds!.min.x + inset, bounds!.max.x - inset);
      pos.z = clamp(pos.z, bounds!.min.z + inset, bounds!.max.z - inset);
      pos.y = clamp(pos.y, floorY + avatarHeight * 0.6, ceilingY - avatarHeight * 0.25);
      return pos;
    };

    /**
     * 说话的人和交流对象同框，像对话戏的过肩镜头：镜头站到对象那边、斜开一个角度，
     * 对象留在画面一侧，说话的人在中间、看得到正脸。机位同样要在屋里、四周不被挡、不被别人挡住，
     * 两人都进得了 48° 以内的画面才用；找不到返回 null，交给单人镜头。
     */
    const pairShot = (index: number, partnerIndex: number, head: Vector3, facing: Vector3, signs: number[]): Shot | null => {
      const partner = seats[partnerIndex];
      const partnerHead = partner.clone().setY(partner.y + avatarHeight * 0.6);
      const toward = new Vector3(partnerHead.x - head.x, 0, partnerHead.z - head.z);
      const gap = toward.length();
      // 隔得太远（辩论室两边的长桌之间）硬凑同框，两个人都只剩一点点：交给单人镜头，镜头仍站在对方那一侧
      if (gap < avatarHeight || gap > avatarHeight * 5.5) return null;
      toward.normalize();
      const target = head.clone().lerp(partnerHead, 0.3);
      // 两个人从桌面到头顶都要进画面
      const points = [seats[index], head.clone().setY(head.y + avatarHeight * 0.5), partner, partnerHead.clone().setY(partnerHead.y + avatarHeight * 0.5)];
      // 抬得太高就成了俯拍，只看得到头顶
      for (const lift of [0.6, 1.2, 1.8]) {
        for (const angle of [32, 48, 20, 64]) {
          for (const sign of signs) {
            // 从「两人间距」和「两个半身高」里取大的起步，框不下就往后退：邻座两人挨得近，按间距算会贴到脸上
            for (let step = 0, reach = Math.max(gap * 0.9, avatarHeight * 2.2); step < 4; step++, reach *= 1.25) {
              const dir = toward.clone().applyAxisAngle(UP, (sign * angle * Math.PI) / 180);
              const want = target.clone().addScaledVector(dir, reach).setY(target.y + avatarHeight * lift);
              const pos = keepInside(want.clone());
              // 被墙挤开太多就不是原来想的构图了
              if (pos.distanceTo(want) > reach * 0.15) continue;
              // 镜头要在说话的人面前（他面朝的那一侧）：邻座两人并排时，站到桌子后面只能拍到两个后脑勺
              const front = new Vector3(pos.x - head.x, 0, pos.z - head.z);
              if (front.dot(facing) < front.length() * 0.25) continue;
              const fov = fitFov(pos, target, points, 1.15);
              if (fov > 48) continue;
              if (!clearView(head, pos) || !headVisible(partnerHead, pos) || personInWay(pos, head, index)) continue;
              if (!foregroundClear(pos, target, clamp(fov, 32, 46))) continue;
              return { pos, target, fov: clamp(fov, 32, 46) };
            }
          }
        }
      }
      return null;
    };

    /**
     * 拍某一个人：镜头在他面朝的那一侧（他对着说话的那群人），斜 20 来度，像对面观众席上的机位。
     * 开口时先试和交流对象同框（pairShot），不行再拍他一个人。
     * 两侧都能拍时选离默认机位近的一侧，镜头大体留在观众这边，不越轴。
     * 被墙或家具挡住就换角度、抬高、拉近；都不行返回 null，退回全景。
     */
    const personShot = (index: number, kind: 'think' | 'speak', listener?: number): Shot | null => {
      const anchor = seats[index];
      if (!anchor) return null;
      const spec = FOLLOW[kind];
      const head = anchor.clone().setY(anchor.y + avatarHeight * 0.6);
      const home = vantage();
      const othersIdx = castRef.current.filter((i) => i !== index && seats[i]);
      const others = othersIdx.map((i) => seats[i]);
      const listeners = others.length
        ? others.reduce((sum, seat) => sum.clone().add(seat), new Vector3()).divideScalar(others.length)
        : home;
      // 镜头站在他面朝的那一侧（他对着说话的那群人）：看得到正脸。站到他背后只能拍到后脑勺
      const facing = new Vector3(listeners.x - anchor.x, 0, listeners.z - anchor.z);
      if (facing.lengthSq() < 1e-8) facing.set(home.x - anchor.x, 0, home.z - anchor.z);
      facing.normalize();
      const distance = avatarHeight / (2 * Math.tan((spec.fov * Math.PI) / 360) * spec.frac);
      const sideDistance = (sign: number) => head.clone().addScaledVector(facing.clone().applyAxisAngle(UP, sign * 0.42), distance).distanceTo(home);
      const signs = sideDistance(1) <= sideDistance(-1) ? [1, -1] : [-1, 1];
      if (kind === 'speak') {
        // 开口时尽量和交流对象同框：上一位发言人；没有就取他正前方的人，不取坐在旁边的队友
        const partner = listener !== undefined && listener !== index && seats[listener] ? listener
          : othersIdx
            .map((i) => ({ i, front: seats[i].clone().sub(anchor).setY(0).normalize().dot(facing) }))
            .filter((x) => x.front > 0.35)
            .sort((a, b) => b.front - a.front)[0]?.i;
        const pair = partner === undefined ? null : pairShot(index, partner, head, facing, signs);
        if (pair) return pair;
      }
      // 单人镜头只和他是谁、在想还是在说有关：算过一次就记住，接谁的话都能直接用
      const soloKey = index + ':' + kind;
      if (!soloCache.has(soloKey)) soloCache.set(soloKey, soloShot(index, head, facing, distance, signs, spec.fov));
      return soloCache.get(soloKey) ?? null;
    };
    const soloCache = new Map<string, Shot | null>();
    /** 只拍他一个人：在他面朝的一侧斜开角度，挡住就换角度、抬高、拉近 */
    const soloShot = (index: number, head: Vector3, facing: Vector3, distance: number, signs: number[], fov: number): Shot | null => {
      for (const near of [1, 0.8, 0.62]) {
        for (const lift of [0.18, 0.7, 1.3]) {
          for (const angle of [24, 40, 10, 56]) {
            for (const sign of signs) {
              const dir = facing.clone().applyAxisAngle(UP, (sign * angle * Math.PI) / 180);
              const pos = keepInside(head.clone().addScaledVector(dir, distance * near).setY(head.y + avatarHeight * lift));
              if (pos.distanceTo(head) < distance * near * 0.6) continue;
              if (!clearView(head, pos) || personInWay(pos, head, index) || !foregroundClear(pos, head, fov)) continue;
              return { pos, target: head, fov };
            }
          }
        }
      }
      return null;
    };

    // 开发环境的舞台诊断；截图和帧序列检查使用同一个真实渲染器。
    if (import.meta.env.DEV) Object.assign(window, { __stage3d: { personShot, pairShot, wideShot, fitFov, clearView, headVisible, foregroundClear, seats, clearLine, personInWay, keepInside, ray, seatSurfaces, get avatarHeight() { return avatarHeight; }, get floorY() { return floorY; }, get ceilingY() { return ceilingY; }, get bounds() { return bounds; }, walk, rig, castRef, cueRef, followRef, modeRef, get shotKey() { return shotKey; }, get shotSince() { return shotSince; }, get ready() { return ready; }, Vector3,
      /** 页面在后台时没有动画帧：手动按 16ms 一帧快进 ms 毫秒，再渲染一帧 */
      get actorLayer() { return actorLayer; }, actorsRef,
      step(ms: number) { let t = Math.max(lastTick, shotSince, performance.now()); const end = t + ms; while (t < end) { t += 16; if (modeRef.current === 'inside' && followRef.current) driveCamera(t); lastTick = t; publishPositions(t); actorLayer?.update(actorsRef.current, seats, activeCamera(), t, reduceMotion); } renderer.render(world, activeCamera()); return t; } } });
    const keyOf = (c: StageCue) => (c.seat === null || c.shot === 'wide' ? 'wide:' + castRef.current.join(',') : c.shot + ':' + c.seat + ':' + (c.listener ?? ''));
    const shotFor = (c: StageCue): Shot => {
      const key = keyOf(c);
      if (!shotCache.has(key)) shotCache.set(key, c.seat === null || c.shot === 'wide' ? wideShot() : personShot(c.seat, c.shot, c.listener));
      return shotCache.get(key) ?? shotFor({ seat: null, shot: 'wide' });
    };
    /**
     * 进屋后每帧顺手算一个：全景和每个人「在想」「开口」的机位先进缓存。
     * 找机位要打几十上百条射线，等到有人开口那一帧再算会卡一下
     */
    const warm: StageCue[] = [];
    const warmUp = () => {
      warm.length = 0;
      warm.push({ seat: null, shot: 'wide' });
      for (const i of castRef.current) warm.push({ seat: i, shot: 'think' }, { seat: i, shot: 'speak' });
    };

    const publishPositions = (now = performance.now()) => {
      if (!ready || !bounds) return;
      const camera = activeCamera();
      camera.updateMatrixWorld();
      const center = bounds.getCenter(new Vector3());
      // 跟拍升到屋顶以上拍全景时，补的顶和吊顶会挡住视线：镜头在屋顶以上就隐藏，降回屋里再显示
      if (modeRef.current === 'inside') {
        const roof = camera.position.y < bounds.max.y;
        if (ceiling && ceiling.visible !== roof) ceiling.visible = roof;
        for (const part of ceilingPartsRef.current) part.visible = roof;
      }
      // 从外部俯视时切掉靠镜头的墙；室内仍是四面完整的房间。
      let wallsChanged = false;
      for (const wall of walls) {
        const toward = wall.side === 'left' ? center.x - camera.position.x
          : wall.side === 'right' ? camera.position.x - center.x
          : wall.side === 'back' ? center.z - camera.position.z
          : camera.position.z - center.z;
        const visible = modeRef.current === 'inside' || toward <= 0;
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
        const scale = modeRef.current === 'inside'
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
      const key = keyOf(c);
      if (key !== shotKey && (!rig.goal || now - shotSince >= FOLLOW.hold)) {
        const first = !rig.goal;
        rig.goal = shotFor(c);
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

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      walk.aspect = aspect;
      walk.updateProjectionMatrix();
      if (bounds && Math.abs(aspect - lastAspect) > 0.01) {
        // 画面比例变了，全景要重新框人；跟拍机位跟着换（不是瞬移，弹簧照常走）
        lastAspect = aspect;
        shotCache.clear();
        warmUp();
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
      if (modeRef.current !== 'inside' || event.button !== 0) return;
      takeOver();
      looking = true;
      lookX = event.clientX;
      lookY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!looking || modeRef.current !== 'inside') return;
      manualYaw -= (event.clientX - lookX) * LOOK_SPEED;
      manualPitch = clamp(manualPitch - (event.clientY - lookY) * LOOK_SPEED, -PITCH_LIMIT, PITCH_LIMIT);
      lookX = event.clientX;
      lookY = event.clientY;
      walk.rotation.set(manualPitch, manualYaw, 0);
      publishPositions();
    };
    const onPointerUp = () => { looking = false; };
    const onWheel = (event: WheelEvent) => {
      if (modeRef.current !== 'inside') return;   // 俯瞰视角把滚轮留给 OrbitControls
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

    void new GLTFLoader().loadAsync(scene.model3d).then((gltf) => {
      if (disposed) { disposeModel(gltf.scene); return; }
      model = gltf.scene;
      model.traverse((object) => {
        const metrics = object.userData.roomMetrics;
        if (metrics && ['floor', 'ceiling', 'eyeHeight', 'lookHeight', 'seatLift', 'avatarHeight'].every((key) => typeof metrics[key] === 'number' && Number.isFinite(metrics[key]))) roomMetrics = metrics;
      });
      // glTF turns a mesh with several materials into a Group. Its extras belong
      // to that parent, so propagate the ceiling marker to each rendered mesh.
      model.traverse((object) => {
        if (object.userData.stageCeiling || object.name.startsWith('SM_Ceiling_')) {
          object.traverse((part) => { part.userData.stageCeiling = true; });
        }
        if (object.userData.stageWall) {
          object.traverse((part) => { part.userData.stageWall = object.userData.stageWall; });
        }
      });
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        if (object.userData.stageCeiling || object.name.startsWith('SM_Ceiling_')) {
          ceilingPartsRef.current.push(object);
          object.visible = modeRef.current === 'inside';
        } else {
          seatSurfaces.push(object);
        }
        if (object.userData.stageWall) walls.push({ mesh: object, side: object.userData.stageWall });
        object.castShadow = renderer.shadowMap.enabled && !object.userData.stageCeiling;
        object.receiveShadow = renderer.shadowMap.enabled && !object.userData.stageCeiling;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) {
            if (value instanceof Texture) {
              value.anisotropy = value.magFilter === NearestFilter ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
            }
          }
          if (material instanceof MeshStandardMaterial && tuning.sat !== 1) boostSaturation(material, tuning.sat);
        }
      });
      world.add(model);
      bounds = new Box3().setFromObject(model);
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      // 这套模型只有四面墙、顶上敞着，从屋里抬头会直接看到背景色。
      // 照墙面的配色补一层顶，把房间封上。顶要铺得比房间大一圈——墙顶是斜的，
      // 只盖房间本身的话，墙矮的那几段上方会漏出一条黑缝。
      // 精模自带水平天花板、木梁和灯具；其他房间沿用暖色补顶。
      if (ceilingPartsRef.current.length === 0) {
        ceiling = new Mesh(
          new PlaneGeometry(size.x * 3, size.z * 3),
          new MeshBasicMaterial({ color: CEILING_COLOR, side: DoubleSide }),
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(center.x, bounds.max.y, center.z);
        ceiling.visible = modeRef.current === 'inside';
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
        const home = vantage();
        ray.set(new Vector3(home.x, bounds.max.y + 1, home.z), new Vector3(0, -1, 0));
        floorY = ray.intersectObjects(seatSurfaces, false)[0]?.point.y ?? bounds.min.y;
      }
      for (const seat of scene.modelSeats ?? scene.seats) {
        const x = bounds.min.x + size.x * seat.x / 100;
        const z = bounds.min.z + size.z * seat.y / 100;
        ray.set(new Vector3(x, bounds.max.y + 1, z), new Vector3(0, -1, 0));
        // 顶部装饰必须排除，否则向下射线会把人物放到天花板上。
        const surface = ray.intersectObjects(seatSurfaces, false)[0];
        const y = (surface?.point.y ?? bounds.min.y) + (roomMetrics ? roomMetrics.seatLift : size.y * 0.04);
        // 没有标定的房间里，射线可能落到坐垫或地板上：半身像的肩线不低于坐着时肩膀的高度（约 0.9 米，1.8 个半身高），
        // 否则人像跪在地上，近景镜头也会跟着压到桌子底下。精模的落点本来就按桌面标定，不受影响
        seats.push(new Vector3(x, roomMetrics ? y : Math.max(y, floorY + (avatarHeight / 1.15) * 1.8), z));
      }
      // 原锚点量在桌面上。人略向桌内侧退，头肩留在桌沿上方。
      for (const seat of seats) {
        const outward = new Vector3(seat.x - center.x, 0, seat.z - center.z).normalize();
        seat.addScaledVector(outward, avatarHeight * -0.22);
        seat.y -= avatarHeight * 0.12;
      }
      occupancy = new Occupancy(seatSurfaces, bounds);
      // 人物画在场景里，头不能嵌进桌上的东西（精模的话筒就立在两头的座位上，脸会被话筒头整个盖住）：
      // 头那一格有东西就往远离房间中心（椅子那一侧）挪，一次 0.1 个半身高，最多挪 6 次
      for (const seat of seats) {
        const outward = new Vector3(seat.x - center.x, 0, seat.z - center.z).normalize();
        for (let k = 0; k < 6 && occupancy.occupied(seat.clone().setY(seat.y + avatarHeight * 0.6)); k++) {
          seat.addScaledVector(outward, avatarHeight * 0.1);
        }
      }
      actorLayer = new ScenePixelActors(avatarHeight);
      world.add(actorLayer.root);
      renderer.shadowMap.needsUpdate = true;
      ready = true;
      warmUp();
      // 先把镜头摆到开场机位再发布人物位置，免得第一帧按原点的相机把人摆歪
      walk.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
      lastAspect = walk.aspect;
      if (modeRef.current === 'inside' && followRef.current) driveCamera(performance.now());
      resize();
      callbacks.current.onLoaded();
    }).catch(() => {
      if (!disposed) callbacks.current.onLoaded('3D 模型加载失败，已切换回场景原图');
    });

    const tick = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      if (document.hidden) { lastTick = now; return; }
      if (ready && modeRef.current === 'inside' && followRef.current) driveCamera(now);
      lastTick = now;
      if (modeRef.current === 'overview') controls.update();
      if (ready && modeRef.current === 'inside') publishPositions(now);
      else flushView(now);
      if (ready) actorLayer?.update(actorsRef.current, seats, activeCamera(), now, reduceMotion);
      renderer.render(world, activeCamera());
      if (ready && warm.length) shotFor(warm.shift()!);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
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
      renderer.dispose();
      renderer.forceContextLoss();
      host.removeChild(renderer.domElement);
    };
  }, [scene]);

  // 切视角时把当前模式告诉外面，提示文案跟着改
  useEffect(() => {
    modeRef.current = mode;
    if (ceilingRef.current) ceilingRef.current.visible = mode === 'inside';
    for (const part of ceilingPartsRef.current) part.visible = mode === 'inside';
    if (controlsRef.current) controlsRef.current.enabled = mode === 'overview';
    refreshViewRef.current?.();
    callbacks.current.onModeChange?.(mode);
  }, [mode]);

  useEffect(() => {
    followRef.current = follow;
    callbacks.current.onFollowChange?.(follow);
  }, [follow]);

  return (
    <div className="stage-3d-canvas" ref={hostRef}>
      <div className="stage-cam-bar">
        {mode === 'inside' && <button
          className={'stage-cam-toggle follow' + (follow ? ' on' : '')}
          aria-pressed={follow}
          onClick={(event) => { event.stopPropagation(); setFollowRef.current?.(!follow); }}
          title={follow ? '镜头正跟着说话的人走；点一下停在当前画面，自己拖动看' : '把镜头交还：重新跟着说话的人走'}
        >{follow ? <><i className="rec">●</i> 跟拍</> : '○ 跟拍'}</button>}
        <button
          className="stage-cam-toggle"
          onClick={(event) => { event.stopPropagation(); setMode(mode === 'inside' ? 'overview' : 'inside'); }}
          title={mode === 'inside' ? '切到俯视，一眼看清整间房' : '站进屋里，镜头跟着说话的人走'}
        >{mode === 'inside' ? '⊞ 俯视' : '◉ 进屋'}</button>
      </div>
    </div>
  );
}
