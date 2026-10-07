import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three';

/**
 * 统一的3D控制系统 - 适用于所有舞台
 * 支持第一人称行走、自由飞行、观察者模式
 */

export type ControlMode = 'walk' | 'fly' | 'spectate';

const KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'Space', 'ControlLeft', 'ControlRight',
  'KeyQ', 'KeyE',
  'ShiftLeft', 'ShiftRight',
]);

/** 检查是否在输入框中 */
const isEditing = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');

export interface ControlSpace {
  bounds: Box3;
  floorY: number;
  ceilingY: number;
  /** 检查某个点是否被占用（墙、家具等） */
  isBlocked: (point: Vector3) => boolean;
}

export interface ControlConfig {
  walkSpeed: number;
  flySpeed: number;
  sprintMultiplier: number;
  mouseSensitivity: number;
  collisionRadius: number;
}

const DEFAULT_CONFIG: ControlConfig = {
  walkSpeed: 2.5,
  flySpeed: 4.0,
  sprintMultiplier: 2.5,
  mouseSensitivity: 0.003,
  collisionRadius: 0.3,
};

export class UniversalControls {
  active = false;
  locked = false;
  mode: ControlMode = 'fly';

  private entered = false;
  private pos = new Vector3();
  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  private dragAt: [number, number] | null = null;
  private captureFailed = false;
  private speed: number;
  private baseSpeed: number;
  private config: ControlConfig;

  private forward = new Vector3();
  private right = new Vector3();
  private movement = new Vector3();
  private probe = new Vector3();

