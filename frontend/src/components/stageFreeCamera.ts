import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three';

const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
/** 正在打字（聊天框等）时不抢键盘 */
const editing = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');

/**
 * GLB 房间里的自由镜头（对应我的世界舞台的「自由视角」）：WASD 飞行、空格/Ctrl 升降、
 * Shift 加速、滚轮调速；点击画面锁定鼠标转向，锁不上就拖动转向，Esc 退出。
 * 碰撞用舞台的占位网格：镜头带一圈探点，沿小步移动，撞到墙和家具就沿空闲的轴滑过去。
 * 不含任何我的世界素材，几何信息全部来自当前加载的 3D 模型。
 */
export class StageFreeCamera {
  active = false;
  locked = false;
  /** Esc 或退出指针锁定时回调（外面把模式切回进屋） */
  onExit: (() => void) | null = null;
  private entered = false;
  private pos = new Vector3();
  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private dragAt: [number, number] | null = null;
  private captureFailed = false;
  /** 每秒走多少个模型单位，进屋时按房间尺寸重设 */
  private baseSpeed = 0.3;
  private speed = 0.3;
  /** 镜头探点半径（占位格边长的倍数） */
  private radius: number;
  private forward = new Vector3();
  private right = new Vector3();
  private movement = new Vector3();
  private probe = new Vector3();
  private collisionProbe = new Vector3();
  private mode: 'walk' | 'free' = 'free';
  private eyeHeight: number;

  constructor(private canvas: HTMLCanvasElement, private space: {
    bounds: Box3;
    floorY: number;
    ceilingY: number;
    cell: number;
    eyeHeight?: number;
    /** 这一点所在格子里有没有东西 */
    occupied: (p: Vector3) => boolean;
  }) {
    this.radius = space.cell * 1.5;
    this.eyeHeight = space.eyeHeight ?? (space.ceilingY - space.floorY) * 0.6;
    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', this.context);
    window.addEventListener('mousemove', this.move);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    document.addEventListener('pointerlockchange', this.lockChange);
    document.addEventListener('pointerlockerror', this.lockError);
  }

  /** 从当前镜头的站位接手；站位悬在房间外（比如无人机全景机位）或卡在家具里就换成屋内的备用站位 */
  enter(camera: PerspectiveCamera, mode: 'walk' | 'free' = 'free') {
    this.mode = mode;
    this.pos.copy(camera.position);
    if (mode === 'walk') this.pos.y = this.space.floorY + this.eyeHeight;
    const { bounds, floorY, ceilingY } = this.space;
    const inset = this.radius * 2;
    const insideBox = this.pos.x > bounds.min.x + inset && this.pos.x < bounds.max.x - inset
      && this.pos.z > bounds.min.z + inset && this.pos.z < bounds.max.z - inset
      && this.pos.y > floorY + this.radius && this.pos.y < ceilingY - this.radius;
    if (!insideBox || this.blockedAt(this.pos)) {
      const spawn = this.findSpawn();
      if (!spawn) { this.exit(); return false; }
      this.pos.copy(spawn);
    }
    camera.getWorldDirection(this.forward);
    this.yaw = Math.atan2(this.forward.x, this.forward.z);
    this.pitch = Math.asin(MathUtils.clamp(this.forward.y, -1, 1));
    const size = this.space.bounds.getSize(new Vector3());
    this.baseSpeed = Math.max(size.x, size.y, size.z) * 0.35;
    this.speed = this.baseSpeed;
    this.entered = true;
    this.keys.clear();
    this.activate();
    this.capture();
    this.update(0, camera);
    return true;
  }

  /** 找离接手位置最近的空处；不把行走镜头直接落在桌椅里。 */
  private findSpawn() {
    const { bounds, floorY, ceilingY } = this.space;
    const y = this.mode === 'walk' ? floorY + this.eyeHeight : MathUtils.clamp(this.pos.y, floorY + this.radius * 2, ceilingY - this.radius * 2);
    const inset = this.radius * 3;
    const candidates: Vector3[] = [];
    for (let x = 0; x <= 12; x++) for (let z = 0; z <= 12; z++) {
      const p = new Vector3(MathUtils.lerp(bounds.min.x + inset, bounds.max.x - inset, x / 12), y, MathUtils.lerp(bounds.min.z + inset, bounds.max.z - inset, z / 12));
      if (!this.blockedAt(p)) candidates.push(p);
    }
    candidates.sort((a, b) => a.distanceToSquared(this.pos) - b.distanceToSquared(this.pos));
    return candidates[0] ?? null;
  }

  exit() {
    if (!this.entered) return;
    this.entered = false;
    this.deactivate();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private activate() {
    if (!this.entered) return;
    this.canvas.focus({ preventScroll: true });
    this.active = true;
  }

  private deactivate() {
    this.active = false;
    this.keys.clear();
    this.dragAt = null;
  }

  private capture() {
    if (this.captureFailed || this.locked || !this.canvas.requestPointerLock) return;
    try {
      const pending = this.canvas.requestPointerLock();
      pending?.catch(this.lockError);
    } catch {
      this.lockError();
    }
  }

  private lockChange = () => {
    const previous = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) {
      this.dragAt = null;
      if (this.entered) this.activate();
    } else if (previous) {
      // 浏览器里按 Esc 会先释放指针锁定：把它当作退出自由视角
      const wasActive = this.entered && this.active;
      this.deactivate();
      if (wasActive) {
        this.exit();
        this.onExit?.();
      }
    }
  };

