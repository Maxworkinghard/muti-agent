// 性能检查清单

console.log("=== 3D舞台性能检查 ===\n");

// 1. 检查SceneStage3D当前配置
console.log("SceneStage3D 当前配置:");
console.log("- 默认质量: high (2.5x DPR, 4096阴影)");
console.log("- 后处理: GTAO + Bloom + DOF + TAA");
console.log("- 问题: 对中低端设备过重\n");

// 2. 主要性能瓶颈
console.log("可能的卡顿原因:");
console.log("1. pixelRatio 2.5x 对GPU压力大");
console.log("2. GTAO环境光遮蔽很消耗性能");
console.log("3. 4096阴影贴图占用显存");
console.log("4. TAA需要多帧累积\n");

// 3. 优化建议
console.log("优化方案:");
console.log("✓ 改默认质量为 medium (2x DPR, 2048阴影)");
console.log("✓ 关闭GTAO (性能杀手)");
console.log("✓ 保留Bloom (轻量)");
console.log("✓ 用SMAA替代TAA (更快)");
console.log("✓ 添加性能监控，自动降质");
console.log("✓ 优化模型LOD\n");

console.log("=== 需要的修改 ===");
console.log("1. 改默认质量 high -> medium");
console.log("2. 优化质量预设 (减少Ultra/High的开销)");
console.log("3. 改进自动降质系统");
console.log("4. 添加FPS显示");
