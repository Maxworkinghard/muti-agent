import * as THREE from 'three';
import type {Room} from '../rooms/debate';
import type {PropMaterials} from './materials';
import {mesh,rbox,FONT,type Keep} from './geometry';
import type {PropState} from './debateProps';
/**
 * 辩题木牌：蜜木框 + 奶油板面，高饱和队色标题；轻量像素招牌，不做巨大冷白议题展板。
 */
export function createBoard(layout:Room['layout'],m:PropMaterials,keep:Keep){
  const sc=layout.board,canvas=document.createElement('canvas');canvas.width=1600;canvas.height=Math.round(canvas.width*sc.height/sc.width);const c2=canvas.getContext('2d')!;
  const texture=keep(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.anisotropy=4;
  const board=new THREE.Group();board.position.set(...sc.position);
  board.add(mesh(rbox(sc.width+.2,sc.height+.2,.1,.012),m.woodDark,0,0,0));
  board.add(mesh(rbox(sc.width+.06,sc.height+.06,.06,.008),m.brass,0,0,.02));
  // 铜框正面在 z=0.05。板面必须露在它前面，否则全景只能看见一块黄铜。
  board.add(mesh(new THREE.PlaneGeometry(sc.width,sc.height),keep(new THREE.MeshStandardMaterial({map:texture,roughness:.88,emissive:'#fff8ea',emissiveMap:texture,emissiveIntensity:.06})),0,0,.062,false));
  let key='';
  const fit=(text:string,max:number,size:number,weight=700,min=26)=>{let n=size;c2.font=`${weight} ${n}px ${FONT}`;while(n>min&&c2.measureText(text).width>max){n-=2;c2.font=`${weight} ${n}px ${FONT}`;}return n;};
  const draw=(s:PropState)=>{
    const next=JSON.stringify([s.theme,s.stages,s.stage,s.label,s.round,s.proNames,s.conNames,s.finished]);if(next===key)return;key=next;
    const W=canvas.width,H=canvas.height,bar=Math.round(H*.16),header=Math.round(H*.22);
    c2.fillStyle='#fff8ea';c2.fillRect(0,0,W,H);
    c2.fillStyle='#d4a86a';c2.fillRect(0,0,W,header);
    c2.fillStyle='#f0c84a';c2.fillRect(0,header,W,6);
    c2.textAlign='center';c2.textBaseline='middle';c2.fillStyle='#2b2136';
    const title='辩题：'+(s.theme||'待定');
    c2.font=`700 72px ${FONT}`;
    if(c2.measureText(title).width<=W-120){fit(title,W-120,72);c2.fillText(title,W/2,header/2);}
    else{const chars=Array.from(title),cut=Math.ceil(chars.length/2),lines=[chars.slice(0,cut).join(''),chars.slice(cut).join('')];const size=Math.min(...lines.map(l=>fit(l,W-120,40)));c2.font=`700 ${size}px ${FONT}`;lines.forEach((l,i)=>c2.fillText(l,W/2,header/2+(i-.5)*(size+6)));}
    const contentHeight=H-bar-header,mid=header+contentHeight/2;
    for(const [side,x,color,names] of [['正方',W/4,'#3d8bff',s.proNames],['反方',W*3/4,'#ff4d9a',s.conNames]] as const){
      c2.fillStyle=color;c2.font=`700 64px ${FONT}`;c2.fillText(side,x,mid-contentHeight*.27);c2.fillRect(x-70,mid-4,140,5);
      c2.fillStyle='#2b2136';const line=names.length?names.join(' · '):'—';fit(line,W/2-120,56,600);c2.fillText(line,x,mid+contentHeight*.24);
    }
    c2.fillStyle='#ebcc9e';c2.fillRect(W/2-1,header+24,2,H-bar-header-48);
    c2.fillStyle='#F0E6D2';c2.fillRect(0,H-bar,W,bar);
    const stageName=s.finished?'本场辩论结束':s.round?`第 ${s.round} 轮 · ${s.label}`:'等待开场';
    c2.textAlign='left';c2.fillStyle='#2b2136';fit(stageName,720,36,700);c2.fillText(stageName,48,H-bar/2);
    ['立论','交锋','总结'].forEach((n,i)=>{const x=W-620+i*200,y=H-bar/2,current=!s.finished&&s.stage===i,done=s.stages[i]&&!current;
      c2.beginPath();c2.arc(x,y,16,0,Math.PI*2);c2.fillStyle=current?'#f0c84a':done?'#3d8bff':'#c9b8a0';c2.fill();
      c2.font=`${current?700:500} 40px ${FONT}`;c2.fillStyle='#2b2136';c2.fillText(n,x+28,y+2);});
    texture.needsUpdate=true;
  };
  return {board,drawBoard:draw};
}
