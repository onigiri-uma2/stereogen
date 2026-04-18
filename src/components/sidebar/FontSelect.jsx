import React from 'react';

export default function FontSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        width: '100%',
        marginTop: '4px',
        padding: '6px',
        background: 'rgba(0,0,0,0.2)',
        color: 'white',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '4px',
        fontSize: '14px',
        fontFamily: value.includes('system-ui') ? 'inherit' : value
      }}
    >
      <optgroup label="POP・かわいい系">
        <option value="'Mochiy Pop One', sans-serif" style={{ fontFamily: "'Mochiy Pop One', sans-serif" }}>ぷっくりポップ</option>
        <option value="'Potta One', sans-serif" style={{ fontFamily: "'Potta One', sans-serif" }}>ポッタワン (ぽってり筆字)</option>
        <option value="'Hachi Maru Pop', cursive" style={{ fontFamily: "'Hachi Maru Pop', cursive" }}>ハチマルポップ (丸文字)</option>
        <option value="'RocknRoll One', sans-serif" style={{ fontFamily: "'RocknRoll One', sans-serif" }}>ロックンロール</option>
      </optgroup>
      <optgroup label="手書き・ペン字・和風">
        <option value="'Yomogi', cursive" style={{ fontFamily: "'Yomogi', cursive" }}>よもぎ (ふにゃ文字)</option>
        <option value="'Yusei Magic', sans-serif" style={{ fontFamily: "'Yusei Magic', sans-serif" }}>油性マジック (手書き風)</option>
        <option value="'Klee One', cursive" style={{ fontFamily: "'Klee One', cursive" }}>クレー (硬筆手書き)</option>
        <option value="'Yuji Syuku', serif" style={{ fontFamily: "'Yuji Syuku', serif" }}>祐筆・粛 (達筆ペン字)</option>
        <option value="'Zen Kurenaido', sans-serif" style={{ fontFamily: "'Zen Kurenaido', sans-serif" }}>くれなゐ (筆文字風)</option>
      </optgroup>
      <optgroup label="インパクト・デザイン・レトロ">
        <option value="'Dela Gothic One', sans-serif" style={{ fontFamily: "'Dela Gothic One', sans-serif" }}>デラゴシック (極太)</option>
        <option value="'Train One', cursive" style={{ fontFamily: "'Train One', cursive" }}>トレイン (極太線画)</option>
        <option value="'Reggae One', sans-serif" style={{ fontFamily: "'Reggae One', sans-serif" }}>レゲエ (トゲトゲ)</option>
        <option value="'Kaisei Decol', serif" style={{ fontFamily: "'Kaisei Decol', serif" }}>解星デコール (装飾的)</option>
        <option value="'DotGothic16', sans-serif" style={{ fontFamily: "'DotGothic16', sans-serif" }}>ドット絵風</option>
      </optgroup>
      <optgroup label="丸ゴシック・スマート">
        <option value="'M PLUS Rounded 1c', sans-serif" style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif" }}>M+ 丸ゴシック</option>
        <option value="'Kiwi Maru', serif" style={{ fontFamily: "'Kiwi Maru', serif" }}>キウイ丸 (丸み明朝)</option>
      </optgroup>
      <optgroup label="標準・OS自動">
        <option value="sans-serif">一般的なゴシック体</option>
        <option value="serif">一般的な明朝体</option>
        <option value="system-ui, -apple-system, BlinkMacSystemFont, sans-serif">デバイス標準フォント</option>
      </optgroup>
      <optgroup label="OS固有 (Windows)">
        <option value="'Meiryo', sans-serif">メイリオ</option>
        <option value="'Yu Gothic', sans-serif">游ゴシック</option>
        <option value="'MS PGothic', sans-serif">MS Pゴシック</option>
        <option value="'MS PMincho', serif">MS P明朝</option>
      </optgroup>
      <optgroup label="OS固有 (Mac / iOS)">
        <option value="'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif">ヒラギノ角ゴ</option>
        <option value="'Hiragino Mincho ProN', serif">ヒラギノ明朝</option>
      </optgroup>
    </select>
  );
}
