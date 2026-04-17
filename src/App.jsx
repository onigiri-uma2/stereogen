import { useStereoLoop } from './hooks/useStereoLoop';
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { generateStereogram, applyWiggleToDepthMap } from './stereogram';
import { Settings, Image as ImageIcon, Video, Download, RefreshCw, Upload, Play, Square, Activity, Wand2, Loader2, Sliders, Menu, X, HelpCircle, AlertCircle, Layout } from 'lucide-react';
import DraggablePanel from './components/DraggablePanel';
import { useAiDepthWorker } from './hooks/useAiDepthWorker';
import { useMediaExport } from './hooks/useMediaExport';
import Tooltip from './components/Tooltip';
import ViewSettings from './components/sidebar/ViewSettings';
import TextureSettings from './components/sidebar/TextureSettings';
import RenderSettings from './components/sidebar/RenderSettings';
import DepthSourceSettings from './components/sidebar/DepthSourceSettings';
import './App.css';

/**
 * StereoGen: ステレオグラム生成アプリケーションのメイン・エントリーポイント
 * 
 * 【アーキテクチャ概要】
 * - `App.jsx`: 全体のステート（UIの状態、設定値）を保持し、各UIコンポーネント（サイドバーなど）に分配する Container の役割を持ちます。
 * - `useStereoLoop.js`: requestAnimationFrame を用いた描画エンジンの心臓部であり、実際の Canvas への描画処理をカプセル化しています。
 * - `useAiDepthWorker.js`: WebWorker を用いて Hugging Face (ONNX Web) の AI深度推定モデルを非同期に実行する処理をカプセル化しています。
 * - `useMediaExport.js`: 完成した Canvas の静止画保存や、MediaRecorder を用いた WebM 動画のエクスポート処理を担当します。
 */
