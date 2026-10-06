import * as THREE from 'three';

function texture(canvas:HTMLCanvasElement,name:string){
  const t=new THREE.CanvasTexture(canvas);t.name=name;t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;
}
/** 家具的细木纹以白色为底，颜色仍由材质决定，纹路只轻微改变反光和凹凸。 */
export function woodGrain(){
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;const c=cv.getContext('2d')!;
  c.fillStyle='#fff7e6';c.fillRect(0,0,512,128);c.lineWidth=.75;
  for(let y=3;y<128;y+=5){c.strokeStyle=`rgba(75,51,29,${.035+(y%11)/170})`;c.beginPath();
    for(let x=0;x<=512;x+=8){const v=y+Math.sin(x/69+y*.3)*1.4+Math.sin(x/151+y)*1.1;x?c.lineTo(x,v):c.moveTo(x,v);}c.stroke();}
  return texture(cv,'subtle-wood-grain');
}
export function clothWeave(){
  const cv=document.createElement('canvas');cv.width=cv.height=64;const c=cv.getContext('2d')!;
  c.fillStyle='#ffffff';c.fillRect(0,0,64,64);c.strokeStyle='rgba(68,61,53,.07)';c.lineWidth=.7;
  for(let i=0;i<64;i+=4){c.beginPath();c.moveTo(i,0);c.lineTo(i,64);c.moveTo(0,i);c.lineTo(64,i);c.stroke();}
  const t=texture(cv,'matte-cloth-weave');t.repeat.set(3,3);return t;
}
/** 一整间房间共用一张图：宽板、长接缝、错开端头，不重复小方格贴图。 */
export function wideFloor(width:number,depth:number){
  const cv=document.createElement('canvas');cv.width=cv.height=1024;const c=cv.getContext('2d')!;
  const sx=cv.width/width,sz=cv.height/depth,boardWidth=.85,colors=['#a77f51','#aa8257','#a37b50','#ad865a'];
  for(let col=0;col*boardWidth<width;col++){
    let z=-(col%3)*1.45,row=0;
    while(z<depth){const length=3.8+((col*7+row*3)%5)*.35,x=col*boardWidth*sx,y=z*sz,w=boardWidth*sx,h=length*sz;
      c.fillStyle=colors[(col+row)%colors.length];c.fillRect(x,y,w,h);
      c.strokeStyle='rgba(76,50,28,.23)';c.lineWidth=.9;c.strokeRect(x+.6,y+.6,w-1.2,h-1.2);
      for(let k=1;k<8;k++){c.strokeStyle=`rgba(71,45,25,${.022+k%3*.009})`;c.beginPath();
        for(let p=0;p<=h;p+=14){const xx=x+w*k/8+Math.sin(p/57+col+row)*1.6;p?c.lineTo(xx,y+p):c.moveTo(xx,y+p);}c.stroke();}
      z+=length;row++;
    }
  }
  const t=texture(cv,'wide-warm-floor');t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;return t;
}
