/**
 * Q 版人物的骨架尺寸（全场景共用）。仍是 8 根骨头：0 脚底、1 髋、2 上半身、3 头、4 右臂、5 左臂、6 右腿、7 左腿，
 * 膝盖以下的小腿和鞋是挂在腿骨上的子网格（坐下时代码把它折回竖直）。
 *
 * 单位 T = 1/48 米，也是贴图的 1 个像素（每米 48 像素）：头 32×30×28 T，身高（不含头发）73 T ≈ 1.52 米，
 * 头 : 身 = 30 : 43 ≈ 1 : 1.43。
 *
 * 坐姿：大腿水平、下沿正好贴座面（SEAT_H 0.50），髋轴在地面上 28 T；小腿 13 T 垂下，脚底离地约 0.30，
 * 踩在椅子前横档 / 脚踏圈上（Q 版腿短，0.5 的座面脚够不着地，这是比例本身决定的，见 docs/art/03-sample-log.md）。
 */
export const T=1/48;
export const RIG={
  /** 腿：宽 8、深 8；髋轴到膝 11，膝到脚底 13（含鞋 4） */
  leg:{w:8,d:8,thigh:11,shin:13,shoe:4,x:4.5},
  /** 躯干：宽 18、高 19、深 10，从髋（24）到肩线（43） */
  torso:{w:18,h:19,d:10},
  /** 胳膊：7×18×7，肩轴在躯干顶下 2 T，x=±12.5 */
  arm:{w:7,h:18,d:7,x:12.5,drop:2},
  /** 头：32 宽、30 高、28 深，颈轴在躯干顶 */
  head:{w:32,h:30,d:28},
  /** 脸上眼睛中心离头底 14 T */
  eyeY:14,
};
export const HIP_Y=RIG.leg.thigh+RIG.leg.shin;            // 24
export const NECK_Y=HIP_Y+RIG.torso.h;                   // 43
export const HEAD_TOP=NECK_Y+RIG.head.h;                 // 73
/** 统一座面高（地面以上，米）。所有新椅子的座面顶都在这里。 */
export const SEAT_H=.5;
/** 坐下时根点比座位锚点（座面顶）低多少：髋轴要在座面上方半个腿厚，根点 = 锚点 - (髋高 - 半腿厚)。20 T ≈ 0.4167 */
export const SIT_DROP=(HIP_Y-RIG.leg.d/2)*T;
/** 站立眼高（脚底以上）：57 T ≈ 1.1875 */
export const EYE_STAND=(NECK_Y+RIG.eyeY)*T;
/** 坐姿眼高（座位锚点以上）：37 T ≈ 0.771 */
export const EYE_SIT=EYE_STAND-SIT_DROP;
/** 手里拿东西 / 碰道具的那一点（胳膊骨骼空间，肩轴往下到手心）：-16 T */
export const HAND_REACH=-(RIG.arm.h-RIG.arm.drop)*T;
