import { Box3, Mesh, Vector3 } from 'three';

/**
 * 房间的占位网格：把房间切成小格子，记下哪些格子里有东西（墙、桌椅、话筒……）。
 * 跟拍找机位要判断上百次「两点之间有没有被挡」。AI 生成的房间是一整块七八万个三角面的网格，
 * 用 Raycaster 每条线要十来毫秒，一个机位就要几百毫秒；在格子里走一遍不到 0.1 毫秒。
 * 格子比人物半身小得多（房间最长边的 1/100），对找机位来说精度够用，宁可略微偏严。
 */
export class Occupancy {
  private readonly cells: Uint8Array;
  private readonly dims: [number, number, number];
  private readonly origin: Vector3;
  private readonly size: number;

  /** 一个格子的边长 */
  get cellSize() { return this.size; }

  constructor(meshes: Mesh[], bounds: Box3, resolution = 100) {
    const extent = bounds.getSize(new Vector3());
    this.size = Math.max(extent.x, extent.y, extent.z) / resolution;
    this.origin = bounds.min.clone();
    this.dims = [
      Math.ceil(extent.x / this.size) + 1,
      Math.ceil(extent.y / this.size) + 1,
      Math.ceil(extent.z / this.size) + 1,
    ];
    this.cells = new Uint8Array(this.dims[0] * this.dims[1] * this.dims[2]);
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const p = new Vector3();
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const position = mesh.geometry.attributes.position;
      const index = mesh.geometry.index;
      const count = index ? index.count : position.count;
      for (let i = 0; i + 2 < count; i += 3) {
        a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
        // 在三角形上按不到一格的间距撒点，每个点所在的格子标成有东西；小三角形只取三个顶点
        const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
        const steps = Math.max(1, Math.ceil(longest / (this.size * 0.7)));
        for (let s = 0; s <= steps; s++) {
          for (let t = 0; t <= steps - s; t++) {
            const u = s / steps;
            const v = t / steps;
            p.copy(a).multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
            this.mark(p);
          }
        }
      }
    }
  }

  private cellOf(p: Vector3) {
    const x = Math.floor((p.x - this.origin.x) / this.size);
    const y = Math.floor((p.y - this.origin.y) / this.size);
    const z = Math.floor((p.z - this.origin.z) / this.size);
    if (x < 0 || y < 0 || z < 0 || x >= this.dims[0] || y >= this.dims[1] || z >= this.dims[2]) return -1;
    return (z * this.dims[1] + y) * this.dims[0] + x;
  }

  private mark(p: Vector3) {
    const cell = this.cellOf(p);
    if (cell >= 0) this.cells[cell] = 1;
  }

  /** 这一点所在的格子里有没有东西 */
  occupied(p: Vector3) {
    const cell = this.cellOf(p);
    return cell >= 0 && this.cells[cell] === 1;
  }

  /** from 到 to 这段路上有没有东西；从 from 往前走过 skip 之后才开始算（跳过人自己身边的话筒、椅背） */
  blocked(from: Vector3, to: Vector3, skip = 0) {
    const direction = to.clone().sub(from);
    const length = direction.length();
    if (length <= skip) return false;
    direction.divideScalar(length);
    const step = this.size * 0.5;
    const p = new Vector3();
    for (let t = skip; t < length; t += step) {
      const cell = this.cellOf(p.copy(from).addScaledVector(direction, t));
      if (cell >= 0 && this.cells[cell]) return true;
    }
    return false;
  }
}
