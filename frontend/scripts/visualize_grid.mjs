import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const office=buildMcRoom('office'),physics=new RoomPhysics(office,blocks);
  
  const from=[13,1,6.5], to=[25.95,1,6.3];
  const {min,max}=office.bounds, step=0.5;
  const ignored=new Set(office.layout.chairs.filter(c=>[from,to].some(p=>Math.hypot(p[0]-c.position[0],p[2]-c.position[2])<.7)).map(c=>c.id));
  
  console.log('起点和终点附近被忽略的椅子:');
  console.log('  ignored:', [...ignored]);
  
  const valid=(x,z)=>{
    if(x<=min[0]+.35||x>=max[0]-.35||z<=min[2]+.35||z>=max[2]-.35)return false;
    return !physics.colliders.some(c=>{
      if(ignored.has(c.id))return false;
      const top=c.center.y+c.half.y, bottom=c.center.y-c.half.y;
      if(top<=1.03||bottom>=2.85)return false;
      const dx=x-c.center.x,dz=z-c.center.z,cos=Math.cos(c.yaw),sin=Math.sin(c.yaw);
      const lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
      return Math.hypot(Math.max(0,Math.abs(lx)-c.half.x),Math.max(0,Math.abs(lz)-c.half.z))<.31;
    });
  };
  
  console.log('\n网格 z=5.5 到 z=7.5 的可行性 (x=12-28):');
  for(let z=5.5;z<=7.5;z+=0.5){
    let line=`z=${z.toFixed(1)}: `;
    for(let x=12;x<=28;x+=1){
      line+=valid(x,z)?'.' :'#';
    }
    line+=`  (起点x=13, 终点x=26)`;
    console.log(line);
  }
}finally{await vite.close();}
