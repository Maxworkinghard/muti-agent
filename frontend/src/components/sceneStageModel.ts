import { Box3, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SceneDef } from '../types';
import { Occupancy } from './stageOccupancy';
import { CEILING_COLOR } from './sceneStageConstants';
import type { StageRoomMetrics } from './sceneStageConstants';
import { boostSaturation } from './sceneStageMaterial';

/** 加载 GLB 场景模型；失败时由调用方回退到场景原图 */
export function loadStageModel(url: string): Promise<Group> {
  return new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene);
}

export interface PreparedStageModel {
  roomMetrics: StageRoomMetrics | null;
  /** 模型自带的天花板网格：只在「进屋」时显示，俯瞰时要让开视线 */
  ceilingParts: Mesh[];
  /** 房间的占位网格：向下打线量桌面/地面高度，找机位时判断视线有没有被挡 */
  seatSurfaces: Mesh[];
  /** 标记了 stageWall 的墙：从外部俯视时切掉靠镜头的那面 */
  walls: { mesh: Mesh; side: string }[];
}

/**
 * 模型进场前的整理：读出房间标定，把天花板/墙的标记传播到多材质拆出来的子网格，
 * 再逐个网格归类（天花板、占位面、墙）、设置阴影、贴图各向异性和饱和度微调。
 */
export function prepareStageModel(model: Group, opts: { overview: boolean; anisotropy: number; sat: number }): PreparedStageModel {
  let roomMetrics: StageRoomMetrics | null = null;
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
  const ceilingParts: Mesh[] = [];
  const seatSurfaces: Mesh[] = [];
  const walls: { mesh: Mesh; side: string }[] = [];
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (object.userData.stageCeiling || object.name.startsWith('SM_Ceiling_')) {
      ceilingParts.push(object);
      object.visible = !opts.overview;
    } else {
      seatSurfaces.push(object);
    }
    if (object.userData.stageWall) walls.push({ mesh: object, side: object.userData.stageWall });
    object.castShadow = !object.userData.stageCeiling;
    object.receiveShadow = !object.userData.stageCeiling;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) value.anisotropy = opts.anisotropy;
      }
      if (material instanceof MeshStandardMaterial && opts.sat !== 1) boostSaturation(material, opts.sat);
    }
  });
  return { roomMetrics, ceilingParts, seatSurfaces, walls };
}

/**
 * 这套模型只有四面墙、顶上敞着，从屋里抬头会直接看到背景色。
 * 照墙面的配色补一层顶，把房间封上。顶要铺得比房间大一圈——墙顶是斜的，
 * 只盖房间本身的话，墙矮的那几段上方会漏出一条黑缝。
 * 精模自带水平天花板、木梁和灯具；其他房间沿用暖色补顶。
 */
export function createStageCeiling(bounds: Box3, visible: boolean): Mesh {
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const ceiling = new Mesh(
    new PlaneGeometry(size.x * 3, size.z * 3),
    new MeshBasicMaterial({ color: CEILING_COLOR, side: DoubleSide }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(center.x, bounds.max.y, center.z);
  ceiling.visible = visible;
  return ceiling;
}

/**
 * 从座位百分比坐标打出世界坐标：向下打一条线找到桌面/讲台面当锚点。
 * 原锚点量在桌面上。人略向桌内侧退，头肩留在桌沿上方。
 */
export function computeStageSeats(scene: SceneDef, bounds: Box3, roomMetrics: StageRoomMetrics | null, ray: Raycaster, seatSurfaces: Mesh[], floorY: number, avatarHeight: number): Vector3[] {
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const seats: Vector3[] = [];
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
  return seats;
}

/**
 * 人物画在场景里，头不能嵌进桌上的东西（精模的话筒就立在两头的座位上，脸会被话筒头整个盖住）：
 * 头那一格有东西就往远离房间中心（椅子那一侧）挪，一次 0.1 个半身高，最多挪 6 次
 */
export function clearSeatHeads(seats: Vector3[], bounds: Box3, occupancy: Occupancy, avatarHeight: number) {
  const center = bounds.getCenter(new Vector3());
  for (const seat of seats) {
    const outward = new Vector3(seat.x - center.x, 0, seat.z - center.z).normalize();
    for (let k = 0; k < 6 && occupancy.occupied(seat.clone().setY(seat.y + avatarHeight * 0.6)); k++) {
      seat.addScaledVector(outward, avatarHeight * 0.1);
    }
  }
}
