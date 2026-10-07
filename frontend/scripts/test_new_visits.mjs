import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const office=buildMcRoom('office');
  
  // 手动计算新的 visits 位置
  const newVisits = office.anchors.map(a=>{
    const sin=Math.sin(a.homeYaw),cos=Math.cos(a.homeYaw);
    const right_x=cos,right_z=-sin;
    const forward_x=sin,forward_z=cos;
    return [a.seat[0]+right_x*1.0+forward_x*0.6,1,a.seat[2]+right_z*1.0+forward_z*0.6];
  });
  
  const physics=new RoomPhysics(office,blocks);
  const THREE = await vite.ssrLoadModule('three');
  
  console.log('测试新的 visits 位置是否可通行:\n');
  for(let i=0;i<newVisits.length;i++){
    const v=newVisits[i];
    const p=new THREE.Vector3(...v);
    const can=physics.canOccupy(p);
    console.log(`座位${i}: [${v[0].toFixed(2)}, ${v[2].toFixed(2)}] ${can?'✓':'✗'}`);
  }
}finally{await vite.close();}
