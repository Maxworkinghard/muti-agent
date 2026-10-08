import fs from 'node:fs/promises';
import {createServer} from 'vite';
const server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
  const [{buildDebateRoom},{validateRoom},blocks]=await Promise.all([server.ssrLoadModule('/src/mc/rooms/debate.ts'),server.ssrLoadModule('/src/mc/rooms/validate.ts'),fs.readFile('public/mc/blocks.json','utf8').then(JSON.parse)]);
  const room=buildDebateRoom();
  // 带色板的房间（新画风）固定用原版 16×16 图集重画，只按原版图集检查。
  for(const pack of room.paint||room.material?[room.material??'original']:['original','hd','style']){
    const folder=pack==='original'?'public/mc':`public/mc/${pack}`;
    if(pack!=='original'&&!await fs.access(`${folder}/manifest.json`).then(()=>true,()=>false))continue;
    const atlas=JSON.parse(await fs.readFile(`${folder}/atlas.json`,'utf8'));
    const result=validateRoom(room,{...blocks,atlas});
    console.log(JSON.stringify({pack,blocks:room.blocks.length,...result},null,2));
    if(result.errors.length)process.exitCode=1;
  }
}finally{await server.close();}
