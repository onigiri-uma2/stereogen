import React from 'react';
import { Settings } from 'lucide-react';
import Tooltip from '../Tooltip';

/**
 * 視点合わせの方式（平行法・交差法）を選択するコンポーネント
 * 
 * ステレオグラムの生成時に視差を「引く（平行法）」か「足す（交差法）」かを切り替えることで、
 * 視点合わせの得意・不得意に合わせて立体の浮き出し方を調整します。
 */
export default function ViewSettings({ method, setMethod }) {
  return (
    <div className="control-group">
      <h3>
        <Tooltip content="視点合わせに合わせた表示方式を選択します" showIcon={true}>
          <Settings size={18} /> 視点合わせの方式
        </Tooltip>
      </h3>
      <div className="radio-group">
        <Tooltip content="遠くを見るように焦点を合わせる方法。より深く、自然な立体に見えます。" showIcon={true}>
          <label className={method === 'parallel' ? 'active' : ''}>
            <input 
              type="radio" 
              value="parallel" 
              checked={method === 'parallel'} 
              onChange={() => setMethod('parallel')} 
            />
            平行法 (Parallel-view)
          </label>
        </Tooltip>
        <Tooltip content="寄り目気味に焦点を合わせる方法。平行法が苦手な方でも合わせやすいです。" showIcon={true}>
          <label className={method === 'crosseye' ? 'active' : ''}>
            <input 
              type="radio" 
              value="crosseye" 
              checked={method === 'crosseye'} 
              onChange={() => setMethod('crosseye')} 
            />
            交差法 (Cross-view)
          </label>
        </Tooltip>
      </div>
    </div>
  );
}
