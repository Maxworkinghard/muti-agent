# 当前前端文档

运行与模块说明见 [frontend/README.md](../README.md)，调用关系见根目录 [ARCHITECTURE.md](../../ARCHITECTURE.md)。当前文档与历史快照分开存放。

| 需要的信息 | 入口 |
|---|---|
| 当前人物体型、头型、配饰及来源标记 | [character-looks.md](character-looks.md)，由 `scripts/gen-looks-doc.mjs` 生成 |
| 实验页地址、构建范围和脚本 | [前端维护](../README.md#页面边界) |
| 当前引擎与互动契约 | [引擎索引](../src/engines/README.md)及各模式 README |
| 历史设计、交接与素材取舍 | [archive/README.md](archive/README.md) |
| 清理记录、未决项与恢复点 | [维护审计](../../docs/MAINTENANCE_AUDIT.md) |

3D 仅保留正在重建的圆桌 v2，工作台和两个场景实验页使用同一份实现；旧房间及旧版回退已移除。圆桌仍是未完成、未验收的样板，六个 2D 场景和四种讨论业务保留。共享 Q 版人物已接入，但接入不代表视觉验收通过。

维护顺序采用根目录 [AGENTS](../../AGENTS.md) → [STANDARDS](../../STANDARDS.md) → [ARCHITECTURE](../../ARCHITECTURE.md) → 对应模块 README，交付前核对 [VERIFY](../../VERIFY.md)。历史资料不再与当前说明并列充当入口。
