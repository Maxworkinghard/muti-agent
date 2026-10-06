import * as THREE from 'three';
import type {Room} from '../rooms/debate';
import type {PropMaterials} from './materials';
import {mesh,rbox,textCanvas,FONT,type Keep} from './geometry';
import type {PropState} from './debateProps';
/**
 * 北墙电子辩题屏：细金属框、浅色信息区与深色标题栏，辩题与双方成员清楚可读。
 * 画布比例与实体屏幕一致，文字不再横向拉伸；屏幕只轻微自发光，控制白色高光。
 * 辩题、双方成员、阶段条和结束状态画在这张画布上，换轮和结束时重画。
 */
export function createBoard(layout:Room['layout'],m:PropMaterials,keep:Keep){
  const sc=layout.board,canvas=document.createElement('canvas');canvas.width=2080;canvas.height=Math.round(canvas.width*sc.height/sc.width);const c2=canvas.getContext('2d')!;
  const texture=keep(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  const board=new THREE.Group();board.position.set(...sc.position);
  board.add(mesh(rbox(sc.width+.08,sc.height+.08,.08,.006),m.woodDark,0,0,0));
  board.add(mesh(new THREE.PlaneGeometry(sc.width,sc.height),keep(new THREE.MeshStandardMaterial({map:texture,roughness:.72,emissive:'#ffffff',emissiveMap:texture,emissiveIntensity:.1})),0,0,.041,false));
  let key='';
  const fit=(text:string,max:number,size:number,weight=700,min=30)=>{let n=size;c2.font=`${weight} ${n}px ${FONT}`;while(n>min&&c2.measureText(text).width>max){n-=2;c2.font=`${weight} ${n}px ${FONT}`;}return n;};
  const draw=(s:PropState)=>{
    const next=JSON.stringify([s.theme,s.stages,s.stage,s.label,s.round,s.proNames,s.conNames,s.finished]);if(next===key)return;key=next;
    const W=canvas.width,H=canvas.height,bar=90,header=116;c2.fillStyle='#e7eef3';c2.fillRect(0,0,W,H);
    c2.fillStyle='#273d4c';c2.fillRect(0,0,W,header);
    c2.textAlign='center';c2.textBaseline='middle';c2.fillStyle='#edf4f8';
    const title='辩题：'+(s.theme||'待定');
    c2.font=`700 104px ${FONT}`;
    if(c2.measureText(title).width<=W-160){fit(title,W-160,104);c2.fillText(title,W/2,header/2);}
    else{const chars=Array.from(title),cut=Math.ceil(chars.length/2),lines=[chars.slice(0,cut).join(''),chars.slice(cut).join('')];const size=Math.min(...lines.map(l=>fit(l,W-160,48)));c2.font=`700 ${size}px ${FONT}`;lines.forEach((l,i)=>c2.fillText(l,W/2,header/2+(i-.5)*(size+6)));}
    const contentHeight=H-bar-header,mid=header+contentHeight/2;
    for(const [side,x,color,names] of [['正方',W/4,'#3f78b6',s.proNames],['反方',W*3/4,'#b95b63',s.conNames]] as const){c2.fillStyle=color;c2.font=`700 86px ${FONT}`;c2.fillText(side,x,mid-contentHeight*.27);c2.fillRect(x-90,mid-5,180,5);c2.fillStyle='#263947';const line=names.length?names.join(' · '):'—';fit(line,W/2-160,84,600);c2.fillText(line,x,mid+contentHeight*.24);}
    c2.fillStyle='#c7d3dc';c2.fillRect(W/2-1,header+32,2,H-bar-header-64);
    c2.fillStyle='#d3dee5';c2.fillRect(0,H-bar,W,bar);
    const stageName=s.finished?'本场辩论结束':s.round?`第 ${s.round} 轮 · ${s.label}`:'等待开场';c2.textAlign='left';c2.fillStyle='#263947';fit(stageName,880,48,700);c2.fillText(stageName,64,H-bar/2);
    ['立论','交锋','总结'].forEach((n,i)=>{const x=W-810+i*270,y=H-bar/2,current=!s.finished&&s.stage===i,done=s.stages[i]&&!current;c2.beginPath();c2.arc(x,y,20,0,Math.PI*2);c2.fillStyle=current?'#1b8c7b':done?'#3f78b6':'#a6b6c2';c2.fill();c2.font=`${current?700:500} 60px ${FONT}`;c2.fillStyle=current?'#263947':done?'#3f78b6':'#647c8f';c2.fillText(n,x+36,y+2);});
    texture.needsUpdate=true;
  };
  return {board,drawBoard:draw};
}
