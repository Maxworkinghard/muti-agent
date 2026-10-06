import fs from 'node:fs/promises';
import {createServer} from 'vite';
const server=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true,hmr:false},appType:'custom'});
try{const [{buildDebateRoom},{validateRoom},blocks,atlas]=await Promise.all([server.ssrLoadModule('/src/mc/rooms/debate.ts'),server.ssrLoadModule('/src/mc/rooms/validate.ts'),fs.readFile('public/mc/blocks.json','utf8').then(JSON.parse),fs.readFile('public/mc/atlas.json','utf8').then(JSON.parse)]);const room=buildDebateRoom(),result=validateRoom(room,{...blocks,atlas});console.log(JSON.stringify({blocks:room.blocks.length,...result},null,2));if(result.errors.length)process.exitCode=1;}finally{await server.close();}
