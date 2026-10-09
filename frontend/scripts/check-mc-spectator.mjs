import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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
let controls,stageCamera;
try {
  const [{SpectatorCamera},{buildMcRoom},{RoomPhysics},{StageCamera}]=await Promise.all([vite.ssrLoadModule('/src/mc/spectator.ts'),vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),vite.ssrLoadModule('/src/mc/rooms/physics.ts'),vite.ssrLoadModule('/src/mc/camera.ts')]);
  const room=buildMcRoom(),zone=room.flight??room.bounds;
  stageCamera=new StageCamera(room,canvas);const camera=stageCamera.camera;
  const physics=new RoomPhysics(room,JSON.parse(await fs.readFile('public/mc/blocks.json','utf8')));
  const origin=new THREE.Vector3(...room.camera),probe=origin.clone();physics.moveCamera(probe,new THREE.Vector3(0,0,-.2));
  console.log('默认机位真实物理：',JSON.stringify({position:origin.toArray(),bounds:room.bounds,flight:zone,entityBlocked:physics.pointBlocked(origin,.34),cameraBlocked:physics.cameraBlocked(origin),probe:probe.toArray()}));
  assert.equal(physics.cameraBlocked(origin),false,'圆桌样板默认相机在合法 flight 中，不应被行走 bounds 阻挡');
  assert.ok(probe.z<origin.z,'真实 RoomPhysics 必须允许默认机位向前移动');
  camera.position.copy(origin);camera.lookAt(...room.cameraTarget);
  controls=new SpectatorCamera(room,canvas,physics);let exits=0;controls.onExit=()=>{exits++;stageCamera.select('overview');};
  const key=(code,down=true)=>win.dispatchEvent(event(down?'keydown':'keyup',{code,key:code,metaKey:false,altKey:false}));
  const advance=(seconds=1)=>{for(let n=0;n<Math.round(seconds/.05);n++)controls.update(.05,camera);};
  const move=(codes,seconds=1)=>{const from=controls.position;codes.forEach(c=>key(c));advance(seconds);codes.forEach(c=>key(c,false));return controls.position.sub(from);};
  const startAt=(position,target)=>{controls.exit();camera.position.set(...position);camera.lookAt(...target);controls.enter(camera,false);controls.update(0,camera);assert.deepEqual(controls.position.toArray(),position,'合法起点不应被换成默认机位');};
  stageCamera.select('free');
  controls.enter(camera,false);controls.update(0,camera);
  assert.equal(doc.activeElement,canvas);assert.equal(controls.active,true);assert.deepEqual(controls.position.toArray(),room.camera);
  const forward=move(['KeyW']);assert.ok(forward.z<0);assert.ok(Math.abs(forward.length()-4.3)<1e-7);
  const backward=move(['KeyS']);assert.ok(forward.clone().add(backward).length()<1e-7);
  const initialLeft=move(['KeyA'],.1),initialRight=move(['KeyD'],.1);assert.ok(initialLeft.x<0&&initialRight.x>0,'默认机位支持左右短移');
  // 默认机位左侧有真实木柱；完整速度/往返测试放在 flight 内的开阔区域，柱子阻挡另测。
  startAt([25,10,20],[25,10,19]);
  const left=move(['KeyA']),right=move(['KeyD']);assert.ok(left.x<0&&right.x>0);assert.ok(left.clone().add(right).length()<1e-7);
  const up=move(['Space']),down=move(['ControlLeft']);assert.ok(up.y>0&&down.y<0);
  assert.ok(controls.position.y>zone.min[1]&&controls.position.y<zone.max[1],'升降越过了地板或飞行范围');
  const boosted=move(['KeyW','ShiftLeft'],.2);assert.ok(boosted.length()>1&&boosted.length()<=12.9*.2+1e-7,'Shift 加速距离不对');
  const diagonal=move(['KeyW','KeyD'],.2);assert.ok(diagonal.length()>0&&diagonal.length()<=4.3*.2+1e-7,'斜向移动不应加速');
  key('KeyW');for(let i=0;i<200;i++)controls.update(.05,camera);key('KeyW',false);
  const p=controls.position;assert.ok(p.x>zone.min[0]&&p.x<zone.max[0]&&p.y>zone.min[1]&&p.y<zone.max[1]&&p.z>zone.min[2]&&p.z<zone.max[2],'镜头飞出了允许的范围');
  const stopped=controls.position;advance(2);assert.ok(controls.position.distanceTo(stopped)<1e-7,'松键后不得继续滑动');
  console.log('Pass：按钮进入即获焦点；WASD/升降/Shift 加速方向与速度正确；斜向等速、松键停止。');

  key('KeyW');new ElementStub('TEXTAREA').focus();advance();assert.equal(controls.active,false);assert.ok(controls.position.distanceTo(stopped)<1e-7);
  controls.enter(camera,false);advance();assert.ok(controls.position.distanceTo(stopped)<1e-7,'重新进入不应沿用旧按键');
  key('KeyW');win.dispatchEvent(new Event('blur'));advance();assert.ok(controls.position.distanceTo(stopped)<1e-7);
  console.log('Pass：切到输入框和窗口失焦立即停住，重新进入不带旧按键。');

  startAt([8,2.8,7.5],[0,2.8,7.5]);move(['KeyW','ShiftLeft'],2);
  assert.ok(controls.position.x>=7.34&&controls.position.x<7.5,'不能穿过圆桌厅西侧真实木柱');
  assert.ok(move(['KeyD'],.2).z<-.7,'墙边横移不应卡死');assert.ok(move(['KeyS'],.2).x>.7,'撞墙后应能后退');
  startAt([8,2.8,14],[8,2.8,17]);move(['KeyW','ShiftLeft'],2);assert.ok(controls.position.z<15.3,'不能穿过圆桌厅南侧真实格窗');
  startAt([8.5,10,6.5],[8.5,10,0]);move(['ControlLeft','ShiftLeft'],2);assert.ok(controls.position.y>=7.84&&controls.position.y<8,'从屋外下降不能穿真实屋顶');
  startAt([25,3,22],[25,3,20]);assert.ok(move(['KeyW'],.2).z<-.8,'行走范围外、flight 内必须能飞行');
  for(const t of room.layout.tables){
    const center=new THREE.Vector3(t.center[0],t.center[1]+t.height/2,t.center[2]),normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),t.skirtYaw);
    assert.equal(physics.cameraBlocked(center),true,'桌子必须挡相机：'+t.id);
    const p=center.clone().addScaledVector(normal,t.depth/2+.34+.8);assert.equal(physics.cameraBlocked(p),false);
    physics.moveCamera(p,normal.clone().multiplyScalar(-1.5));
    assert.ok(p.clone().sub(center).dot(normal)>=t.depth/2+.34-1e-7,'不能穿过圆桌碰撞箱：'+t.id);
  }
  for(const c of room.layout.chairs){
    assert.equal(physics.cameraBlocked(new THREE.Vector3(c.position[0],c.position[1]+.5,c.position[2])),true,'不能按 chair 名称跳过真实坐垫：'+c.id);
    const back=new THREE.Vector3(0,.8,-.21).applyAxisAngle(new THREE.Vector3(0,1,0),c.yaw).add(new THREE.Vector3(...c.position));
    assert.equal(physics.cameraBlocked(back),true,'真实椅背必须挡相机：'+c.id);
  }
  console.log('Pass：圆桌真实木柱、格窗、屋顶、桌子、椅垫/椅背阻挡；屋外可飞行，墙边可横移和后退。');

  const axes=['x','y','z'],r=.34;
  for(const [i,axis] of axes.entries())for(const sign of [-1,1]){
    const p=new THREE.Vector3(25,12,22),limit=sign<0?zone.min[i]+r:zone.max[i]-r;p[axis]=limit-sign*.02;
    assert.equal(physics.cameraBlocked(p),false,'边缘内起点应合法');
    const delta=new THREE.Vector3();delta[axis]=sign*2;physics.moveCamera(p,delta);
    assert.ok(sign*(p[axis]-limit)<=1e-7&&Math.abs(p[axis]-limit)<.12,'不能跨越 flight 边缘：'+axis+sign);
    assert.equal(physics.cameraBlocked(p),false,'边缘不应落入非法区域');
    const stopped=p.clone();physics.moveCamera(p,delta);assert.ok(p.distanceTo(stopped)<1e-7,'反复撞边界不能非法越界');
    const tangent=axis==='y'?'x':'y',slide=new THREE.Vector3();slide[tangent]=.5;physics.moveCamera(p,slide);
    assert.ok(p[tangent]-stopped[tangent]>.49,'飞行边缘应能沿边滑动');
    delta[axis]=-sign*.7;const before=p[axis];physics.moveCamera(p,delta);assert.ok(-sign*(p[axis]-before)>.69,'边缘应能退回内部');
  }
  const corner=new THREE.Vector3(...zone.max.map(v=>v-r-.01));physics.moveCamera(corner,new THREE.Vector3(3,3,3));assert.equal(physics.cameraBlocked(corner),false,'飞行角点不能非法穿越');
  const cornerBefore=corner.clone();physics.moveCamera(corner,new THREE.Vector3(-1,-1,-1));assert.ok(corner.distanceTo(cornerBefore)>1.7,'角点不能卡死');
  const indoors=new RoomPhysics({...room,flight:undefined},JSON.parse(await fs.readFile('public/mc/blocks.json','utf8')));
  assert.equal(indoors.cameraBlocked(new THREE.Vector3(25,3,22)),true,'未定义 flight 的房间必须回退到 bounds');
  const outsideWalk=new THREE.Vector3(25,1,22);assert.equal(physics.cameraBlocked(new THREE.Vector3(25,2.8,22)),false);assert.equal(physics.canOccupy(outsideWalk),false,'允许相机飞行不能扩大角色行走范围');
  assert.deepEqual(physics.path([25,1,22],[8,1,6]),[],'角色不能在 flight 外围寻路');
  const route=physics.path([8.05,1,6.05],[17.45,1,13.45]);assert.ok(route.length>0,'厅内绕桌原寻路必须可用');
  for(const p of route){assert.equal(physics.canOccupy(new THREE.Vector3(...p)),true,'角色路线必须合法');assert.ok(p[0]>=room.bounds.min[0]&&p[0]<=room.bounds.max[0]&&p[2]>=room.bounds.min[2]&&p[2]<=room.bounds.max[2]);}
  console.log('Pass：flight 六个面/角点、反复撞边、贴边滑动及回退；无 flight 回退；角色仍受 bounds 约束，厅内绕桌寻路可用。');

  controls.exit();
  // 在屋里平视着进入（默认机位的看点在地面上，从屋中间看过去几乎是正下方，不适合测转向）。
  const mid=[(room.bounds.min[0]+room.bounds.max[0])/2,2.8,(room.bounds.min[2]+room.bounds.max[2])/2];camera.position.set(...mid);camera.lookAt(mid[0],2.8,mid[2]-5);
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
  assert.equal(stageCamera.view,'overview');assert.deepEqual(camera.position.toArray(),room.camera,'解锁退出应恢复默认机位');
  canvas.requestPointerLock=()=>Promise.reject(new Error('unsupported in embedded browser'));
  controls.enter(camera);await Promise.resolve();assert.equal(controls.active,true);assert.equal(controls.locked,false);
  key('Escape');assert.equal(controls.entered,false);assert.equal(exits,2);
  assert.equal(stageCamera.view,'overview');assert.deepEqual(camera.position.toArray(),room.camera,'Esc 退出应恢复默认机位');
  const expected=new THREE.Vector3(...room.cameraTarget).sub(new THREE.Vector3(...room.camera)).normalize();
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected)<1e-7,'退出应恢复默认朝向');
  console.log('Pass：锁鼠标的相对转向、解锁退出，以及锁定失败后可继续拖动和按 Esc 退出。');

  controls.enter(camera,false);controls.dispose();const final=controls.position;
  key('KeyW');advance();assert.ok(controls.position.distanceTo(final)<1e-7);assert.equal(controls.entered,false);
  console.log('Pass：卸载退出控制并移除监听，按键不会影响已退出的镜头。');
} finally {
  controls?.dispose();stageCamera?.dispose();await vite.close();
  for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
}
