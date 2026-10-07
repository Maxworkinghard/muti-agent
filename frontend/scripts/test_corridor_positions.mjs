import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const office=buildMcRoom('office'),physics=new RoomPhysics(office,blocks);
  const THREE = await vite.ssrLoadModule('three');
  
  const tests=[
    {name:'座位3-窄通道', pos:[26,1,5.2]},
    {name:'座位9-窄通道', pos:[25,1,5.2]},
    {name:'座位10-窄通道', pos:[27,1,5.2]},
    {name:'座位3-左侧', pos:[24.5,1,6.5]},
    {name:'座位9-左侧', pos:[23.5,1,5.8]},
    {name:'座位10-右侧', pos:[28.5,1,5.8]},
  ];
  
  console.log('测试候选位置:\n');
  for(const t of tests){
    const p=new THREE.Vector3(...t.pos);
    const can=physics.canOccupy(p);
    console.log(`${t.name} [${t.pos[0]},${t.pos[2]}]: ${can?'✓':'✗'}`);
  }
}finally{await vite.close();}
