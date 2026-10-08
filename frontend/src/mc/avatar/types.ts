/** Q 版人物的造型配置：每个人一份静态数据（looks.ts），零件按名字从零件库里取，没有随机。 */
import type {BodyType,HeadShape,SitStyle} from './body';
export type {BodyType,HeadShape,SitStyle};
export type HairStyle='tidy'|'spiky'|'curly'|'bob'|'sweep'|'curtain'|'lowtail'|'wavy'|'ponytail'|'twintails'|'topknot'|'odango'|'crew'|'quiff'|'flame'|'shaggy'|'hime'|'braid'|'sidetail';
export type EyeType='round'|'sharp'|'droopy'|'sleepy'|'sparkle'|'narrow';
export type BrowType='soft'|'straight'|'thick'|'arched'|'worried'|'sharp';
export type MouthType='smile'|'flat'|'cat'|'smirk'|'grin'|'small';
export type Expression='neutral'|'happy'|'surprised'|'thinking'|'angry'|'shy';
export type TopKind='tee'|'shirt'|'sweater'|'hoodie'|'turtleneck'|'blouse'|'polo';
export type OuterKind='cardigan'|'blazer'|'jacket'|'coat'|'vest'|'zip'|'varsity'|'apron'|'overalls';
export type BottomKind='pants'|'jeans'|'shorts'|'skirt'|'cargo';
export type ShoeKind='sneakers'|'boots'|'loafers'|'slippers';
export type AccKind='glasses'|'roundGlasses'|'headphones'|'neckphones'|'headset'|'beanie'|'cap'|'beret'|'hood'|'scarf'|'tie'|'bowtie'|'ribbon'|'clip'|'bow'|'pen'|'beard'|'watch'|'ahoge'|'earring'
  |'goggles'|'monocle'|'shawl'|'necklace'|'shoulderBag'|'waistBag'|'backpack'|'charm'|'pin'|'tool'|'headband'|'flower';
/** 小标志（胸针 / 挂件 / 项链坠 / 手里的工具）的图案：跟人物身份走，同一个人在哪个场景都是这一个 */
export type Emblem='heart'|'leaf'|'star'|'gear'|'puzzle'|'coin'|'clock'|'shield'|'megaphone'|'mask'|'bug'|'cup'|'note'|'palette'|'exclaim'|'therefore'|'mic'|'rice'|'ruler'|'block'|'flame'
  |'bear'|'cassette'|'controller'|'firecracker'|'whistle'|'magnifier'|'wrench'|'brush'|'scroll'|'extinguisher'|'sigma'|'cross';
export type Pattern='plain'|'stripe'|'plaid'|'knit';
export type FaceMark='blush'|'freckles'|'sweat'|'mole';
/** 字段来源：config = 人物设定文件里本来就有（visual 或明确的身份描写）；inferred = 按设定推断出来的造型；request = 按用户的统一要求调整（比如多种族肤色） */
export type Basis='config'|'inferred'|'request';
export interface Accessory {kind:AccKind;color?:string;side?:-1|1;shape?:Emblem}
export interface Look {
  id:string;name:string;
  skin:string;
  /** 体型、头型、坐姿（body.ts）：轮廓先于贴图 */
  body:{type:BodyType;head?:HeadShape;sit:SitStyle};
  /** streak：挑染的颜色（两三缕） */
  hair:{style:HairStyle;color:string;tie?:string;tuck?:boolean;streak?:string};
  face:{eyes:EyeType;iris:string;brows:BrowType;mouth:MouthType;marks?:FaceMark[]};
  top:{kind:TopKind;color:string;trim?:string;pattern?:Pattern;sleeve?:'long'|'short'|'rolled'};
  outer?:{kind:OuterKind;color:string;trim?:string};
  bottom:{kind:BottomKind;color:string;socks?:string};
  shoes:{kind:ShoeKind;color:string};
  acc:Accessory[];
  /** 表情和姿态倾向：默认神态、手势幅度倍数、坐姿前倾（正）/后靠（负）、歪头 */
  tendency:{expression:Expression;gesture:number;lean:number;tilt:number};
  /** 每个字段的来源，写进 docs/art/02-character-looks.md */
  basis:Partial<Record<'skin'|'body'|'hairColor'|'hairStyle'|'eyes'|'top'|'outer'|'bottom'|'shoes'|'acc'|'palette'|'tendency',Basis>>;
  /** 设定 → 气质 → 特征 → 发型 → 服装 → 配色 → 表情姿态 的推导，一两句话 */
  why:string;
}
