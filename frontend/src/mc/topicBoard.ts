import * as THREE from 'three';
import type {DiscussionResult} from '../types';
export function createTopicBoard(){
  const canvas=document.createElement('canvas');canvas.width=896;canvas.height=256;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
  const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(7,2),new THREE.MeshBasicMaterial({map:texture}));
  function draw(theme:string,result:DiscussionResult|null){c.fillStyle='#F7E9A3';c.fillRect(0,0,896,256);c.strokeStyle='#8F7748';c.lineWidth=2;c.strokeRect(1,1,894,254);c.textAlign='center';c.textBaseline='middle';c.fillStyle='#664C33';
    const title=result?.verdict?`正方 ${result.verdict.proScore??'—'} : ${result.verdict.conScore??'—'} 反方`:theme;
    c.font=`${Array.from(title).length<=24?32:16}px MCFont`;
    const chars=Array.from(title);const lines=[chars.slice(0,Array.from(title).length<=24?24:48).join(''),chars.slice(Array.from(title).length<=24?24:48).join('')];c.fillText(lines[0],448,80);if(lines[1])c.fillText(lines[1],448,125);
    if(result?.verdict){c.font='16px MCFont';c.fillText(theme,448,140);}
    c.font='24px MCFont';c.textAlign='left';c.fillStyle='#334CB2';c.fillText('正方',32,220);c.textAlign='right';c.fillStyle='#993333';c.fillText('反方',864,220);texture.needsUpdate=true;
  }
  return {mesh,draw,dispose(){texture.dispose();mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();}};
}
