import * as THREE from 'three';
import type {Room} from './rooms/types';
import type {Player} from './player';
export type View='overview'|'judge'|string;
const OVERVIEW_FOV=48,UP=new THREE.Vector3(0,1,0);
/**
 * 剖面俯视的房间：镜头的俯仰角对准整间屋的上下中点（南墙脚到北墙顶），画面上下留白一样多。
 * 普通房间和正面机位的房间（frontal）照用房间给的看点。
 */
function aim(room:Room):[number,number,number] {
  if(!room.cutaway||room.frontal)return room.cameraTarget;
  const eye=new THREE.Vector3(...room.camera),dir=new THREE.Vector3(...room.cameraTarget).sub(eye),yaw=Math.atan2(dir.x,dir.z);let lo=Infinity,hi=-Infinity;
  for(const p of room.fit){const v=new THREE.Vector3(...p).sub(eye),ahead=v.x*Math.sin(yaw)+v.z*Math.cos(yaw);if(ahead<=.1)continue;const pitch=Math.atan2(v.y,ahead);lo=Math.min(lo,pitch);hi=Math.max(hi,pitch);}
  if(!Number.isFinite(lo))return room.cameraTarget;
  const mid=(lo+hi)/2,len=dir.length();return eye.add(new THREE.Vector3(Math.sin(yaw)*Math.cos(mid),Math.sin(mid),Math.cos(yaw)*Math.cos(mid)).multiplyScalar(len)).toArray() as [number,number,number];
}
export class StageCamera {
  view:View='overview';
  /** 开发时拍近景用：设了就用这个机位（位置、看向、竖直视角），不跟视角走。 */
  override:{pos:[number,number,number];target:[number,number,number];fov?:number}|null=null;private yaw=0;private pitch=0;private distance=0;private lastDrag=0;private dragged=false;private pointer:[number,number]|null=null;
  camera=new THREE.PerspectiveCamera(OVERVIEW_FOV,1,.03,300);private fitter=new THREE.PerspectiveCamera();private point=new THREE.Vector3();
  private aimed:[number,number,number];
  constructor(private room:Room,private canvas:HTMLCanvasElement){this.aimed=aim(room);this.camera.position.set(...room.camera);this.camera.lookAt(...this.aimed);canvas.addEventListener('pointerdown',this.down);canvas.addEventListener('pointermove',this.move);canvas.addEventListener('pointerup',this.up);canvas.addEventListener('pointercancel',this.up);canvas.addEventListener('wheel',this.wheel,{passive:false});window.addEventListener('blur',this.up);window.addEventListener('pointerup',this.up);}
  private down=(e:PointerEvent)=>{if(e.button!==0||this.view==='free'||this.view==='walk')return;this.pointer=[e.clientX,e.clientY];this.dragged=false;this.canvas.setPointerCapture(e.pointerId);};
  private move=(e:PointerEvent)=>{if(!this.pointer)return;if(!(e.buttons&1)){this.up();return;}const dx=e.clientX-this.pointer[0],dy=e.clientY-this.pointer[1];if(Math.abs(dx)+Math.abs(dy)>2)this.dragged=true;this.yaw-=dx*.003;this.pitch=Math.max(-.7,Math.min(.7,this.pitch-dy*.003));this.pointer=[e.clientX,e.clientY];this.lastDrag=performance.now();};
  private up=()=>{this.pointer=null;this.lastDrag=performance.now();};
  private wheel=(e:WheelEvent)=>{if(this.view==='free'||this.view==='walk')return;e.preventDefault();if(this.view==='overview')this.distance=Math.max(-2,Math.min(2,this.distance+e.deltaY*.002));};
  didDrag(){return this.dragged;}
  select(view:View){this.view=view;this.reset();if(view==='overview'){this.camera.position.set(...this.room.camera);this.camera.lookAt(...this.aimed);}this.camera.fov=view==='overview'?this.overviewFov():Math.max(60,this.overviewFov());this.camera.updateProjectionMatrix();}
  /** 机位始终在门内；根据室内家具投影取景，不向屋外后退。 */
  private overviewFov(){
    this.fitter.position.set(...this.room.camera);this.fitter.up.copy(UP);this.fitter.lookAt(...this.aimed);this.fitter.updateMatrixWorld(true);
    const inverse=this.fitter.matrixWorld.clone().invert();let need=0,needY=0;
    for(const p of this.room.fit){this.point.set(...p).applyMatrix4(inverse);if(this.point.z<-.1){need=Math.max(need,Math.abs(this.point.x/-this.point.z));needY=Math.max(needY,Math.abs(this.point.y/-this.point.z));}}
    const base=this.room.fov??OVERVIEW_FOV;
    // 剖面俯视的房间上下也要装下（整间屋都在画面里），留一点边。
    let half=Math.max(Math.tan(THREE.MathUtils.degToRad(base/2)),need/.97/Math.max(.2,this.camera.aspect),this.room.cutaway?needY/.94:0);
    // 窄窗口的视角按钮排成两行，给板子上沿留出 100 像素，避免按钮压住内容。
    if(this.canvas.clientWidth<=1100){const sc=this.room.layout.board;this.point.set(sc.position[0],sc.position[1]+sc.height/2+.14,sc.position[2]).applyMatrix4(inverse);const limit=Math.max(.3,1-200/Math.max(300,this.canvas.clientHeight));if(this.point.z<-.1)half=Math.max(half,this.point.y/-this.point.z/limit);}
    const fit=THREE.MathUtils.radToDeg(2*Math.atan(half));
    return Math.min(88,Math.max(base,fit));
  }
  reset(){this.yaw=this.pitch=this.distance=0;this.lastDrag=0;}
  update(players:Map<string,Player>,dt:number){
    // 自由视角由 SpectatorCamera 摆放，这里不插手。
    if(this.view==='free'||this.view==='walk')return;
    const player=players.get(this.view),pos=new THREE.Vector3(),target=new THREE.Vector3();
    if(this.override){pos.set(...this.override.pos);target.set(...this.override.target);const fov=this.override.fov??this.camera.fov;if(fov!==this.camera.fov){this.camera.fov=fov;this.camera.updateProjectionMatrix();}this.camera.position.copy(pos);this.camera.lookAt(target);return;}
    if(player){pos.copy(player.eye);target.copy(pos).add(player.forward);if(!this.pointer&&performance.now()-this.lastDrag>3000){this.yaw*=Math.exp(-dt*3);this.pitch*=Math.exp(-dt*3);}}
    else if(this.view==='judge'){pos.set(...this.room.judge);target.set(...this.room.judgeTarget);}
    else {pos.set(...this.room.camera);target.set(...this.aimed);const fov=Math.max(Math.min(38,this.room.fov??38)-6,Math.min(88,this.overviewFov()+this.distance*4));if(Math.abs(fov-this.camera.fov)>.01){this.camera.fov=fov;this.camera.updateProjectionMatrix();}}
    this.camera.position.lerp(pos,Math.min(1,dt/ .15));const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos,target,new THREE.Vector3(0,1,0)));const local=new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch,this.yaw,0,'YXZ'));q.multiply(local);this.camera.quaternion.slerp(q,Math.min(1,dt/.15));
  }
  dispose(){this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);this.canvas.removeEventListener('wheel',this.wheel);window.removeEventListener('blur',this.up);window.removeEventListener('pointerup',this.up);}
}
