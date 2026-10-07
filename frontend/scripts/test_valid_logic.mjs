import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const office=buildMcRoom('office'),physics=new RoomPhysics(office,blocks);
  
  const from=[5.5,1,12.2];
  const to=[20.5,1,25];
  
  const {min,max}=office.bounds;
  const ignoreRadius=5;
  const ignored=new Set(office.layout.chairs.filter(c=>[from,to].some(p=>Math.hypot(p[0]-c.position[0],p[2]-c.position[2])<ignoreRadius)).map(c=>c.id));
  
  console.log('ignored 集合:', [...ignored]);
  
  // 复制 valid() 的逻辑
  const valid=(x,z)=>{
    if(x<=min[0]+.35||x>=max[0]-.35||z<=min[2]+.35||z>=max[2]-.35)return false;
    for(const c of physics.colliders){
      if(ignored.has(c.id))continue;
      if(c.center.y+c.half.y<=1.03||c.center.y-c.half.y>=2.85)continue;
      if(!physics.horizontal(c,x,z,.31))continue;
      return false;
    }
    return true;
  };
  
  console.log('\n测试起点 [5.5, 12.2]:');
  const startValid=valid(5.5,12.2);
  console.log(`  valid() 结果: ${startValid}`);
  
  if(!startValid){
    console.log('  阻挡的碰撞体:');
    for(const c of physics.colliders){
      if(ignored.has(c.id))continue;
      if(c.center.y+c.half.y<=1.03||c.center.y-c.half.y>=2.85)continue;
      if(!physics.horizontal(c,5.5,12.2,.31))continue;
      console.log(`    ${c.id}`);
    }
  }
  
  console.log('\n测试终点 [20.5, 25]:');
  const goalValid=valid(20.5,25);
  console.log(`  valid() 结果: ${goalValid}`);
}finally{await vite.close();}