  private lockError = () => {
    this.captureFailed = true;
    this.locked = false;
  };

  private down = (e: PointerEvent) => {
    if (!this.entered || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    this.activate();
    this.dragAt = [e.clientX, e.clientY];
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 0) { this.captureFailed = false; this.capture(); }
  };

  private up = () => { this.dragAt = null; };

  private context = (e: MouseEvent) => {
    if (this.entered) e.preventDefault();
  };

  private move = (e: MouseEvent) => {
    if (!this.entered || !this.active) return;
    // 锁定鼠标用相对 mousemove；普通拖动用 pointermove，避免兼容事件重复转向
    if (this.locked ? e.type !== 'mousemove' : e.type !== 'pointermove') return;
    let dx = 0;
    let dy = 0;
    if (this.locked) {
      dx = e.movementX;
      dy = e.movementY;
    } else if (this.dragAt && (e.buttons & 3)) {
      dx = e.clientX - this.dragAt[0];
      dy = e.clientY - this.dragAt[1];
      this.dragAt = [e.clientX, e.clientY];
    } else {
      this.dragAt = null;
      return;
    }
    this.yaw -= dx * 0.003;
    this.pitch = MathUtils.clamp(this.pitch - dy * 0.003, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  };

  private wheel = (e: WheelEvent) => {
    if (!this.entered || !this.active) return;
    e.preventDefault();
    this.speed = MathUtils.clamp(this.speed * Math.exp(-e.deltaY * 0.0015), this.baseSpeed * 0.1, this.baseSpeed * 5);
  };

  private keyDown = (e: KeyboardEvent) => {
    if (!this.entered || !this.active) return;
    if (editing(e.target) || e.metaKey || e.altKey) { this.deactivate(); return; }
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.exit();
      this.onExit?.();
      return;
    }
    if (KEYS.has(e.code)) {
      e.preventDefault();
      e.stopPropagation();
      this.keys.add(e.code);
    }
  };

  private keyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  private blur = () => { this.deactivate(); };

  /** 镜头中心（带探点半径）能不能停在这一点 */
  private blockedAt(p: Vector3) {
    const heights = this.mode === 'walk' ? [p.y, p.y - this.eyeHeight * 0.5, p.y - this.eyeHeight + this.radius] : [p.y];
    for (const y of heights) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (this.space.occupied(this.collisionProbe.set(p.x + dx * this.radius, y, p.z + dz * this.radius))) return true;
    }
    return false;
  }

  /** 分小步走，撞到墙或家具就沿空闲的轴滑过去；加速也穿不过薄墙 */
  update(dt: number, camera: PerspectiveCamera) {
    if (!this.entered) return;
    this.forward.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    if (this.active) {
      const key = (code: string) => Number(this.keys.has(code));
      this.movement.set(0, 0, 0);
      this.movement.addScaledVector(this.forward, key('KeyW') - key('KeyS'));
      this.movement.addScaledVector(this.right, key('KeyD') - key('KeyA'));
      if (this.mode === 'walk') this.movement.y = 0;
      else this.movement.y += key('Space') + key('KeyE') - Math.max(key('ControlLeft'), key('ControlRight'), key('KeyQ'));
      if (this.movement.lengthSq() > 0) {
        this.movement.normalize().multiplyScalar(this.speed * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3 : 1) * Math.min(0.05, Math.max(0, dt)));
        const step = this.space.cell * 0.5;
        const n = Math.max(1, Math.ceil(this.movement.length() / step));
        const slice = this.movement.divideScalar(n);
        for (let i = 0; i < n; i++) {
          const next = this.probe.copy(this.pos).add(slice);
          if (!this.blockedAt(next)) { this.pos.copy(next); continue; }
          for (const axis of ['x', 'z', 'y'] as const) {
            if (Math.abs(slice[axis]) < 1e-10) continue;
            next.copy(this.pos);
            next[axis] += slice[axis];
            if (!this.blockedAt(next)) this.pos.copy(next);
          }
        }
        this.clamp();
      }
    }
    if (this.mode === 'walk') this.pos.y = this.space.floorY + this.eyeHeight;
    camera.position.copy(this.pos);
    camera.lookAt(this.movement.copy(this.pos).add(this.forward));
  }

  private clamp() {
    const { bounds, floorY, ceilingY } = this.space;
    const inset = this.radius * 2;
    this.pos.set(
      MathUtils.clamp(this.pos.x, bounds.min.x + inset, bounds.max.x - inset),
      MathUtils.clamp(this.pos.y, floorY + this.radius, ceilingY - this.radius),
      MathUtils.clamp(this.pos.z, bounds.min.z + inset, bounds.max.z - inset),
    );
  }

  dispose() {
    this.onExit = null;
    this.exit();
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('wheel', this.wheel);
    this.canvas.removeEventListener('contextmenu', this.context);
    window.removeEventListener('mousemove', this.move);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('pointerlockchange', this.lockChange);
    document.removeEventListener('pointerlockerror', this.lockError);
  }
}
