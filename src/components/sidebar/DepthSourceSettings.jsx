import React from 'react';
import { Activity, Upload, AlertCircle, Loader2, Wand2, X, Sliders, Play, Square } from 'lucide-react';
import Tooltip from '../Tooltip';
import FontSelect from './FontSelect';

export default function DepthSourceSettings({
  depthMode, setDepthMode,
  defaultShape, setDefaultShape,
  animatedShape, setAnimatedShape,
  depthText, setDepthText,
  textFontSize, setTextFontSize,
  textFontFamily, setTextFontFamily,
  textScrollSpeed, setTextScrollSpeed,
  textDepth, setTextDepth,
  textSoftness, setTextSoftness,
  handleDepthUpload,
  handleAiUpload,
  aiStatus, aiProgress, aiDownloadPercent, aiModelInfo, cancelAiProcessing,
  depthLayers, setDepthLayers,
  depthContrast, setDepthContrast,
  hasAiRawData,
  isPlaying, setIsPlaying,
  wiggleEnabled, setWiggleEnabled,
  depthSourceType
}) {
  return (
    <div className="control-group">
      <h3>
        <Tooltip content="立体の形を決定する深度マップを指定します。" showIcon={true}>
          <Activity size={18} /> 立体の形状データ
        </Tooltip>
      </h3>
      <div className="upload-btn-wrapper mb-2" style={{ marginBottom: '12px' }}>
        <select value={depthMode} onChange={(e) => setDepthMode(e.target.value)}>
          <option value="default">静止画プリセット</option>
          <option value="animated">アニメーション形状</option>
          <option value="text">3Dテキスト入力</option>
          <option value="upload">画像・動画を読み込む</option>
          <option value="ai">AI画像解析 (2D→3D生成)</option>
        </select>
      </div>

      {(depthMode === 'default') && (
        <div className="mt-2" style={{ marginBottom: '12px' }}>
          <label>プリセット形状
            <select value={defaultShape} onChange={e => setDefaultShape(e.target.value)}>
              <option value="torus">ドーナツ型 (Torus)</option>
              <option value="sphere">球体 (Sphere)</option>
              <option value="ripple">水面の波紋 (Ripple)</option>
              <option value="heart">ハート (Heart)</option>
              <option value="star">星型 (Star)</option>
              <option value="stairs">螺旋階段 (Stairs)</option>
              <option value="pyramid">ピラミッド (Pyramid)</option>
            </select>
          </label>
        </div>
      )}
      {depthMode === 'animated' && (
        <div className="mt-2" style={{ marginBottom: '12px' }}>
          <label>アニメーションの種類
            <select value={animatedShape} onChange={e => setAnimatedShape(e.target.value)}>
              <option value="pulse">脈動する球体</option>
              <option value="orbit">回転する球体</option>
              <option value="waves">流れる波</option>
              <option value="rings">広がるリング</option>
              <option value="spin-star">回転する星</option>
            </select>
          </label>
        </div>
      )}
      {depthMode === 'text' && (
        <div className="mt-2" style={{ marginBottom: '12px', background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
          <label className="mb-2">テキストを入力
            <textarea
              value={depthText}
              onChange={e => setDepthText(e.target.value)}
              placeholder="文字を入力..."
              className="mt-1 depth-text-area"
              rows={3}
            />
          </label>
          <label>サイズ ({textFontSize}px)
            <input type="range" min="20" max="1000" value={textFontSize} onChange={e => setTextFontSize(Number(e.target.value))} />
          </label>
          <label>スクロール速度 ({textScrollSpeed})
            <input type="range" min="0" max="20" step="0.5" value={textScrollSpeed} onChange={e => setTextScrollSpeed(Number(e.target.value))} />
          </label>
          <Tooltip content="テキストの飛び出し量。明るくするほど手前に見えます。">
            <label>浮き出しの強さ ({textDepth})
              <input type="range" min="50" max="255" value={textDepth} onChange={e => setTextDepth(Number(e.target.value))} />
            </label>
          </Tooltip>
          <Tooltip content="縁をぼかすことで立体に丸みを与えます。ステレオグラムが格段に見やすくなります。">
            <label>輪郭の柔らかさ ({textSoftness})
              <input type="range" min="0" max="15" step="0.5" value={textSoftness} onChange={e => setTextSoftness(Number(e.target.value))} />
            </label>
          </Tooltip>
          <label className="mt-2" style={{ display: 'block' }}>フォント
            <FontSelect value={textFontFamily} onChange={e => setTextFontFamily(e.target.value)} />
          </label>
        </div>
      )}
      {depthMode === 'upload' && (
        <div className="upload-btn-wrapper mt-2">
          <button className="btn primary block">
            <Upload size={16} /> 画像・動画ファイルを選択
          </button>
          <input type="file" accept="image/*,video/*" onChange={handleDepthUpload} />
        </div>
      )}
      {depthMode === 'ai' && (
        <div className="mt-2">
          {aiStatus === 'loading' || aiStatus === 'inferring' || aiStatus === 'error' ? (
            <div style={{
              padding: '12px',
              backgroundColor: aiStatus === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)',
              borderRadius: '8px',
              border: `1px solid ${aiStatus === 'error' ? '#ef4444' : 'var(--accent-color)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStatus === 'error' ? '#ef4444' : 'var(--accent-color)', marginBottom: '8px' }}>
                {aiStatus === 'error' ? <AlertCircle size={16} /> : <Loader2 className="spinner" size={16} />}
                <span style={{ fontSize: '12px', fontWeight: 500 }}>
                  {aiStatus === 'error' ? 'エラーが発生しました' : aiStatus === 'loading' ? 'AIモデルを読み込み中...' : '画像を深度解析中...'}
                </span>
              </div>
              {aiStatus !== 'error' && (
                <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                  <div style={{
                    width: aiStatus === 'inferring' ? '100%' : `${aiDownloadPercent}%`,
                    height: '100%',
                    backgroundImage: aiStatus === 'inferring' ? 'linear-gradient(90deg, #ec4899, #8b5cf6, #ec4899)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    backgroundSize: '200% 100%',
                    animation: aiStatus === 'inferring' ? 'shimmer 1.5s linear infinite' : 'none',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              )}
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', wordBreak: 'break-all' }}>
                {aiStatus === 'error' ? aiProgress : aiProgress.replace('ダウンロード中', '取得中').replace('ロード中', '準備中')}
              </span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                {aiStatus === 'error' ? (
                  <button className="btn primary block" onClick={() => cancelAiProcessing()} style={{ padding: '6px 12px', fontSize: '12px', background: '#444' }}>
                    閉じる
                  </button>
                ) : (
                  <button className="btn danger block" onClick={cancelAiProcessing} style={{ padding: '8px 12px', fontSize: '12px' }}>
                    <X size={14} /> 中断
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="upload-btn-wrapper">
              <button className="btn primary block" style={{ backgroundImage: 'linear-gradient(135deg, #ec4899, #8b5cf6)' }}>
                <Wand2 size={16} /> 2D画像から立体の奥行きを解析
              </button>
              <input type="file" accept="image/*" onChange={handleAiUpload} />
            </div>
          )}
          {aiModelInfo && (
            <Tooltip content={`Model: ${aiModelInfo.model}\nDevice: ${aiModelInfo.device}`}>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', marginTop: '8px' }}>
                AI Engine: {aiModelInfo.dtype}
              </div>
            </Tooltip>
          )}
        </div>
      )}
      {((depthMode === 'ai' && hasAiRawData && aiStatus === 'idle') || depthMode === 'upload') && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
            <Sliders size={14} /> 深度マップの調整フィルター
          </div>
          <Tooltip content="深度の滑らかさを調整。小さくすると段々畑のようになります。" showIcon={true}>
            <label>奥行きの階調数 ({depthLayers >= 256 ? '滑らか' : depthLayers})
              <input type="range" min="2" max="32" value={depthLayers >= 256 ? 32 : depthLayers} onChange={e => setDepthLayers(Number(e.target.value) === 32 ? 256 : Number(e.target.value))} />
            </label>
          </Tooltip>
          <Tooltip content="飛び出しすぎを抑えたり、なだらかさを強調したりします（ガンマ補正）。" showIcon={true}>
            <label>奥行きのコントラスト ({depthContrast.toFixed(1)}x)
              <input type="range" min="0.5" max="4.0" step="0.1" value={depthContrast} onChange={e => setDepthContrast(Number(e.target.value))} />
            </label>
          </Tooltip>
        </div>
      )}

      <div className="playback-controls mt-2">
        {(depthSourceType === 'video' || depthSourceType === 'animated' || depthSourceType === 'text') && (
          <button className="btn icon-btn" onClick={() => setIsPlaying(!isPlaying)} style={{ display: 'flex', gap: '8px', padding: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '8px', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
            {isPlaying ? <Square size={16} /> : <Play size={16} />}
            {isPlaying ? '一時停止' : '再生'}
          </button>
        )}
      </div>

      <Tooltip content="正面からの深度に対して『首を振る』ような視差を動的に加えてアニメーションさせます。" showIcon={true}>
        <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', cursor: 'pointer', marginTop: '12px', gap: '8px', fontSize: '14px' }}>
          <input type="checkbox" checked={wiggleEnabled} onChange={e => setWiggleEnabled(e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
          <Activity size={16} style={{ color: 'var(--accent-color)' }} />
          2.5Dゆらぎアニメーション
        </label>
      </Tooltip>
    </div>
  );
}