function App() {
  // --- 基本的なUI状態 ---
  const [method, setMethod] = useState('parallel'); // 平行法 または 交差法
  const [sidebarOpen, setSidebarOpen] = useState(false); // モバイル向けサイドバーの開閉
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768); // スマホ表示判定 (768px基準)
  const [fullscreenView, setFullscreenView] = useState(false); // 全画面表示モード
  const [bgType, setBgType] = useState('noise'); // 背景の種類（砂嵐、画像パターン、文字パターン）
  const [noiseSize, setNoiseSize] = useState(5); // ランダムドットの大きさ(px)
  const [separation, setSeparation] = useState(150); // 左右の基準視差(ピクセル数)
  const [depthFactor, setDepthFactor] = useState(0.33); // 奥行きの強調度
  const [showGuideDots, setShowGuideDots] = useState(true); // 合焦を助けるガイドドットの表示
  const [guideDotSize, setGuideDotSize] = useState(8); // ガイドドットの大きさ

  // --- テキストパターン関連の状態 ---
  const [textPatternChars, setTextPatternChars] = useState('○□△✛×☆●■▲★');
  const [textPatternSize, setTextPatternSize] = useState(16);
  const [textPatternDensity, setTextPatternDensity] = useState(50);
  const [textureColor, setTextureColor] = useState('random');


  // --- 深度マップ（3Dの元データ）のソース設定 ---
  const [depthMode, setDepthMode] = useState('default'); // 'default', 'animated', 'text', 'upload', 'ai'
  const [depthSourceType, setDepthSourceType] = useState('default'); // 現在アクティブなソースの種類
  const [defaultShape, setDefaultShape] = useState('torus'); // 静止画シェイプの種類
  const [animatedShape, setAnimatedShape] = useState('pulse'); // アニメーションシェイプの種類
  const [isPlaying, setIsPlaying] = useState(false); // アニメーションまたは動画の再生中か
  const [wiggleEnabled, setWiggleEnabled] = useState(false); // 2.5DゆらぎエフェクトのON/OFF

  // --- 深度調整に関連する状態 ---
  const [depthLayers, setDepthLayers] = useState(256); // 深度の階調数 (256=滑らか)
  const [depthContrast, setDepthContrast] = useState(2.0); // 深度のガンマ補正（立体感の調整）

  // --- テキストモードに関連する状態 ---
  const [depthText, setDepthText] = useState('MAGIC');
  const [textFontSize, setTextFontSize] = useState(200);
  const [textFontFamily, setTextFontFamily] = useState('Arial Black, sans-serif');
  const [textScrollSpeed, setTextScrollSpeed] = useState(2);
  const [textSoftness, setTextSoftness] = useState(6); // 縁のボケ具合（これによって角が丸まり立体感が増す）
  const [textDepth, setTextDepth] = useState(100); // テキストの明るさ（手前への飛び出し量）

  const [outputResolution, setOutputResolution] = useState('auto'); // 出力解像度 ('auto' または '800x600' 等)
  const staticImageRef = useRef(null); // アップロードされた静止画像を保持

  const aiRawDataRef = useRef(null);
  const depthCanvasRef = useRef(null);
  const patternCanvasRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const fullscreenCanvasRef = useRef(null);
  const videoRef = useRef(null);

  const { isRecording, startRecording, stopRecording, downloadImage } = useMediaExport(outputCanvasRef);


  const {
    handleDepthUpload,
    handlePatternUpload,
    applyAiFiltersAndDraw
  } = useStereoLoop({
    method, bgType, noiseSize, separation, depthFactor, showGuideDots, guideDotSize,
    textPatternChars, textPatternSize, textPatternDensity, textureColor,
    depthMode, depthSourceType, setDepthSourceType,
    defaultShape, animatedShape,
    isPlaying, setIsPlaying, wiggleEnabled,
    depthLayers, depthContrast,
    depthText, textFontSize, textFontFamily, textScrollSpeed, textSoftness, textDepth,
    outputResolution,
    depthCanvasRef, patternCanvasRef, outputCanvasRef, fullscreenCanvasRef,
    videoRef, staticImageRef, aiRawDataRef,
    fullscreenView, setBgType
  });

  const onInferenceComplete = useCallback((result) => {
    setDepthSourceType('ai');
    setIsPlaying(false);
    aiRawDataRef.current = {
      data: result.data,
      width: result.width,
      height: result.height
    };
    if (applyAiFiltersAndDraw) applyAiFiltersAndDraw();
  }, [setDepthSourceType, setIsPlaying, applyAiFiltersAndDraw]);

  const {
    aiStatus,
    setAiStatus,
    aiProgress,
    aiDownloadPercent,
    aiModelInfo,
    handleAiUpload,
    cancelAiProcessing
  } = useAiDepthWorker({ isMobileView, onInferenceComplete });

  /**
   * 画面リサイズ監視（モバイル表示判定の更新）
   */
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- JSX描画 ---
  return (
    <div className="app-container">
      {/* モバイル用メニュー */}
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="メニュー開閉">
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* モバイル用オーバーレイ */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="logo">
          <h1>StereoGen</h1>
          <p>Autostereogram Creator</p>
        </div>

        {/* --- 表示オプション --- */}
        <ViewSettings method={method} setMethod={setMethod} />

        {/* --- 背景・模様設定 --- */}
        <TextureSettings
          bgType={bgType} setBgType={setBgType}
          textPatternChars={textPatternChars} setTextPatternChars={setTextPatternChars}
          textPatternSize={textPatternSize} setTextPatternSize={setTextPatternSize}
          textPatternDensity={textPatternDensity} setTextPatternDensity={setTextPatternDensity}
          textureColor={textureColor} setTextureColor={setTextureColor}
          handlePatternUpload={handlePatternUpload}
          noiseSize={noiseSize} setNoiseSize={setNoiseSize}
        />
        <canvas ref={patternCanvasRef} style={{ display: 'none' }} />

        {/* --- 詳細パラメータ --- */}
        <RenderSettings
          outputResolution={outputResolution} setOutputResolution={setOutputResolution}
          separation={separation} setSeparation={setSeparation}
          depthFactor={depthFactor} setDepthFactor={setDepthFactor}
          showGuideDots={showGuideDots} setShowGuideDots={setShowGuideDots}
          guideDotSize={guideDotSize} setGuideDotSize={setGuideDotSize}
        />

        {/* --- 深度マップ（立体の元）設定 --- */}
        <DepthSourceSettings
          depthMode={depthMode} setDepthMode={setDepthMode}
          defaultShape={defaultShape} setDefaultShape={setDefaultShape}
          animatedShape={animatedShape} setAnimatedShape={setAnimatedShape}
          depthText={depthText} setDepthText={setDepthText}
          textFontSize={textFontSize} setTextFontSize={setTextFontSize}
          textFontFamily={textFontFamily} setTextFontFamily={setTextFontFamily}
          textScrollSpeed={textScrollSpeed} setTextScrollSpeed={setTextScrollSpeed}
          textDepth={textDepth} setTextDepth={setTextDepth}
          textSoftness={textSoftness} setTextSoftness={setTextSoftness}
          handleDepthUpload={handleDepthUpload}
          handleAiUpload={handleAiUpload}
          aiStatus={aiStatus} aiProgress={aiProgress} aiDownloadPercent={aiDownloadPercent} aiModelInfo={aiModelInfo} cancelAiProcessing={cancelAiProcessing}
          depthLayers={depthLayers} setDepthLayers={setDepthLayers}
          depthContrast={depthContrast} setDepthContrast={setDepthContrast}
          hasAiRawData={!!aiRawDataRef.current}
          isPlaying={isPlaying} setIsPlaying={setIsPlaying}
          wiggleEnabled={wiggleEnabled} setWiggleEnabled={setWiggleEnabled}
          depthSourceType={depthSourceType}
        />

        {/* --- 書き出し --- */}
        <div className="export-section">
          <button className="btn primary block" onClick={downloadImage}>
            <Download size={16} /> 静止画として保存 (PNG)
          </button>
          <button className={`btn block ${isRecording ? 'danger' : 'accent'}`} onClick={isRecording ? stopRecording : startRecording}>
            <Video size={16} /> {isRecording ? "書き出しを停止" : "動画として書き出し (WebM)"}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="kanban">
          {/* 深度マッププレビュー */}
          <DraggablePanel
            title="立体の形状 (深度マップ)"
            id="depth-panel-draggable"
            isMobile={isMobileView}
            className="depth-panel"
            initialPos={{ x: 0, y: 0 }}
            initialSize={{ width: 440, height: 'auto' }}
          >
            <div className="canvas-container">
              <canvas ref={depthCanvasRef} className="preview-canvas" />
            </div>
          </DraggablePanel>

          {/* 生成結果プレビュー（PCではホバー時に案内を表示） */}
          <DraggablePanel
            title="完成したステレオグラム"
            id="output-panel-draggable"
            isMobile={isMobileView}
            className="output-panel"
            initialPos={{ x: 472, y: 0 }}
            initialSize={{ width: 640, height: 'auto' }}
          >
            <Tooltip content={!isMobileView ? "クリックで全画面表示" : null}>
              <div className="canvas-container" onClick={() => setFullscreenView(true)} style={{ cursor: 'pointer' }}>
                <canvas ref={outputCanvasRef} className="preview-canvas" />
              </div>
            </Tooltip>
          </DraggablePanel>
        </div>
      </main>

      {/* 全画面表示オーバーレイ */}
      {fullscreenView && (
        <div className="fullscreen-overlay" onClick={() => setFullscreenView(false)}>
          <button className="fullscreen-close" onClick={() => setFullscreenView(false)} aria-label="閉じる">
            <X size={28} />
          </button>
          <canvas ref={fullscreenCanvasRef} className="fullscreen-canvas" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

export default App;
