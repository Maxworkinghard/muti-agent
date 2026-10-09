# 当前前端文档

运行与模块说明见 [frontend/README.md](../README.md)，调用关系见根目录 [ARCHITECTURE.md](../../ARCHITECTURE.md)。当前文档与历史快照分开存放。

| 需要的信息 | 入口 |
|---|---|
| 当前人物体型、头型、配饰及来源标记 | [character-looks.md](character-looks.md)，由 `scripts/gen-looks-doc.mjs` 生成 |
| 实验页地址、构建范围和脚本 | [前端维护](../README.md#页面边界) |
| 当前引擎与互动契约 | [引擎索引](../src/engines/README.md)及各模式 README |
| 历史设计、交接与素材取舍 | [archive/README.md](archive/README.md) |
| 清理记录、未决项与恢复点 | [维护审计](../../docs/MAINTENANCE_AUDIT.md) |

正式工作台使用旧六个 MC 房间；圆桌 v2 是实验样板。共享 Q 版人物已接入产品，但场景或人物已接入不代表视觉验收通过。

维护顺序采用根目录 [AGENTS](../../AGENTS.md) → [STANDARDS](../../STANDARDS.md) → [ARCHITECTURE](../../ARCHITECTURE.md) → 对应模块 README，交付前核对 [VERIFY](../../VERIFY.md)。历史资料不再与当前说明并列充当入口。
