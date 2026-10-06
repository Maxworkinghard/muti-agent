import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {Room} from './rooms/debate';
import {cuboid} from './player';
import type {Assets} from './assets';
import {RoomPhysics,type BodyObstacle} from './rooms/physics';
/**
 * 自由视角（第 12.13 节）：评委席上的“你”站起来，WASD 在辩论室里走动，镜头像游戏 F5 的第三人称跟在身后。
 * 走路有重力和起伏，0.6 米以内的台阶直接迈上去，被挡住沿墙滑开，出不了辩论室；F5 切三种人称，Esc 退出走回座位。
 */
const WALK=4.3,RUN=5.6,SNEAK=1.3,JUMP=7.6,GRAVITY=22,UP=new THREE.Vector3(0,1,0);
export class FreeView {
  root=new THREE.Group();head=new THREE.Vector3();active=false;mode=0;distance=3.2;
  private pos=new THREE.Vector3(8,1,11.6);
  private vy=0;
  private yaw=Math.PI;
  private camYaw=Math.PI;
  private camPitch=-.1;
  private keys=new Set<string>();
  private home=new THREE.Vector3(8,1,11.5);
  private returning=0;
  private grounded=true;
  private walkT=0;
  private dragging=false;
  private dragAt:[number,number]|null=null;
  private physics:RoomPhysics;
  private trail:THREE.Vector3[]=[];
  private returnIndex=-1;
  private seated=true;
  private ownChair:string|undefined;
  private parts:{armL:THREE.Group;armR:THREE.Group;legL:THREE.Group;legR:THREE.Group;body:THREE.Group};
  private owned:Array<THREE.Material|THREE.Texture>=[];
  private combined:THREE.Mesh;
  private sources:Array<{mesh:THREE.Mesh;offset:number}>=[];
  private local=new THREE.Matrix4();private inverseRoot=new THREE.Matrix4();private normal=new THREE.Matrix3();private vertex=new THREE.Vector3();
  constructor(room:Room,private canvas:HTMLCanvasElement,home:[number,number,number],assets:Assets,private people:()=>BodyObstacle[]){
    this.home.set(...home);
    this.pos.copy(this.home);this.physics=new RoomPhysics(room,assets);
    this.ownChair=room.layout.chairs.find(c=>c.side==='judge')?.id;
    const skin=assets.textures.get('entity/player/wide/steve.png')!;
    const mat=new THREE.MeshStandardMaterial({map:skin,alphaTest:.1,roughness:.88});this.owned.push(mat);
    const part=(geo:THREE.BufferGeometry,pivot:[number,number,number],offset:[number,number,number])=>{const g=new THREE.Group();g.position.set(...pivot.map(n=>n/16) as [number,number,number]);const mm=new THREE.Mesh(geo,mat);mm.castShadow=true;mm.receiveShadow=true;mm.position.set(...offset.map(n=>n/16) as [number,number,number]);g.add(mm);this.root.add(g);return g;};
    this.parts={body:part(cuboid(8,12,4,16,16,[0,18,0]),[0,0,0],[0,0,0]),
      armR:part(cuboid(4,12,4,40,16,[-1,-4,0]),[-5,22,0],[0,0,0]),armL:part(cuboid(4,12,4,32,48,[1,-4,0]),[5,22,0],[0,0,0]),
      legL:part(cuboid(4,12,4,16,48,[0,-6,0]),[1.9,12,0],[0,0,0]),legR:part(cuboid(4,12,4,0,16,[0,-6,0]),[-1.9,12,0],[0,0,0])};
    const headG=new THREE.Group();headG.position.set(0,24/16,0);const head=new THREE.Mesh(cuboid(8,8,8,0,0,[0,4,0]),mat);head.castShadow=true;headG.add(head);this.root.add(headG);
    let offset=0;this.root.traverse(o=>{if(o instanceof THREE.Mesh){this.sources.push({mesh:o,offset});offset+=o.geometry.getAttribute('position').count;o.visible=false;}});
    this.combined=new THREE.Mesh(mergeGeometries(this.sources.map(p=>p.mesh.geometry))!,mat);this.combined.castShadow=true;this.combined.receiveShadow=true;this.root.add(this.combined);
    this.root.scale.setScalar(.9375);this.root.visible=true;this.root.name='free-view-you';this.update(0);
    canvas.tabIndex=0;
    canvas.addEventListener('pointerdown',this.down);window.addEventListener('pointermove',this.move);window.addEventListener('pointerup',this.up);
    canvas.addEventListener('wheel',this.wheel,{passive:false});
    window.addEventListener('keydown',this.keyDown);window.addEventListener('keyup',this.keyUp);
    window.addEventListener('blur',this.blur);
  }
  private down=(e:PointerEvent)=>{if(!this.inFree||e.button!==0)return;this.canvas.focus({preventScroll:true});this.setActive(true);if(!this.active)return;this.dragging=true;this.dragAt=[e.clientX,e.clientY];};
  private blur=()=>this.setActive(false);
  private move=(e:PointerEvent)=>{if(!this.active||!this.dragging||!this.dragAt)return;if(!(e.buttons&1)){this.up();return;}const dx=e.clientX-this.dragAt[0],dy=e.clientY-this.dragAt[1];this.camYaw-=dx*.0035;this.camPitch=Math.max(-1.2,Math.min(1.2,this.camPitch-dy*.0035));this.dragAt=[e.clientX,e.clientY];};
  private up=()=>{this.dragging=false;};
  private wheel=(e:WheelEvent)=>{if(!this.active)return;e.preventDefault();this.distance=Math.max(2,Math.min(8,this.distance+e.deltaY*.004));};
  private keyDown=(e:KeyboardEvent)=>{
    if(!this.inFree||(!this.active&&e.code!=='Escape'))return;
    if(e.target instanceof HTMLElement&&e.target.matches('input,textarea,select,[contenteditable="true"]')){this.setActive(false);return;}
    if(e.code==='F5'){e.preventDefault();this.mode=(this.mode+1)%3;return;}
    if(e.code==='Escape'){e.preventDefault();this.onExit?.();return;}
    if(['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();this.keys.add(e.code);}
  };
  private keyUp=(e:KeyboardEvent)=>this.keys.delete(e.code);
  onExit:(()=>void)|null=null;private inFree=false;
  /** 键盘和拖动只在点过舞台画面后生效（第 12.13 节：在右侧对话框打字时不能让人物走动）。 */
  setActive(on:boolean){this.active=on&&this.inFree;if(!this.active){this.keys.clear();this.dragging=false;}}
  enter(){this.inFree=true;this.active=false;this.seated=false;this.returnIndex=-1;this.returning=0;this.mode=0;this.root.visible=true;this.pos.copy(this.home);this.trail=[this.home.clone()];this.yaw=Math.PI;this.camYaw=Math.PI;this.camPitch=-.12;this.vy=0;}
  exit(){this.inFree=false;this.setActive(false);this.root.visible=true;this.returnIndex=this.trail.length-1;this.returning=1;}
  get position(){return this.pos.clone();}
  /** 每帧：走动、物理、镜头。 Returns the world position of the head for the name tag. */
  update(dt:number):THREE.Vector3{
    if(this.returning>0){const target=this.trail[this.returnIndex];
      if(!target){this.returning=0;this.seated=true;this.pos.copy(this.home);this.yaw=Math.PI;}
      else {const delta=target.clone().sub(this.pos);delta.y=0;
        if(delta.length()<.12)this.returnIndex--;
        else {delta.clampLength(0,WALK*dt);this.physics.move(this.pos,delta.x,delta.z,this.people(),this.ownChair);this.yaw=Math.atan2(delta.x,delta.z);this.walkT+=dt*9;}}
    }
    else if(this.active){
      const run=this.keys.has('ControlLeft')||this.keys.has('ControlRight'),sneak=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight');
      const speed=sneak?SNEAK:run?RUN:WALK;
      let mx=0,mz=0;
      if(this.keys.has('KeyW'))mz+=1;if(this.keys.has('KeyS'))mz-=1;if(this.keys.has('KeyA'))mx-=1;if(this.keys.has('KeyD'))mx+=1;
      const moving=mx!==0||mz!==0;
      if(moving){
        const len=Math.hypot(mx,mz),fx=Math.sin(this.camYaw),fz=Math.cos(this.camYaw),rx=-Math.cos(this.camYaw),rz=Math.sin(this.camYaw);
        const dx=(fx*mz/len+rx*mx/len)*speed*dt,dz=(fz*mz/len+rz*mx/len)*speed*dt;
        const before=this.pos.clone();this.physics.move(this.pos,dx,dz,this.people(),this.pos.distanceTo(this.home)<.7?this.ownChair:undefined,this.grounded);
        if(this.pos.distanceTo(before)>.001){this.yaw=this.camYaw;this.walkT+=dt*(speed/WALK)*9;}
        if(this.pos.distanceTo(this.trail.at(-1)!)>.2)this.trail.push(this.pos.clone());
      }else this.walkT*=Math.max(0,1-dt*8);
      if(this.keys.has('Space')&&this.grounded){this.vy=JUMP;this.grounded=false;}
      this.vy-=GRAVITY*dt;let ny=this.pos.y+this.vy*dt;
      const ground=this.physics.groundAt(this.pos.x,this.pos.z,this.pos.y+.02,this.pos.distanceTo(this.home)<.7?this.ownChair:undefined);
      if(ny<=ground){ny=ground;this.vy=0;this.grounded=true;}else this.grounded=false;
      this.pos.y=ny;
    }
    if(this.returning>0){const ground=this.physics.groundAt(this.pos.x,this.pos.z,this.pos.y+.02,this.ownChair);this.pos.y=Math.max(ground,this.pos.y-GRAVITY*dt*dt);}
    this.root.position.copy(this.pos);this.root.rotation.y=this.yaw;
    // 走路的起伏和摆臂（游戏第三人称的手感）。
    const walking=this.active||this.returning>0,swing=walking?Math.sin(this.walkT)*.55:0,bob=walking?Math.abs(Math.sin(this.walkT))*.045:0;
    this.parts.armR.rotation.x=this.seated?-.6:swing;this.parts.armL.rotation.x=this.seated?-.6:-swing;this.parts.legR.rotation.x=this.seated?-1.4137:-swing;this.parts.legL.rotation.x=this.seated?-1.4137:swing;
    this.parts.legR.rotation.y=this.seated?-.314:0;this.parts.legL.rotation.y=this.seated?.314:0;
    if(this.seated)this.root.position.y-=.75*.9375-.56;
    this.parts.body.position.y=bob;
    // 六个身体部件共用一张皮肤，仅更新 144 个顶点，合成一次绘制并保留独立关节动作。
    this.root.updateMatrixWorld(true);this.inverseRoot.copy(this.root.matrixWorld).invert();
    const vertices=this.combined.geometry.getAttribute('position'),normals=this.combined.geometry.getAttribute('normal');
    for(const {mesh,offset} of this.sources){this.local.multiplyMatrices(this.inverseRoot,mesh.matrixWorld);this.normal.getNormalMatrix(this.local);const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');for(let i=0;i<p.count;i++){this.vertex.fromBufferAttribute(p,i).applyMatrix4(this.local);vertices.setXYZ(offset+i,this.vertex.x,this.vertex.y,this.vertex.z);this.vertex.fromBufferAttribute(n,i).applyNormalMatrix(this.normal);normals.setXYZ(offset+i,this.vertex.x,this.vertex.y,this.vertex.z);}}
    vertices.needsUpdate=normals.needsUpdate=true;this.combined.geometry.computeBoundingSphere();this.combined.geometry.computeBoundingBox();
    this.head.copy(this.pos);this.head.y+=1.62;
    return this.head;
  }
  camera(camera:THREE.PerspectiveCamera){
    const eye=new THREE.Vector3(this.pos.x,this.pos.y+1.62,this.pos.z);
    const dir=new THREE.Vector3(Math.sin(this.camYaw)*Math.cos(this.camPitch),Math.sin(this.camPitch),Math.cos(this.camYaw)*Math.cos(this.camPitch));
    if(this.mode===2){camera.position.copy(eye);camera.rotation.set(0,0,0);camera.lookAt(eye.clone().add(dir));this.root.visible=false;return;}
    this.root.visible=true;
    let dist=this.mode===1?this.distance:-this.distance;
    // 镜头不进墙：从头部往机位走，撞到方块就缩短。
    const want=eye.clone().addScaledVector(dir,dist),back=want.clone().sub(eye),steps=Math.ceil(back.length()/.25);
    for(let i=1;i<=steps;i++){const p=eye.clone().addScaledVector(back,i/steps);
      if(this.physics.pointBlocked(p)){dist*= (i-1)/steps*.9;want.copy(eye).addScaledVector(dir,dist);break;}}
    if(this.mode===1){camera.position.copy(want);camera.lookAt(eye);}
    else{camera.position.copy(want);camera.lookAt(eye.clone().addScaledVector(dir,.8));}
  }
  dispose(){this.canvas.removeEventListener('pointerdown',this.down);window.removeEventListener('pointermove',this.move);window.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('wheel',this.wheel);window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.blur);this.owned.forEach(o=>o.dispose());this.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}
}
