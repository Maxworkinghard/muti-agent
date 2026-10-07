import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const office=buildMcRoom('office'),physics=new RoomPhysics(office,blocks);
  
  // anchors[6] 是真正的起点
  const from=office.anchors[6].seat;
  const to=office.work.visits[12];
  
  console.log('测试路径: anchors[6] -> visits[12]');
  console.log(`  起点: [${from[0]}, ${from[2]}]`);
  console.log(`  终点: [${to[0]}, ${to[2]}]`);
  
  const path=physics.path(from,to);
  console.log(`  路径结果: ${path.length?path.length+' 点 ✓':'失败 ✗'}`);
  
  if(path.length){
    console.log('  路径点:');
    for(const p of path){
      console.log(`    [${p[0].toFixed(2)}, ${p[2].toFixed(2)}]`);
    }
  }
}finally{await vite.close();}
