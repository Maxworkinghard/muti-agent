import { useState } from 'react';
import type { StageQuality } from '../rendering/stageQuality';
import { STAGE_QUALITY } from '../rendering/stageQuality';

export interface StageControlsProps {
  mode: string;
  quality: StageQuality;
  follow?: boolean;
  locked?: boolean;
  onModeChange: (mode: string) => void;
  onQualityChange: (quality: StageQuality) => void;
  onFollowChange?: (follow: boolean) => void;
}

/**
 * 统一的3D舞台控制UI
 * 支持视角切换、质量设置、跟拍开关
 */
export function StageControls({
  mode,
  quality,
  follow = false,
  locked = false,
  onModeChange,
  onQualityChange,
  onFollowChange,
}: StageControlsProps) {
  const [showQuality, setShowQuality] = useState(false);

  return (
    <div className="stage-controls">
      {/* 视角切换按钮 */}
      <div className="stage-view-buttons">
        <button
          className={`stage-btn ${mode === 'overview' ? 'active' : ''}`}
          onClick={() => onModeChange('overview')}
          title="俯视全景 - 一眼看清整个场景"
        >
          ⊞ 俯视
        </button>
        
        <button
          className={`stage-btn ${mode === 'inside' ? 'active' : ''}`}
          onClick={() => onModeChange('inside')}
          title="室内跟拍 - 镜头跟着说话的人走"
        >
          ◉ 跟拍
        </button>
        
        <button
          className={`stage-btn ${mode === 'walk' ? 'active' : ''}`}
          onClick={() => onModeChange('walk')}
          title="第一人称行走 - WASD移动，鼠标转向（点击锁定）"
        >
          ⚲ 行走
        </button>
        
        <button
          className={`stage-btn ${mode === 'free' ? 'active' : ''}`}
          onClick={() => onModeChange('free')}
          title="自由飞行 - WASD飞行，空格上升，Ctrl下降，Shift加速"
        >
          ✥ 飞行
        </button>
      </div>

      {/* 跟拍开关（仅在inside模式显示） */}
      {mode === 'inside' && onFollowChange && (
        <button
          className={`stage-btn follow ${follow ? 'active' : ''}`}
          onClick={() => onFollowChange(!follow)}
          title={follow ? '关闭跟拍，手动控制镜头' : '开启跟拍，自动跟随说话的人'}
        >
          {follow ? <><i className="rec">●</i> 跟拍中</> : '○ 跟拍'}
        </button>
      )}

      {/* 锁定状态提示（walk/free模式） */}
      {(mode === 'walk' || mode === 'free') && locked && (
        <span className="stage-locked-hint">
          🔒 已锁定 | Esc退出
        </span>
      )}

      {/* 质量设置 */}
      <div className="stage-quality-control">
        <button
          className="stage-btn quality"
          onClick={() => setShowQuality(!showQuality)}
          title="调整渲染质量"
        >
          ⚙ {STAGE_QUALITY[quality].label}
        </button>
        
        {showQuality && (
          <div className="stage-quality-menu">
            {(['ultra', 'high', 'medium', 'low'] as const).map((q) => (
              <button
                key={q}
                className={`quality-option ${quality === q ? 'active' : ''}`}
                onClick={() => {
                  onQualityChange(q);
                  setShowQuality(false);
                }}
              >
                {STAGE_QUALITY[q].label}
                <small>
                  {q === 'ultra' && '8K阴影 | GTAO | 景深 | 泛光'}
                  {q === 'high' && '4K阴影 | GTAO | 景深 | 泛光'}
                  {q === 'medium' && '2K阴影 | 泛光'}
                  {q === 'low' && '最低配置'}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
