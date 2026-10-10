/**
 * 驳岸（道具层）：沿 POND 的真实岸线叠一圈石头，盖住方块地边的台阶线。
 *   - 自然段是“黄石叠岸”：一叠叠横放的块石，底下一块泡在水里、往水里探出一点，上面一两块往岸里退，顶面高低错落；
 *     假山脚下的那一段更大更高；
 *   - 人工的边（南院、两层楼平台）是整齐的青石条压边，不用乱石。
 * 贴图和方块同一张（每米 16 像素），每块石头一点深浅差别；石缝里的蕨和菖蒲在 flora.ts。
 */
import * as THREE from 'three';
import type {V2Kit} from '../kit';
import {TexBoxes,paintedMaterial} from './mesh';
import {GARDEN_PAINTERS as PT} from './paint';
import {rng} from '../pixel';
import {COURT,GROUND,HILL,LOU,POND,WATER,inside} from './site';
import {hillHeight} from './terrain';

/** 岸线上这一点是人工的边（院子、楼台）还是自然叠石 */
const dressed=(x:number,z:number)=>(x>=COURT.x0-.5&&x<=COURT.x1+1.5&&z>=COURT.z0-1.2)||(x>=LOU.x0-1.5&&x<=LOU.x1+2.5&&z<=-23.3&&z>=-24.8);
/** 主榭南沿那一段（台基自己就是边） */
const underHall=(x:number,z:number)=>x>8.5&&x<23.5&&Math.abs(z-19)<.3;
/** 假山脚下（叠石更大更高） */
const hillFoot=(x:number,z:number)=>inside(HILL.outline,x,z-2.5)||inside(HILL.outline,x,z-1.5);

export interface ShoreSpot {x:number;z:number;out:[number,number]}
/**
 * 假山的崖面：方块山体每一处落差 ≥0.75 米的边，贴一叠横放的黄石块（一块 0.4–0.8 米厚、1–1.7 米长，往外探 5–30 厘米、转一点角度），
 * 层层错开，崖顶那块略高出平台；崖面上随手留几个石缝种蕨。方块的直边被盖住，读起来是叠出来的山石。
 */
function hillRocks(b:TexBoxes,crevices:ShoreSpot[]){
  const r=rng(733),[minX,maxX]=[Math.min(...HILL.outline.map(p=>p[0])),Math.max(...HILL.outline.map(p=>p[0]))],[minZ,maxZ]=[Math.min(...HILL.outline.map(p=>p[1])),Math.max(...HILL.outline.map(p=>p[1]))];
  for(let x=Math.floor(minX);x<=maxX;x++)for(let z=Math.floor(minZ);z<=maxZ;z++){const cx=x+.5,cz=z+.5,h=hillHeight(cx,cz);if(h<=0)continue;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const){const hn=hillHeight(cx+dx,cz+dz),drop=h-hn;if(drop<.75)continue;
      const top=GROUND+h,base=hn>0?GROUND+hn:GROUND-.35,yaw=Math.atan2(-dx,-dz);
      let y=base;while(y<top-.12){const sh=Math.min(top-y+.06,.4+r()*.4),L=1+r()*.7,D=.55+r()*.35,out=.05+r()*.25,t=(r()-.5)*.45;
        b.add(cx+dx*(.5+out-D/2)+dz*t,y+sh/2,cz+dz*(.5+out-D/2)-dx*t,L,sh,D,yaw+(r()-.5)*.24,new THREE.Color().setScalar(.86+r()*.2),['bottom']);
        if(r()<.08)crevices.push({x:cx+dx*(.55+out),z:cz+dz*(.55+out),out:[dx,dz]});
        y+=sh*(.9+r()*.08);}}}
}
export function buildShore(k:V2Kit):{mesh:THREE.Group;crevices:ShoreSpot[]}{
  const r=rng(731),yellow=new TexBoxes(),green=new TexBoxes(),crevices:ShoreSpot[]=[];
  for(let i=0;i<POND.length;i++){const [ax,az]=POND[i],[bx,bz]=POND[(i+1)%POND.length],len=Math.hypot(bx-ax,bz-az);if(len<.01)continue;
    const dx=(bx-ax)/len,dz=(bz-az)/len,yaw=Math.atan2(-dz,dx);
    // 水在多边形里面：朝外（岸那边）的法线是把边方向转 90° 后指向多边形外的那一边
    let nx=-dz,nz=dx;const mx=(ax+bx)/2,mz=(az+bz)/2;if(inside(POND,mx+nx*.3,mz+nz*.3)){nx=-nx;nz=-nz;}
    for(let s=0;s<len;){const x=ax+dx*s,z=az+dz*s;
      if(x<-16.5){s+=1;continue;}
      if(underHall(x,z)){s+=.5;continue;}
      if(dressed(x,z)){
        // 青石条：0.9–1.2 米一条，压在岸边、出水 0.85 米，外沿稍稍探出水面
        const L=Math.min(len-s,.9+r()*.3);green.add(x+dx*L/2-nx*.18,(WATER-.25+GROUND)/2,z+dz*L/2-nz*.18,L-.02,GROUND-WATER+.25,.6,yaw,new THREE.Color().setScalar(.94+r()*.08),['bottom']);
        s+=L;continue;}
      const big=hillFoot(x,z),L=(big?1.1:.65)+r()*(big?1.1:.75),D=(big?1.1:.8)+r()*.45,j=(r()-.5)*.28;
      const tint=()=>new THREE.Color().setScalar(.88+r()*.18);
      // 底石：一半泡在水里，往水里探 0–0.35 米
      const out=-(.1+r()*.32),h0=.42+r()*.22;
      yellow.add(x+dx*L/2+nx*out,WATER-.28+h0/2,z+dz*L/2+nz*out,L,h0,D,yaw+j,tint(),['bottom']);
      // 第二层：往岸里退一点，顶面在地面上下 15 厘米
      const back=.18+r()*.3,top=GROUND-.12+r()*.3,y1=WATER-.28+h0-.06,h1=top-y1;
      if(h1>.12)yellow.add(x+dx*(L*.45)+nx*back*.6,y1+h1/2,z+dz*(L*.45)+nz*back*.6,L*(.7+r()*.3),h1,D*.8,yaw-j*.6,tint(),['bottom']);
      // 偶尔再叠一块高出地面（假山脚下常有），留个石缝种蕨
      if(big||r()<.22){const h2=(big?.45:.22)+r()*(big?.7:.25),l2=L*(.4+r()*.35);yellow.add(x+dx*L*(.2+r()*.5)+nx*(back+.25),top+h2/2-.04,z+dz*L*(.2+r()*.5)+nz*(back+.25),l2,h2,D*.6,yaw+(r()-.5)*.4,tint(),['bottom']);}
      if(r()<.35)crevices.push({x:x+dx*L+nx*(back*.5),z:z+dz*L+nz*(back*.5),out:[-nx,-nz]});
      s+=L*(.82+r()*.12);}}
  hillRocks(yellow,crevices);
  const g=new THREE.Group();g.name='garden-shore';
  g.add(yellow.mesh(paintedMaterial(k,'rt-yellow-stone',PT.yellowStone),'shore-yellow'));
  g.add(green.mesh(paintedMaterial(k,'rt-green-stone',PT.greenStone),'shore-dressed'));
  return {mesh:g,crevices};
}
