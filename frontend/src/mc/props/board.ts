import * as THREE from 'three';
import type {Room} from '../rooms/debate';
import type {PropMaterials} from './materials';
import {mesh,rbox,textCanvas,FONT,type Keep} from './geometry';
import type {PropState} from './debateProps';
/**
 * 辩题板：北墙上一块大木框板子（第 12.12 节第 6 条「北墙宽的三分之一左右」+12.15 辩论室：
 * 室内北墙 14 米，板宽 7.2 米、高 2.4 米，按新房间的投影保证占画面至少 40%，
 * 底边比主持头顶高至少半米；羊皮纸底、墨色字、两队用 2D 场景的旗色。
 * 辩题、双方成员、阶段条和比分都画在这张画布上，换轮和出结果才重画。
 */
export function createBoard(layout:Room['layout'],m:PropMaterials,keep:Keep){
  const sc=layout.board,canvas=document.createElement('canvas');canvas.width=1600;canvas.height=640;const c2=canvas.getContext('2d')!;
  const texture=keep(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  const board=new THREE.Group();board.position.set(...sc.position);
  board.add(mesh(rbox(sc.width+.18,sc.height+.18,.08,.006),m.woodDark,0,0,0));
  board.add(mesh(rbox(sc.width+.18,.12,.1,.006),m.wood,0,sc.height/2+.07,0));
  board.add(mesh(new THREE.PlaneGeometry(sc.width,sc.height),keep(new THREE.MeshStandardMaterial({map:texture,roughness:.92})),0,0,.041,false));
  let key='';
  const fit=(text:string,max:number,size:number,weight=700,min=30)=>{let n=size;c2.font=`${weight} ${n}px ${FONT}`;while(n>min&&c2.measureText(text).width>max){n-=2;c2.font=`${weight} ${n}px ${FONT}`;}return n;};
  const draw=(s:PropState)=>{
    const next=JSON.stringify([s.theme,s.stages,s.stage,s.label,s.round,s.proNames,s.conNames,s.result]);if(next===key)return;key=next;
    const W=1600,H=640,bar=120;c2.fillStyle='#fbf3df';c2.fillRect(0,0,W,H);
    c2.fillStyle='rgba(61,58,66,.05)';for(let y=0;y<H;y+=4)for(let x=(y/4)%2?0:4;x<W;x+=8)c2.fillRect(x,y,2,2);
    c2.strokeStyle='#8a5b34';c2.lineWidth=8;c2.strokeRect(8,8,W-16,H-16);
    c2.textAlign='center';c2.textBaseline='middle';c2.fillStyle='#3d3a42';
    const title='辩题：'+(s.theme||'待定');
    if(c2.measureText(title).width<=W-140){c2.font=`700 ${fit(title,W-140,96)}px ${FONT}`;c2.fillText(title,W/2,104);}
    else{const chars=Array.from(title),cut=Math.ceil(chars.length/2),lines=[chars.slice(0,cut).join(''),chars.slice(cut).join('')];const size=Math.min(...lines.map(l=>fit(l,W-140,80)));lines.forEach((l,i)=>c2.fillText(l,W/2,76+i*(size+16)));}
    const mid=(210+H-bar)/2+6;
    if(s.result){const w=s.result.winner;c2.fillStyle='#3d3a42';c2.font=`800 210px ${FONT}`;c2.fillText(`${s.result.pro??'—'} : ${s.result.con??'—'}`,W/2,mid-16);
      c2.font=`700 104px ${FONT}`;c2.fillStyle='#4e79a1';c2.fillText('正方',W/2-590,mid-16);c2.fillStyle='#c45f53';c2.fillText('反方',W/2+590,mid-16);
      c2.font=`800 92px ${FONT}`;c2.fillStyle=w==='pro'?'#4e79a1':w==='con'?'#c45f53':'#c9973a';c2.fillText(w==='pro'?'正方胜':w==='con'?'反方胜':'平局',W/2,mid+126);}
    else{for(const [side,x,color,names] of [['正方',W/4,'#4e79a1',s.proNames],['反方',W*3/4,'#c45f53',s.conNames]] as const){c2.fillStyle=color;c2.font=`800 104px ${FONT}`;c2.fillText(side,x,mid-64);c2.fillStyle='#3d3a42';const line=names.length?names.join(' · '):'—';fit(line,W/2-140,84,600);c2.fillText(line,x,mid+58);}
      c2.fillStyle='rgba(61,58,66,.2)';c2.fillRect(W/2-3,mid-128,6,256);}
    c2.fillStyle='rgba(138,91,52,.12)';c2.fillRect(0,H-bar,W,bar);
    const stageName=s.round?`第 ${s.round} 轮 · ${s.label}`:'等待开场';c2.textAlign='left';c2.fillStyle='#3d3a42';fit(stageName,820,72,700);c2.fillText(stageName,72,H-bar/2);
    ['立论','交锋','总结'].forEach((n,i)=>{const x=W-780+i*260,y=H-bar/2,current=s.stage===i,done=s.stages[i]&&!current;c2.beginPath();c2.arc(x,y,26,0,Math.PI*2);c2.fillStyle=current?'#c9973a':done?'rgba(78,121,161,.75)':'rgba(61,58,66,.16)';c2.fill();c2.font=`${current?700:500} 60px ${FONT}`;c2.fillStyle=current?'#3d3a42':done?'rgba(78,121,161,.9)':'rgba(61,58,66,.4)';c2.fillText(n,x+44,y+2);});
    texture.needsUpdate=true;
  };
  return {board,drawBoard:draw};
}
