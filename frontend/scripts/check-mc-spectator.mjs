import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createServer} from 'vite';

const saved=Object.fromEntries(['window','document','Element'].map(k=>[k,globalThis[k]]));
const win=new EventTarget(),doc=new EventTarget();
doc.activeElement=null;doc.pointerLockElement=null;
doc.exitPointerLock=()=>{doc.pointerLockElement=null;doc.dispatchEvent(new Event('pointerlockchange'));};
class ElementStub extends EventTarget {
  constructor(tagName){super();this.tagName=tagName;this.dataset={};}
  closest(){return ['INPUT','TEXTAREA','SELECT'].includes(this.tagName)?this:null;}
  focus(){doc.activeElement=this;doc.dispatchEvent(new Event('focusin'));}
  setPointerCapture(){}
}
Object.assign(globalThis,{window:win,document:doc,Element:ElementStub});
const event=(type,fields={})=>Object.assign(new Event(type,{cancelable:true}),fields);
const canvas=new ElementStub('CANVAS');
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
let controls;
try {
  const [{SpectatorCamera},{buildDebateRoom}]=await Promise.all([vite.ssrLoadModule('/src/mc/spectator.ts'),vite.ssrLoadModule('/src/mc/rooms/debate.ts')]);
  const room=buildDebateRoom(),camera=new THREE.PerspectiveCamera(70,1,.03,300);camera.position.set(...room.bounds.max);camera.lookAt(...room.cameraTarget);
  controls=new SpectatorCamera(room,canvas);let exits=0;controls.onExit=()=>exits++;
  const key=(code,down=true)=>win.dispatchEvent(event(down?'keydown':'keyup',{code,key:code,metaKey:false,altKey:false}));
  const advance=(seconds=1)=>{for(let n=0;n<Math.round(seconds/.05);n++)controls.update(.05,camera);};
  const move=(codes,seconds=1)=>{const from=controls.position;codes.forEach(c=>key(c));advance(seconds);codes.forEach(c=>key(c,false));return controls.position.sub(from);};
  controls.enter(camera,false);controls.update(0,camera);
  assert.equal(doc.activeElement,canvas);assert.equal(controls.active,true);assert.deepEqual(controls.position.toArray(),room.camera);
  const forward=move(['KeyW']);assert.ok(forward.z<0);assert.ok(Math.abs(forward.length()-4.3)<1e-7);
  const backward=move(['KeyS']);assert.ok(forward.clone().add(backward).length()<1e-7);
  const left=move(['KeyA']),right=move(['KeyD']);assert.ok(left.x<0&&right.x>0);assert.ok(left.clone().add(right).length()<1e-7);
  const up=move(['Space']),down=move(['ControlLeft']);assert.ok(up.y>0&&down.y<0);
  assert.ok(controls.position.y>room.bounds.min[1]&&controls.position.y<room.bounds.max[1],'升降越过了地板或天花板');
  const boosted=move(['KeyW','ShiftLeft'],.2);assert.ok(boosted.length()>1&&boosted.length()<=12.9*.2+1e-7,'Shift 加速距离不对');
  const diagonal=move(['KeyW','KeyD'],.2);assert.ok(diagonal.length()>0&&diagonal.length()<=4.3*.2+1e-7,'斜向移动不应加速');
  key('KeyW');for(let i=0;i<200;i++)controls.update(.05,camera);key('KeyW',false);
  const p=controls.position;assert.ok(p.x>room.bounds.min[0]&&p.x<room.bounds.max[0]&&p.y>room.bounds.min[1]&&p.y<room.bounds.max[1]&&p.z>room.bounds.min[2]&&p.z<room.bounds.max[2],'镜头穿出了室内');
  const stopped=controls.position;advance(2);assert.ok(controls.position.distanceTo(stopped)<1e-7,'松键后不得继续滑动');
  console.log('Pass：按钮进入即获焦点；WASD/升降/Shift 加速方向与速度正确；斜向等速、松键停止。');

  key('KeyW');new ElementStub('TEXTAREA').focus();advance();assert.equal(controls.active,false);assert.ok(controls.position.distanceTo(stopped)<1e-7);
  controls.enter(camera,false);advance();assert.ok(controls.position.distanceTo(stopped)<1e-7,'重新进入不应沿用旧按键');
  key('KeyW');win.dispatchEvent(new Event('blur'));advance();assert.ok(controls.position.distanceTo(stopped)<1e-7);
  console.log('Pass：切到输入框和窗口失焦立即停住，重新进入不带旧按键。');

  controls.exit();
  camera.position.set((room.bounds.min[0]+room.bounds.max[0])/2,2.8,(room.bounds.min[2]+room.bounds.max[2])/2);camera.lookAt(...room.cameraTarget);
  controls.enter(camera,false);controls.update(0,camera);
  const beforeDirection=camera.getWorldDirection(new THREE.Vector3());
  canvas.dispatchEvent(event('pointerdown',{button:2,buttons:2,clientX:100,clientY:100,pointerId:1}));
  win.dispatchEvent(event('pointermove',{buttons:2,clientX:260,clientY:160}));controls.update(0,camera);win.dispatchEvent(new Event('pointerup'));
  const afterDirection=camera.getWorldDirection(new THREE.Vector3());assert.ok(beforeDirection.angleTo(afterDirection)>.4);
  const beforeDrift=controls.position.clone();key('KeyW');for(let i=0;i<4;i++)controls.update(.05,camera);key('KeyW',false);
  const drifted=controls.position.clone().sub(beforeDrift);
  const dirH=new THREE.Vector3(afterDirection.x,0,afterDirection.z).normalize(),movedH=new THREE.Vector3(drifted.x,0,drifted.z);
  assert.ok(movedH.length()>.4&&movedH.normalize().dot(dirH)>.95,'前进必须跟随转向后的镜头');
  canvas.dispatchEvent(event('wheel',{deltaY:-10000}));assert.equal(controls.speed,16);
  canvas.dispatchEvent(event('wheel',{deltaY:10000}));assert.equal(controls.speed,.5);
  console.log('Pass：拖动转向后按 W 沿新朝向移动，滚轮调速有边界。');

  doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));assert.equal(controls.locked,true);
  win.dispatchEvent(event('mousemove',{movementX:20,movementY:-10000}));controls.update(0,camera);
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).y>.99,'锁鼠标支持相对移动并限制俯仰');
  doc.exitPointerLock();assert.equal(controls.entered,false);assert.equal(exits,1);
  canvas.requestPointerLock=()=>Promise.reject(new Error('unsupported in embedded browser'));
  controls.enter(camera);await Promise.resolve();assert.equal(controls.active,true);assert.equal(controls.locked,false);
  key('Escape');assert.equal(controls.entered,false);assert.equal(exits,2);
  console.log('Pass：锁鼠标的相对转向、解锁退出，以及锁定失败后可继续拖动和按 Esc 退出。');

  controls.enter(camera,false);controls.dispose();const final=controls.position;
  key('KeyW');advance();assert.ok(controls.position.distanceTo(final)<1e-7);assert.equal(controls.entered,false);
  console.log('Pass：卸载退出控制并移除监听，按键不会影响已退出的镜头。');
} finally {
  controls?.dispose();await vite.close();
  for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
}
