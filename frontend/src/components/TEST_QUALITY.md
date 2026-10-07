# SceneStage3D 质量系统测试指南

## 快速测试

### 1. 启动开发服务器
```bash
npm run dev
```

### 2. 测试质量档位切换

打开浏览器开发者工具，在 Console 中执行：

```javascript
// 检查当前质量设置
const canvas = document.querySelector('[data-stage-render]');
const info = JSON.parse(canvas.getAttribute('data-stage-render'));
console.log('当前质量:', info);

// 应该看到:
// {
//   quality: 'high',        // 质量档位
//   gtao: true,            // 环境光遮蔽
//   bloom: true,           // 泛光
//   dof: true,             // 景深
//   taa: true,             // 抗锯齿
//   scene: 'scene-id',
//   shadow: 4096,          // 阴影分辨率
//   anisotropy: 16,        // 各向异性过滤
//   pixelRatio: 2.5,       // 像素比率
//   width: ...,            // 渲染宽度
//   height: ...            // 渲染高度
// }
```

### 3. 通过UI切换质量

在页面右上角找到 "画质" 下拉菜单：
- 超高 (4K)
- 高 (2K)
- 中 (1080p)
- 低 (720p)

切换后检查渲染信息的变化。

### 4. 验证视觉效果

#### Ultra (超高) - 最接近专业渲染
- 画面非常清晰，边缘锐利
- 阴影细节丰富，无锯齿
- 纹理细节明显（地板、墙面）
- 环境光遮蔽增强立体感
- 泛光效果柔和自然
- 景深突出主体

#### High (高) - 推荐质量
- 画面清晰，细节保留
- 阴影质量高
- 纹理清晰
- 后处理效果完整

#### Medium (中) - 平衡性能
- 画面清晰度略降
- 阴影分辨率中等
- 无环境光遮蔽（场景略平）
- 无景深效果

#### Low (低) - 最高性能
- 画面清晰度较低
- 阴影分辨率低
- 无后处理效果
- 适合低端设备

## 性能测试

### 1. 帧率监控

```javascript
// 在控制台运行
let fps = 0;
let lastTime = performance.now();
function measureFPS() {
  const now = performance.now();
  fps = 1000 / (now - lastTime);
  lastTime = now;
  console.log('FPS:', fps.toFixed(1));
  requestAnimationFrame(measureFPS);
}
measureFPS();
```

### 2. 显存占用

打开 Chrome DevTools -> Performance Monitor:
- GPU memory: 显存占用
- Frames: 帧率

预期显存占用：
- Ultra: ~400-600 MB
- High: ~250-350 MB
- Medium: ~150-200 MB
- Low: ~80-120 MB

### 3. 渲染时间

```javascript
// 在控制台运行
const canvas = document.querySelector('canvas[data-stage-render]');
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name === 'render') {
      console.log('渲染时间:', entry.duration.toFixed(2), 'ms');
    }
  }
});
observer.observe({ entryTypes: ['measure'] });
```

## 对比测试

### 切换质量前后对比

1. **分辨率对比**
   - Low: ~1280x720 内部分辨率
   - Medium: ~1920x1080 内部分辨率
   - High: ~2560x1440 内部分辨率
   - Ultra: ~3840x2160 内部分辨率

2. **阴影对比**
   - Low: 1024x1024 (模糊、有锯齿)
   - Medium: 2048x2048 (中等)
   - High: 4096x4096 (清晰)
   - Ultra: 8192x8192 (非常清晰)

3. **纹理对比**
   - Low: 4x 各向异性 (近处模糊)
   - Medium: 8x 各向异性 (中等)
   - High: 16x 各向异性 (清晰)
   - Ultra: 16x 各向异性 (最清晰)

## 视觉检查清单

### 必查项目

- [ ] **边缘清晰度**: 物体轮廓是否锐利
- [ ] **阴影质量**: 阴影边缘是否平滑
- [ ] **纹理细节**: 地板/墙面纹理是否清晰
- [ ] **环境光遮蔽**: 转角处是否有深色阴影增强立体感
- [ ] **泛光效果**: 明亮区域是否有柔和光晕
- [ ] **景深效果**: 远处是否略微模糊
- [ ] **抗锯齿**: 是否有明显的锯齿

### 对比方法

1. 将质量设置为 Low
2. 截图保存
3. 将质量设置为 Ultra
4. 截图保存
5. 对比两张截图

预期看到明显差异：
- Ultra 明显更清晰
- Ultra 阴影更柔和
- Ultra 场景立体感更强
- Ultra 纹理细节更丰富

## 兼容性测试

### 桌面浏览器
- [ ] Chrome/Edge (推荐)
- [ ] Firefox
- [ ] Safari

### 移动设备
- [ ] iOS Safari
- [ ] Android Chrome

### 预期表现
- 桌面: Ultra/High 流畅运行 (>55 FPS)
- 高端移动: High/Medium 流畅运行 (>50 FPS)
- 低端移动: Medium/Low 流畅运行 (>45 FPS)

## 常见问题

### Q: 切换质量后没有变化？
A: 刷新页面，或检查浏览器是否支持 WebGL 2.0

### Q: Ultra 质量帧率太低？
A: 降低到 High 或 Medium，Ultra 适合高端显卡

### Q: 阴影有锯齿？
A: 提高质量档位，或等待阴影贴图更新（切换视角后）

### Q: 纹理模糊？
A: 提高质量档位以增加各向异性过滤

## 自动化测试

```javascript
// 自动测试所有质量档位
const qualities = ['ultra', 'high', 'medium', 'low'];
let currentIndex = 0;

async function testAllQualities() {
  for (const quality of qualities) {
    console.log(`\n=== 测试质量: ${quality} ===`);
    
    // 切换质量
    const select = document.querySelector('select[aria-label="舞台画质"]');
    select.value = quality;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    
    // 等待渲染稳定
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 读取渲染信息
    const canvas = document.querySelector('[data-stage-render]');
    const info = JSON.parse(canvas.getAttribute('data-stage-render'));
    
    console.log('质量档位:', info.quality);
    console.log('分辨率:', info.width, 'x', info.height);
    console.log('像素比率:', info.pixelRatio);
    console.log('阴影分辨率:', info.shadow);
    console.log('各向异性:', info.anisotropy);
    console.log('GTAO:', info.gtao);
    console.log('Bloom:', info.bloom);
    console.log('DOF:', info.dof);
    console.log('TAA:', info.taa);
  }
  
  console.log('\n✓ 所有质量档位测试完成');
}

// 运行测试
testAllQualities();
```

## 预期结果

所有质量档位应该：
1. 正常渲染，无崩溃
2. 显示正确的质量信息
3. 性能符合预期
4. 视觉效果符合档位描述
5. 设置保存到 localStorage

从 480p 到 2K/4K 的提升应该是**显著且立即可见**的。
