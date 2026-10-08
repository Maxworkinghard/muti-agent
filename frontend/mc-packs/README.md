# 叠加材质包

这个文件夹里的 zip 会在导入游戏资源时，叠加在原版方块上面：

```bash
npm run mc:import                    # 完整导入（声音、字体、高清包等都会重做）
node scripts/mc-import.mjs --blocks-only   # 只重做方块状态、模型和方块图集
```

导入脚本按文件名顺序读取这里的每个 zip，只取原版方块用得到的部分（`minecraft` 命名空间的方块状态和贴图，
以及 `minecraft` 和材质包自己命名空间的方块模型），结果写进 `public/mc/blocks.json`、`public/mc/atlas.png`，
并把用到的材质包名记在 `public/mc/manifest.json` 的 `overlays` 里；舞台左下角的署名会带上它的名字。
另外也可以用环境变量 `MC_OVERLAY` 再指定别处的 zip（逗号分隔）。

| 文件 | 内容 | 来源 | 授权 |
| --- | --- | --- | --- |
| `Better-Leaves-9.6.zip` | Motschen's Better Leaves 9.6：蓬松的三维树叶模型 | https://modrinth.com/resourcepack/better-leaves （源码 https://github.com/TeamMidnightDust/BetterLeavesLite ） | MIT，全文见 `public/mc/THIRD-PARTY.md` |

放进新的材质包之前先看它的授权：要能再分发（MIT、CC BY 这类），并按要求署名；
写着 All Rights Reserved 的（比如 Bare Bones、Dramatic Skys、BSL）不能放进来。