  onExit: (() => void) | null = null;
  onModeChange: ((mode: ControlMode) => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private space: ControlSpace,
    config?: Partial<ControlConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.speed = this.config.flySpeed;
    this.baseSpeed = this.config.flySpeed;

    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);

    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
  }

  /** 进入控制模式 */
  enter(camera: PerspectiveCamera, mode: ControlMode = 'fly') {
    this.mode = mode;
    this.pos.copy(camera.position);

    // 检查初始位置是否合法
    const { bounds, floorY, ceilingY } = this.space;
    const inset = this.config.collisionRadius * 2;
    const insideBox =
      this.pos.x > bounds.min.x + inset &&
      this.pos.x < bounds.max.x - inset &&
      this.pos.z > bounds.min.z + inset &&
      this.pos.z < bounds.max.z - inset &&
      this.pos.y > floorY + this.config.collisionRadius &&
      this.pos.y < ceilingY - this.config.collisionRadius;

    if (!insideBox || this.isBlockedAt(this.pos)) {
      // 使用安全的默认位置
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      this.pos.set(center.x, floorY + size.y * 0.4, center.z + size.z * 0.4);
    }

    camera.getWorldDirection(this.forward);
    this.yaw = Math.atan2(this.forward.x, this.forward.z);
    this.pitch = Math.asin(MathUtils.clamp(this.forward.y, -1, 1));

    // 根据模式设置速度
    const size = this.space.bounds.getSize(new Vector3());
    const scale = Math.max(size.x, size.y, size.z);
    this.baseSpeed = mode === 'walk' ? this.config.walkSpeed : this.config.flySpeed;
    this.baseSpeed *= scale * 0.15;
    this.speed = this.baseSpeed;

    this.entered = true;
    this.keys.clear();
    this.activate();
    this.capture();

    this.onModeChange?.(mode);
  }

  /** 退出控制模式 */
  exit() {
    if (!this.entered) return;
    this.entered = false;
    this.deactivate();
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  /** 切换控制模式 */
  setMode(mode: ControlMode) {
    if (this.mode === mode) return;
    this.mode = mode;

    // 行走模式：确保在地面上
    if (mode === 'walk') {
      this.pos.y = this.space.floorY + 1.6; // 眼睛高度
      this.baseSpeed = this.config.walkSpeed;
    } else {
      this.baseSpeed = this.config.flySpeed;
    }

    const size = this.space.bounds.getSize(new Vector3());
    const scale = Math.max(size.x, size.y, size.z);
    this.baseSpeed *= scale * 0.15;
    this.speed = this.baseSpeed;

    this.onModeChange?.(mode);
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
      pending?.catch(this.onLockError);
    } catch {
      this.onLockError();
    }
  }

  private onLockChange = () => {
    const previous = this.locked;
    this.locked = document.pointerLockElement === this.canvas;

    if (this.locked) {
      this.dragAt = null;
      if (this.entered) this.activate();
    } else if (previous) {
      // Esc键释放指针锁定
      const wasActive = this.entered && this.active;
      this.deactivate();
      if (wasActive) {
        this.exit();
        this.onExit?.();
      }
    }
  };

  private onLockError = () => {
    this.captureFailed = true;
    this.locked = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.entered || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    this.activate();
    this.dragAt = [e.clientX, e.clientY];
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 0) this.capture();
  };

  private onPointerUp = () => {
    this.dragAt = null;
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.entered) e.preventDefault();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.entered || !this.active) return;
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

    this.yaw -= dx * this.config.mouseSensitivity;
    this.pitch = MathUtils.clamp(
      this.pitch - dy * this.config.mouseSensitivity,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02
    );
  };

  private onPointerMove = this.onMouseMove;

  private onWheel = (e: WheelEvent) => {
    if (!this.entered || !this.active) return;
    e.preventDefault();
    this.speed = MathUtils.clamp(
      this.speed * Math.exp(-e.deltaY * 0.0015),
      this.baseSpeed * 0.1,
      this.baseSpeed * 5
    );
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.entered || !this.active) return;
    if (isEditing(e.target) || e.metaKey || e.altKey) {
      this.deactivate();
      return;
    }

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

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.deactivate();
  };

  /** 检查位置是否被阻挡 */
  private isBlockedAt(p: Vector3): boolean {
    if (this.space.isBlocked(p)) return true;

    // 检查碰撞体积周围
    const r = this.config.collisionRadius;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (this.space.isBlocked(this.probe.set(p.x + dx * r, p.y, p.z + dz * r))) {
        return true;
      }
    }

    return false;
  }

  /** 更新控制器状态并应用到相机 */
  update(dt: number, camera: PerspectiveCamera) {
    if (!this.entered) return;

    // 更新朝向
    this.forward.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    if (this.active) {
      const key = (code: string) => Number(this.keys.has(code));

      this.movement.set(0, 0, 0);

      // 前后左右移动
      this.movement.addScaledVector(this.forward, key('KeyW') - key('KeyS'));
      this.movement.addScaledVector(this.right, key('KeyD') - key('KeyA'));

      // 垂直移动
      if (this.mode === 'fly' || this.mode === 'spectate') {
        // 飞行模式：自由升降
        this.movement.y += key('Space') + key('KeyE') - Math.max(
          key('ControlLeft'),
          key('ControlRight'),
          key('KeyQ')
        );
      } else if (this.mode === 'walk') {
        // 行走模式：保持在地面上
        this.pos.y = this.space.floorY + 1.6; // 眼睛高度
        this.movement.y = 0;
      }

      if (this.movement.lengthSq() > 0) {
        const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
        const moveSpeed = this.speed * (sprint ? this.config.sprintMultiplier : 1);

        this.movement.normalize().multiplyScalar(moveSpeed * Math.min(0.05, Math.max(0, dt)));

        // 分步移动以防止穿墙
        const cellSize = this.config.collisionRadius * 2;
        const steps = Math.max(1, Math.ceil(this.movement.length() / cellSize));
        const slice = this.movement.divideScalar(steps);

        for (let i = 0; i < steps; i++) {
          const next = this.probe.copy(this.pos).add(slice);

          if (!this.isBlockedAt(next)) {
            this.pos.copy(next);
            continue;
          }

          // 碰到障碍物：尝试沿着空闲轴滑动
          for (const axis of ['x', 'z', 'y'] as const) {
            next.copy(this.pos);
            next[axis] += slice[axis];
            if (!this.isBlockedAt(next)) {
              this.pos.copy(next);
              break;
            }
          }
        }

        this.clampPosition();
      }
    }

    // 应用到相机
    camera.position.copy(this.pos);
    camera.lookAt(this.movement.copy(this.pos).add(this.forward));
  }

  private clampPosition() {
    const { bounds, floorY, ceilingY } = this.space;
    const inset = this.config.collisionRadius * 2;

    this.pos.set(
      MathUtils.clamp(this.pos.x, bounds.min.x + inset, bounds.max.x - inset),
      MathUtils.clamp(this.pos.y, floorY + this.config.collisionRadius, ceilingY - this.config.collisionRadius),
      MathUtils.clamp(this.pos.z, bounds.min.z + inset, bounds.max.z - inset)
    );
  }

  dispose() {
    this.onExit = null;
    this.onModeChange = null;
    this.exit();

    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);

    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);

    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
  }
}
