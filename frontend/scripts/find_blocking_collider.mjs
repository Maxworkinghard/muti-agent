import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const office=buildMcRoom('office'),physics=new RoomPhysics(office,blocks);
  
  const to=[26.95,1,7.0];
  const step=.5,{min}=office.bounds;
  const goalX=Math.floor((to[0]-min[0])/step),goalZ=Math.floor((to[2]-min[2])/step);
  const px=min[0]+(goalX+.5)*step,pz=min[2]+(goalZ+.5)*step;
  
  console.log(`终点: [${to}]`);
  console.log(`终点单元格: [${goalX}, ${goalZ}] -> 坐标 [${px.toFixed(2)}, ${pz.toFixed(2)}]`);
  
  const ignoreRadius=5;
  const ignored=new Set(office.layout.chairs.filter(c=>Math.hypot(to[0]-c.position[0],to[2]-c.position[2])<ignoreRadius).map(c=>c.id));
  console.log(`忽略椅子:`, [...ignored]);
  
  console.log('\n阻挡终点的碰撞体:');
  for(const c of physics.colliders){
    if(ignored.has(c.id))continue;
    if(c.center.y+c.half.y<=1.03||c.center.y-c.half.y>=2.85)continue;
    const dx=px-c.center.x,dz=pz-c.center.z,cos=Math.cos(c.yaw),sin=Math.sin(c.yaw);
    const lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
    const dist=Math.hypot(Math.max(0,Math.abs(lx)-c.half.x),Math.max(0,Math.abs(lz)-c.half.z));
    if(dist<.31){
      console.log(`  ${c.id}`);
      console.log(`    center: [${c.center.x.toFixed(2)}, ${c.center.y.toFixed(2)}, ${c.center.z.toFixed(2)}]`);
      console.log(`    half: [${c.half.x.toFixed(2)}, ${c.half.y.toFixed(2)}, ${c.half.z.toFixed(2)}]`);
      console.log(`    yaw: ${c.yaw.toFixed(3)}, dist: ${dist.toFixed(3)}`);
    }
  }
}finally{await vite.close();}
