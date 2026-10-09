import * as THREE from 'three';
import type {TaskEvent} from '../../types';
export interface PropCast {id:string;anchor:number;side:'pro'|'con'|'host';name:string;identity:string}
export interface PropState {now:number;mics:Record<string,boolean>;stages:boolean[];stage:number;bellAt:number;pageAt:number;buttonAt:number;/** 每个座位（按 anchor 序号）此刻坐着的程度，1 是坐稳 */sit:Record<number,number>;theme:string;label:string;round:number;total:number;proNames:string[];conNames:string[];finished:boolean;reduced:boolean}
export interface Fixture {id:string;actor:number;mount:THREE.Vector3;target:THREE.Vector3;on:boolean;since:number;level:number}
export interface PropContacts {mics:Map<string,THREE.Object3D>;nextRound:THREE.Object3D;bell:THREE.Object3D;script:THREE.Object3D}
export interface PropState {tasks?:TaskEvent[]}
export interface AtlasLike {width:number;height:number;textures:Record<string,{x:number;y:number;width:number;height:number}>}
export interface StageProps {contacts:PropContacts;root:THREE.Group;fixtures:Fixture[];beamScale:number;update(s:PropState):void;setEnvironment(map:THREE.Texture|null,intensity?:number):void;setReflections(enabled:boolean):void;createBook(assets?:{itemAtlas:AtlasLike;itemTexture:THREE.Texture}):THREE.Group;dispose():void}
