import React from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import Tooltip from '../Tooltip';

/**
 * ステレオグラムの表面に描画するテクスチャ（模様）の種類や詳細を設定するコンポーネント
 * 
 * 背景の種類 (bgType) が 'text_pattern'（文字スタンプによる生成）か、
 * それ以外（1次元スライス走査によるドット/画像生成）かで、UIの項目と描画エンジン側の
 * 処理ロジックが大きく分岐します。
 */
export default function TextureSettings({
  bgType, setBgType,
  textPatternChars, setTextPatternChars,
  textPatternSize, setTextPatternSize,
  textPatternDensity, setTextPatternDensity,
  textureColor, setTextureColor,
  handlePatternUpload,
  noiseSize, setNoiseSize
}) {
  return (
    <div className="control-group">
      <h3>
        <Tooltip content="ステレオグラムの表面に描かれる模様を選択します。" showIcon={true}>
          <ImageIcon size={18} /> 表面のテクスチャ (模様)
        </Tooltip>
      </h3>
      <Tooltip content="砂嵐、文字パターン、または画像を選択できます。" showIcon={true}>
        <select className="mb-2" value={bgType} onChange={(e) => setBgType(e.target.value)}>
          <option value="noise">砂嵐</option>
          <option value="text_pattern">文字パターン</option>
          <option value="pattern">パターン画像を読み込む</option>
        </select>
      </Tooltip>

      {(bgType === 'noise' || bgType === 'text_pattern') && (
        <div className="mt-2" style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px' }}>
          {bgType === 'text_pattern' && (
            <>
              <label className="mb-2" style={{ display: 'block' }}>文字のプリセット
                <select
                  onChange={e => {
                    if (e.target.value) setTextPatternChars(e.target.value);
                  }}
                  style={{ width: '100%', marginTop: '4px', marginBottom: '8px', padding: '6px', borderRadius: '4px', border: '1px solid #4b5563', background: '#374151', color: 'white' }}
                >
                  <option value="">-- リストから選ぶ --</option>
                  <option value="○□△✛×☆●■▲★">記号 (○□△✛×☆●■▲★)</option>
                  <option value="あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん">ひらがな</option>
                  <option value="アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン">カタカナ</option>
                  <option value="ABCDEFGHIJKLMNOPQRSTUVWXYZ">アルファベット (大文字)</option>
                  <option value="abcdefghijklmnopqrstuvwxyz">アルファベット (小文字)</option>
                  <option value="0123456789">数字</option>
                  <option value="♥♡♠♤♣♧♦♢">トランプ</option>
                  <option value="☺☻☹😊😂😍😎😜😭🤔">顔文字</option>
                  <option value="🍰🎂🍭🍫🍦🍩🍨🍔🍕🍟🍣🍱🍙">食べ物</option>
                </select>
              </label>
              <label className="mb-2" style={{ display: 'block' }}>散布する文字列
                <textarea
                  value={textPatternChars}
                  onChange={e => setTextPatternChars(e.target.value)}
                  className="mt-1"
                  rows={2}
                  style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #4b5563', background: '#374151', color: 'white' }}
                />
              </label>
              <label style={{ display: 'block', marginTop: '8px' }}>文字の大きさ ({textPatternSize}px)
                <input type="range" min="4" max="50" value={textPatternSize} onChange={e => setTextPatternSize(Number(e.target.value))} style={{ width: '100%' }} />
              </label>
              <label style={{ display: 'block', marginTop: '8px' }}>配置密度 ({textPatternDensity})
                <input type="range" min="10" max="150" value={textPatternDensity} onChange={e => setTextPatternDensity(Number(e.target.value))} style={{ width: '100%' }} />
              </label>
            </>
          )}

          {bgType === 'noise' && (
            <Tooltip content="ドットの粒を大きくすると、立体視の焦点が合わせやすくなります。" showIcon={true}>
              <label className="mb-2 block" style={{ display: 'block' }}>
                ドットの大きさ ({noiseSize}px)
                <input type="range" min="1" max="15" value={noiseSize} onChange={e => setNoiseSize(Number(e.target.value))} style={{ width: '100%' }} />
              </label>
            </Tooltip>
          )}

          <label className="mt-2" style={{ display: 'block', marginTop: '8px' }}>彩色方法
            <select value={textureColor} onChange={e => setTextureColor(e.target.value)} style={{ width: '100%', marginTop: '4px', padding: '6px', borderRadius: '4px', border: '1px solid #4b5563', background: '#374151', color: 'white' }}>
              <option value="random">ランダムカラー</option>
              <option value="pastel">パレット (パステル)</option>
              <option value="autumn">パレット (秋色)</option>
              <option value="ocean">パレット (海・寒色)</option>
              <option value="neon">ネオンカラー</option>
              <option value="monochrome">{bgType === 'noise' ? '白黒 (2値)' : '単色 (黒)'}</option>
              <option value="grayscale">グレースケール</option>
            </select>
          </label>
        </div>
      )}

      {bgType === 'pattern' && (
        <div className="upload-btn-wrapper mt-2">
          <button className="btn outline">
            <Upload size={16} /> パターン画像を選択
          </button>
          <input type="file" accept="image/*" onChange={handlePatternUpload} />
        </div>
      )}
    </div>
  );
}
