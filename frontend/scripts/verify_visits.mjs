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
  
  console.log('验证所有 visits 位置:\n');
  let allClear=true;
  for(let i=0;i<office.work.visits.length;i++){
    const v=office.work.visits[i];
    const p=new THREE.Vector3(...v);
    const can=physics.canOccupy(p);
    console.log(`座位${i}: [${v[0].toFixed(1)}, ${v[2].toFixed(1)}] ${can?'✓':'✗'}`);
    if(!can)allClear=false;
  }
  
  if(allClear){
    console.log('\n✓ 所有 visits 位置都可通行');
    
    // 测试几条路径
    console.log('\n测试关键路径:');
    const tests=[
      [0,3,'座位0 -> 座位3'],
      [3,10,'座位3 -> 座位10'],
      [10,6,'座位10 -> 座位6'],
    ];
    for(const [i,j,desc] of tests){
      const from=office.anchors[i].seat;
      const to=office.work.visits[j];
      const path=physics.path(from,to);
      console.log(`  ${desc}: ${path.length?path.length+' 点 ✓':'失败 ✗'}`);
    }
  }
}finally{await vite.close();}
