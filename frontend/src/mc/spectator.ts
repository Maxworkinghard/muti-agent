import * as THREE from 'three';
import type {Room} from './rooms/debate';
import type {RoomPhysics} from './rooms/physics';

const KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight','KeyQ','KeyE']);
const editing=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
/** 室内观战镜头：无重力，可升降；用房间和家具的实际几何限制移动。 */
export class SpectatorCamera {
  entered=false;active=false;locked=false;speed=4.3;
  onExit:(()=>void)|null=null;
  onStatus:((active:boolean,locked:boolean)=>void)|null=null;
  private pos=new THREE.Vector3();
  private yaw=Math.PI;private pitch=-.12;
  private keys=new Set<string>();
  private dragAt:[number,number]|null=null;
  private captureFailed=false;
  private forward=new THREE.Vector3();private right=new THREE.Vector3();private movement=new THREE.Vector3();
  constructor(private room:Room,private canvas:HTMLCanvasElement,private physics?:Pick<RoomPhysics,'cameraBlocked'|'moveCamera'>){
    canvas.tabIndex=0;
    canvas.addEventListener('pointerdown',this.down);
    canvas.addEventListener('wheel',this.wheel,{passive:false});
    canvas.addEventListener('contextmenu',this.context);
    window.addEventListener('mousemove',this.move);
    window.addEventListener('pointermove',this.move);
    window.addEventListener('pointerup',this.up);
    window.addEventListener('pointercancel',this.up);
    window.addEventListener('keydown',this.keyDown);
    window.addEventListener('keyup',this.keyUp);
    window.addEventListener('blur',this.blur);
    document.addEventListener('focusin',this.focus);
    document.addEventListener('pointerlockchange',this.lockChange);
    document.addEventListener('pointerlockerror',this.lockError);
  }
  get position(){return this.pos.clone();}
  private report(){this.onStatus?.(this.active,this.locked);}
  private activate(){
    if(!this.entered)return;
    this.canvas.focus({preventScroll:true});this.active=true;this.report();
  }
  deactivate(){const wasActive=this.active;this.active=false;this.keys.clear();this.dragAt=null;if(wasActive)this.report();}
  private capture(){
    if(this.captureFailed||this.locked||!this.canvas.requestPointerLock)return;
    try{const pending=this.canvas.requestPointerLock();pending?.catch(this.lockError);}catch{this.lockError();}
  }
  enter(camera:THREE.PerspectiveCamera,captureMouse=true){
    if(!this.entered){
      const {min,max}=this.room.flight??this.room.bounds,p=camera.position;
      if(p.x>min[0]+.18&&p.x<max[0]-.18&&p.z>min[2]+.18&&p.z<max[2]-.18&&p.y>min[1]+.18&&p.y<max[1]-.18&&!this.physics?.cameraBlocked(p)){
        this.pos.copy(camera.position);camera.getWorldDirection(this.forward);
      }else{
        this.pos.set(...this.room.camera);this.forward.set(...this.room.cameraTarget).sub(this.pos).normalize();
      }
      this.yaw=Math.atan2(this.forward.x,this.forward.z);
      this.pitch=Math.asin(THREE.MathUtils.clamp(this.forward.y,-1,1));
      this.entered=true;this.keys.clear();
    }
    this.activate();if(captureMouse)this.capture();
  }
  exit(){
    if(!this.entered)return;
    this.entered=false;this.deactivate();
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();
  }
  private focus=()=>{if(this.entered&&document.activeElement!==this.canvas)this.deactivate();};
  private blur=()=>{this.deactivate();if(document.pointerLockElement===this.canvas)document.exitPointerLock();};
  private lockChange=()=>{
    const previous=this.locked;this.locked=document.pointerLockElement===this.canvas;
    if(this.locked){this.dragAt=null;if(this.entered)this.activate();}
    else if(previous){const exit=this.entered&&this.active;this.deactivate();if(exit){this.exit();this.onExit?.();}}
    this.report();
  };
  private lockError=()=>{this.captureFailed=true;this.locked=false;this.report();};
  private down=(e:PointerEvent)=>{
    if(!this.entered||(e.button!==0&&e.button!==2))return;
    e.preventDefault();this.activate();this.dragAt=[e.clientX,e.clientY];this.canvas.setPointerCapture(e.pointerId);
    if(e.button===0)this.capture();
  };
  private up=()=>{this.dragAt=null;};
  private context=(e:MouseEvent)=>{if(this.entered)e.preventDefault();};
  private move=(e:MouseEvent)=>{
    if(!this.entered||!this.active)return;
    // 锁定鼠标使用相对 mousemove；普通拖动使用 pointermove，避免兼容事件重复转向。
    if(this.locked?e.type!=='mousemove':e.type!=='pointermove')return;
    let dx=0,dy=0;
    if(this.locked){dx=e.movementX;dy=e.movementY;}
    else if(this.dragAt&&(e.buttons&3)){dx=e.clientX-this.dragAt[0];dy=e.clientY-this.dragAt[1];this.dragAt=[e.clientX,e.clientY];}
    else {this.dragAt=null;return;}
    this.yaw-=dx*.003;this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.003,-Math.PI/2+.02,Math.PI/2-.02);
  };
  private wheel=(e:WheelEvent)=>{
    if(!this.entered||!this.active)return;
    e.preventDefault();this.speed=THREE.MathUtils.clamp(this.speed*Math.exp(-e.deltaY*.0015),.5,16);
  };
  private keyDown=(e:KeyboardEvent)=>{
    if(!this.entered||!this.active)return;
    if(editing(e.target)||e.metaKey||e.altKey){this.deactivate();return;}
    if(e.code==='Escape'){e.preventDefault();e.stopPropagation();this.exit();this.onExit?.();return;}
    if(KEYS.has(e.code)){e.preventDefault();e.stopPropagation();this.keys.add(e.code);}
  };
  private keyUp=(e:KeyboardEvent)=>{this.keys.delete(e.code);};
  update(dt:number,camera:THREE.PerspectiveCamera){
    if(!this.entered)return;
    this.forward.set(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch));
    this.right.set(-Math.cos(this.yaw),0,Math.sin(this.yaw));
    if(this.active){
      const key=(code:string)=>Number(this.keys.has(code));
      this.movement.copy(this.forward).multiplyScalar(key('KeyW')-key('KeyS')).addScaledVector(this.right,key('KeyD')-key('KeyA'));
      this.movement.y+=key('Space')+key('KeyE')-Math.max(key('ControlLeft'),key('ControlRight'),key('KeyQ'));
      if(this.movement.lengthSq()>0){
        this.movement.normalize().multiplyScalar(this.speed*(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?3:1)*Math.min(.05,Math.max(0,dt)));
        if(this.physics)this.physics.moveCamera(this.pos,this.movement);else this.pos.add(this.movement);
        const {min,max}=this.room.flight??this.room.bounds;
        this.pos.set(THREE.MathUtils.clamp(this.pos.x,min[0]+.18,max[0]-.18),THREE.MathUtils.clamp(this.pos.y,min[1]+.18,max[1]-.18),THREE.MathUtils.clamp(this.pos.z,min[2]+.18,max[2]-.18));
      }
    }
    camera.position.copy(this.pos);camera.up.set(0,1,0);camera.lookAt(this.movement.copy(this.pos).add(this.forward));
  }
  dispose(){
    this.onStatus=null;this.onExit=null;this.exit();
    this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('wheel',this.wheel);this.canvas.removeEventListener('contextmenu',this.context);
    window.removeEventListener('mousemove',this.move);window.removeEventListener('pointermove',this.move);window.removeEventListener('pointerup',this.up);window.removeEventListener('pointercancel',this.up);
    window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.blur);
    document.removeEventListener('focusin',this.focus);document.removeEventListener('pointerlockchange',this.lockChange);document.removeEventListener('pointerlockerror',this.lockError);
  }
}
