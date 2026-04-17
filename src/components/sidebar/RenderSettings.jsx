import React from 'react';
import { Settings } from 'lucide-react';
import Tooltip from '../Tooltip';

export default function RenderSettings({
  outputResolution, setOutputResolution,
  separation, setSeparation,
  depthFactor, setDepthFactor,
  showGuideDots, setShowGuideDots,
  guideDotSize, setGuideDotSize
}) {
  return (
    <div className="control-group">
      <h3>
        <Tooltip content="ステレオグラムの生成パラメータを細かく調整します。" showIcon={true}>
          <Settings size={18} /> 生成パラメータの詳細
        </Tooltip>
      </h3>
      <Tooltip content="出力キャンバスの解像度。素材に合わせる(Auto)か固定サイズを選べます。" showIcon={true}>
        <label>出力解像度
          <select className="mb-2" value={outputResolution} onChange={e => setOutputResolution(e.target.value)} style={{ width: '100%', marginTop: '4px', padding: '6px', borderRadius: '4px', border: '1px solid #4b5563', background: '#374151', color: 'white' }}>
            <option value="auto">自動 (素材に合わせる)</option>
            <option value="600x400">600 × 400</option>
            <option value="800x600">800 × 600</option>
            <option value="1024x768">1024 × 768</option>
            <option value="1280x720">1280 × 720 (HD)</option>
            <option value="1920x1080">1920 × 1080 (FHD)</option>
          </select>
        </label>
      </Tooltip>
      <Tooltip content="模様が繰り返される間隔。大きくすると迫力が出ますが、見るのが難しくなります。" showIcon={true}>
        <label>基準視差 (繰り返しの幅: {separation}px)
          <input type="range" min="50" max="300" value={separation} onChange={e => setSeparation(Number(e.target.value))} />
        </label>
      </Tooltip>
      <Tooltip content="奥行きの強さ。深くしすぎると像がボケて見えなくなることがあります。" showIcon={true}>
        <label>奥行きの強調度 ({Math.round(depthFactor * 100)}%)
          <input type="range" min="0.1" max="0.5" step="0.01" value={depthFactor} onChange={e => setDepthFactor(Number(e.target.value))} />
        </label>
      </Tooltip>
      <Tooltip content="画像上部にピント合わせ用の黒い点を表示します。" showIcon={true}>
        <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', cursor: 'pointer', marginTop: '16px' }}>
          <input type="checkbox" checked={showGuideDots} onChange={e => setShowGuideDots(e.target.checked)} style={{ width: '18px', height: '18px', marginRight: '8px' }} />
          ガイドドットを表示 (● ●)
        </label>
      </Tooltip>
      {showGuideDots && (
        <label style={{ display: 'block', marginTop: '8px', paddingLeft: '26px' }}>
          ドットの大きさ ({guideDotSize}px)
          <input type="range" min="4" max="30" value={guideDotSize} onChange={e => setGuideDotSize(Number(e.target.value))} style={{ width: '100%' }} />
        </label>
      )}
    </div>
  );
}
