import * as THREE from 'three';
import type {Room} from '../rooms/types';
/** 圆桌样板的物品近景。 */
export function inspectionCamera(kind:string,room:Room,index:number){
    const a=room.anchors[index]??room.anchors[0],t=[...room.layout.tables].sort((x,y)=>Math.hypot(x.center[0]-a.seat[0],x.center[2]-a.seat[2])-Math.hypot(y.center[0]-a.seat[0],y.center[2]-a.seat[2]))[0];
    let target=new THREE.Vector3(a.seat[0],1.9,a.seat[2]),position=target.clone().add(new THREE.Vector3(2,1.2,2.5)),fov=48;
    if(kind==='table'&&t){target.set(t.center[0],t.center[1]+t.height,t.center[2]);position=target.clone().add(new THREE.Vector3(2.5,2.2,3.5));}
    if(kind==='chair'){target.set(a.seat[0],1.7,a.seat[2]);position=target.clone().add(new THREE.Vector3(1.7,1,1.7));}
    if(kind==='board'){target.set(...room.layout.board.position);position=target.clone().add(new THREE.Vector3(0,0,room.layout.board.width*1.15));}
    return {pos:position.toArray() as [number,number,number],target:target.toArray() as [number,number,number],fov};
}
