import fs from 'node:fs/promises';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,logLevel:'error',server:{middlewareMode:true}});
try{
  const [{buildMcRoom},{RoomPhysics}]=await Promise.all([
    vite.ssrLoadModule('/src/mc/rooms/scenes.ts'),
    vite.ssrLoadModule('/src/mc/rooms/physics.ts')]);
  const blocks=JSON.parse(await fs.readFile('public/mc/blocks.json','utf8'));
  const office=buildMcRoom('office');
  
  // 手动运行 path 逻辑并添加日志
  const from=[13,1,6.5], to=[25.95,1,6.3];
  const {min,max}=office.bounds, step=0.5;
  const cols=Math.ceil((max[0]-min[0])/step), rows=Math.ceil((max[2]-min[2])/step);
  const ignored=new Set(office.layout.chairs.filter(c=>[from,to].some(p=>Math.hypot(p[0]-c.position[0],p[2]-c.position[2])<.7)).map(c=>c.id));
  const physics=new RoomPhysics(office,blocks);
  
  const valid=(x,z)=>{
    if(x<=min[0]+.35||x>=max[0]-.35||z<=min[2]+.35||z>=max[2]-.35)return false;
    return !physics.colliders.some(c=>{
      if(ignored.has(c.id))return false;
      if(c.center.y+c.half.y<=1.03||c.center.y-c.half.y>=2.85)return false;
      const dx=x-c.center.x,dz=z-c.center.z,cos=Math.cos(c.yaw),sin=Math.sin(c.yaw);
      const lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
      return Math.hypot(Math.max(0,Math.abs(lx)-c.half.x),Math.max(0,Math.abs(lz)-c.half.z))<.31;
    });
  };
  
  const id=(x,z)=>z*cols+x;
  const point=(n)=>[min[0]+(n%cols+.5)*step,1,min[2]+(Math.floor(n/cols)+.5)*step];
  
  const cell=(p)=>{
    const x=Math.floor((p[0]-min[0])/step),z=Math.floor((p[2]-min[2])/step);
    let chosen=-1,best=Infinity;
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
      const xx=x+dx,zz=z+dz;
      if(xx<0||xx>=cols||zz<0||zz>=rows)continue;
      const n=id(xx,zz),v=point(n),d=Math.hypot(v[0]-p[0],v[2]-p[2]);
      if(d>=best||!valid(v[0],v[2]))continue;
      let clear=true;
      for(let t=0;t<=1;t+=.1)if(!valid(v[0]+(p[0]-v[0])*t,v[2]+(p[2]-v[2])*t)){clear=false;break;}
      if(clear){chosen=n;best=d;}
    }
    return chosen;
  };
  
  const start=cell(from),goal=cell(to);
  console.log(`Start: ${start} at ${point(start)}, Goal: ${goal} at ${point(goal)}`);
  
  if(start<0||goal<0){console.log('起点或终点无效');process.exit(1);}
  
  const open=new Set([start]),came=new Map(),cost=new Map([[start,0]]);
  const heuristic=(n)=>{const p=point(n);return Math.hypot(p[0]-to[0],p[2]-to[2]);};
  
  let found=false,iterations=0;
  for(let guard=0;open.size&&guard<cols*rows;guard++){
    iterations++;
    let current=-1,best=Infinity;
    for(const n of open){const score=cost.get(n)+heuristic(n);if(score<best){best=score;current=n;}}
    if(current===goal){found=true;console.log(`找到路径！迭代 ${iterations} 次`);break;}
    open.delete(current);
    const x=current%cols,z=Math.floor(current/cols);
    let expanded=0;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const xx=x+dx,zz=z+dz;
      if(xx<0||xx>=cols||zz<0||zz>=rows)continue;
      const n=id(xx,zz),p=point(n),mid=point(current);
      if(!valid(p[0],p[2])||!valid((p[0]+mid[0])/2,(p[2]+mid[2])/2))continue;
      const g=cost.get(current)+Math.hypot(dx,dz)*step;
      if(g>=(cost.get(n)??Infinity))continue;
      came.set(n,current);cost.set(n,g);open.add(n);expanded++;
    }
    if(iterations<=5||iterations%50===0)
      console.log(`迭代 ${iterations}: current=${current} at ${point(current).map(v=>v.toFixed(1))}, open=${open.size}, expanded=${expanded}`);
  }
  
  if(!found)console.log(`未找到路径。总迭代: ${iterations}, open.size: ${open.size}`);
}finally{await vite.close();}
