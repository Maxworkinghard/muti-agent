import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const office=buildMcRoom('office'),physics=new RoomPhysics(office,blocks);
  
  // 座位 6 位置: [5.5, 15.8] (面南，yaw=0)
  const from=[5.5,1,15.8];  // 座位 6
  const to=office.work.visits[12];  // visits[12] = [20.5, 1, 25]
  
  console.log('测试路径: 座位6 -> visits[12]');
  console.log(`  起点: [${from[0]}, ${from[2]}]`);
  console.log(`  终点: [${to[0]}, ${to[2]}]`);
  
  const path=physics.path(from,to);
  console.log(`  路径结果: ${path.length?path.length+' 点':'失败'}`);
  
  if(!path.length){
    console.log('\n✗ 路径查找失败');
    
    // 检查终点是否可通行
    const THREE = await vite.ssrLoadModule('three');
    const p=new THREE.Vector3(...to);
    const can=physics.canOccupy(p);
    console.log(`  终点可通行: ${can?'是':'否'}`);
    
    // 检查 ignore radius 设置
    console.log(`  office room kind: ${office.kind}`);
    console.log(`  当前 ignoreRadius: ${office.kind==='office'?5:0.7}`);
  }
}finally{await vite.close();}
