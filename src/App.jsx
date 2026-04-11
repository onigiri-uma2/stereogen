import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { generateStereogram, applyWiggleToDepthMap } from './stereogram';
import { Settings, Image as ImageIcon, Video, Download, RefreshCw, Upload, Play, Square, Activity, Wand2, Loader2, Sliders, Menu, X, HelpCircle, AlertCircle } from 'lucide-react';
import Tooltip from './components/Tooltip';
import './App.css';

/**
 * StereoGen: ステレオグラム生成アプリ
 * 2D画像、動画、テキスト、またはAIによる深度推定からステレオグラムを生成します。
 */
function App() {
  // --- 基本的なUI状態 ---
  const [method, setMethod] = useState('parallel'); // 平行法 または 交差法
  const [sidebarOpen, setSidebarOpen] = useState(false); // モバイル向けサイドバーの開閉
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768); // スマホ表示判定 (768px基準)
  const [fullscreenView, setFullscreenView] = useState(false); // 全画面表示モード
  const [bgType, setBgType] = useState('black_white'); // 背景の種類（白黒ドット、カラードット、画像パターン）
  const [noiseSize, setNoiseSize] = useState(1); // ランダムドットの大きさ(px)
  const [separation, setSeparation] = useState(150); // 左右の基準視差(ピクセル数)
  const [depthFactor, setDepthFactor] = useState(0.33); // 奥行きの強調度
  const [showGuideDots, setShowGuideDots] = useState(true); // 合焦を助けるガイドドットの表示

  // --- 深度マップ（3Dの元データ）のソース設定 ---
  const [depthMode, setDepthMode] = useState('default'); // 'default', 'animated', 'text', 'upload', 'ai'
  const [depthSourceType, setDepthSourceType] = useState('default'); // 現在アクティブなソースの種類
  const [defaultShape, setDefaultShape] = useState('torus'); // 静止画シェイプの種類
  const [animatedShape, setAnimatedShape] = useState('pulse'); // アニメーションシェイプの種類
  const [isPlaying, setIsPlaying] = useState(false); // アニメーションまたは動画の再生中か
  const [isRecording, setIsRecording] = useState(false); // 画面録画中か
  const [wiggleEnabled, setWiggleEnabled] = useState(false); // 2.5DゆらぎエフェクトのON/OFF

  // --- AI深度推定に関連する状態 ---
  const [aiStatus, setAiStatus] = useState('idle'); // 'idle', 'loading', 'inferring', 'error'
  const [aiProgress, setAiProgress] = useState(''); // 進捗メッセージ
  const [aiDownloadPercent, setAiDownloadPercent] = useState(0); // モデルDLの％
  const [aiDownloadDetail, setAiDownloadDetail] = useState(''); // DL中のファイル名など
  const [depthLayers, setDepthLayers] = useState(256); // 深度の階調数 (256=滑らか)
  const [depthContrast, setDepthContrast] = useState(2.0); // 深度のガンマ補正（立体感の調整）
  const [aiModelInfo, setAiModelInfo] = useState(null); // 現在ロードされているAIモデルの情報

  // --- テキストモードに関連する状態 ---
  const [depthText, setDepthText] = useState('MAGIC');
  const [textFontSize, setTextFontSize] = useState(200);
  const [textFontFamily, setTextFontFamily] = useState('Arial Black, sans-serif');
  const [textScrollSpeed, setTextScrollSpeed] = useState(2);
  const [textSoftness, setTextSoftness] = useState(6); // 縁のボケ具合（これによって角が丸まり立体感が増す）
  const [textDepth, setTextDepth] = useState(100); // テキストの明るさ（手前への飛び出し量）

  const [outputResolution, setOutputResolution] = useState('auto'); // 出力解像度 ('auto' または '800x600' 等)
  const staticImageRef = useRef(null); // アップロードされた静止画像を保持

  /**
   * 現在の設定に基づいて、キャンバスのターゲット寸法を計算する
   */
  const getTargetDimensions = useCallback((sourceW, sourceH) => {
    if (outputResolution === 'auto') return { w: sourceW || 800, h: sourceH || 600 };
    const [sw, sh] = outputResolution.split('x').map(Number);
    return { w: sw, h: sh };
  }, [outputResolution]);

  /**
   * アスペクト比を維持して画像をキャンバスに描画する（レターボックス挿入）
   */
  const drawAspectImage = useCallback((ctx, img, canvasW, canvasH, sourceW, sourceH) => {
    const scale = Math.min(canvasW / sourceW, canvasH / sourceH);
    const rw = sourceW * scale;
    const rh = sourceH * scale;
    ctx.fillStyle = '#000000'; // 背景は黒（深度0）
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, (canvasW - rw) / 2, (canvasH - rh) / 2, rw, rh);
  }, []);

  // --- キャンバスおよびワーカーのRef管理 ---
  const workerRef = useRef(null); // AI用Web Worker
  const aiRawDataRef = useRef(null); // AIの生の推論結果（再計算用に保持）

  const depthCanvasRef = useRef(null); // 深度マップ用キャンバス
  const patternCanvasRef = useRef(null); // ユーザー指定パターン用キャンバス
  const outputCanvasRef = useRef(null); // プレビュー用ステレオグラム
  const fullscreenCanvasRef = useRef(null); // 全画面表示用ステレオグラム

  const videoRef = useRef(null); // アップロードされた動画要素（不可視）
  const animationRef = useRef(null); // requestAnimationFrameのID
  const mediaRecorderRef = useRef(null); // 画面録画用
  const recordedChunks = useRef([]); // 録画データの断片
  const accumulatedTimeRef = useRef(0); // コンテンツ（形状・テキスト）用のアニメーション累積時間
  const lastFrameTimeRef = useRef(performance.now()); // 前フレームの実行時刻

  /**
   * 全画面表示モード時に、メインの出力キャンバスをリアルタイムにクローンして表示する
   */
  useEffect(() => {
    if (!fullscreenView) return;
    let rafId;
    const sync = () => {
      const src = outputCanvasRef.current;
      const dst = fullscreenCanvasRef.current;
      if (src && dst) {
        if (dst.width !== src.width) dst.width = src.width;
        if (dst.height !== src.height) dst.height = src.height;
        dst.getContext('2d').drawImage(src, 0, 0);
      }
      rafId = requestAnimationFrame(sync);
    };
    rafId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafId);
  }, [fullscreenView]);

  const applyAiFiltersRef = useRef(null);

  /**
   * AIワーカーからのメッセージ処理
   */
  const handleWorkerMessage = useCallback((e) => {
    const { status, progress, result, error, info } = e.data;
    if (status === 'progress' && progress) {
      // モデルダウンロードの進捗表示（ステータス変更は handleAiUpload 等の開始点に任せる）
      const fileName = progress.file?.split('/').pop() || progress.file || aiDownloadDetail || '';
      const pct = Math.round(progress.progress || 0);
      setAiDownloadPercent(pct);

      if (progress.status === 'initiate') {
        setAiProgress(`取得開始: ${fileName}`);
        setAiDownloadDetail(fileName);
      } else if (progress.status === 'download' || progress.status === 'progress') {
        let msg = progress.status === 'download' ? 'ダウンロード中' : 'ロード中';
        msg += `: ${fileName} ${pct}%`;

        // バイト数が取得可能な場合はMB換算して表示に追加
        if (progress.loaded !== undefined && progress.total !== undefined) {
          const loadedMB = (progress.loaded / (1024 * 1024)).toFixed(1);
          const totalMB = (progress.total / (1024 * 1024)).toFixed(1);
          msg += ` (${loadedMB}MB / ${totalMB}MB)`;
        }
        setAiProgress(msg);
      } else if (progress.status === 'done') {
        setAiDownloadPercent(100);
        setAiProgress(`完了: ${fileName}`);
      } else {
        setAiProgress(`${progress.status || '処理中'}: ${fileName} ${pct}%`);
      }
    } else if (status === 'ready') {
      if (info) setAiModelInfo(info);
      // モデル読み込み完了時、直後に推論(inferring)が始まる可能性があるため、
      // 既に解析フロー(loading)に入っている場合はステータスを勝手にidleに戻さない
      setAiStatus(prev => (prev === 'loading' ? 'loading' : 'idle'));
    } else if (status === 'inferring') {
      setAiStatus('inferring');
      setAiProgress('AIが深度を推定しています...');
    } else if (status === 'error') {
      setAiStatus('error');
      setAiProgress(`エラー: ${error}`);
      setAiDownloadPercent(0);
    } else if (status === 'complete') {
      // 完了時の処理
      setAiStatus('idle');
      setDepthSourceType('ai');
      setIsPlaying(false);
      setAiDownloadPercent(0);
      setAiDownloadDetail('');
      // 生データの保存（スライダー調整時に再利用するため）
      aiRawDataRef.current = {
        data: result.data,
        width: result.width,
        height: result.height
      };
      // フィルター適用と描画
      if (applyAiFiltersRef.current) applyAiFiltersRef.current();
    }
  }, []);

  /**
   * workerの初期化と後始末
   */
  useEffect(() => {
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current.addEventListener('message', handleWorkerMessage);

    // 既にモデルがダウンロード済みであれば、バックグラウンドで起動して情報を取得しておく
    checkIfModelCached().then(isCached => {
      if (isCached && workerRef.current) {
        // バックグラウンドでのロード命令（ユーザー操作を妨げない）
        workerRef.current.postMessage({ command: 'load' });
      }
    });

    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, [handleWorkerMessage]);

  /**
   * 画面リサイズ監視（モバイル表示判定の更新）
   */
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /**
   * 1フレームの描画処理（ステレオグラム生成の核心）
   */
  const processFrame = (time = performance.now()) => {
    const depthCanvas = depthCanvasRef.current;
    const patternCanvas = patternCanvasRef.current;
    const outputCanvas = outputCanvasRef.current;

    if (!depthCanvas || !outputCanvas) return;
    const w = depthCanvas.width;
    const h = depthCanvas.height;
    if (w === 0 || h === 0) return;

    // ドットサイズ(noiseSize)に応じて、一旦解像度を下げて生成する
    // これによりドットのひとつひとつが大きく表示されるようになる
    const scale = (bgType !== 'pattern') ? noiseSize : 1;
    const effectiveW = Math.max(1, Math.floor(w / scale));
    const effectiveH = Math.max(1, Math.floor(h / scale));
    const finalW = effectiveW * scale;
    const finalH = effectiveH * scale;

    if (outputCanvas.width !== finalW) outputCanvas.width = finalW;
    if (outputCanvas.height !== finalH) outputCanvas.height = finalH;

    // 現在の深度キャンバスからデータを抽出
    const tempDepthCvs = document.createElement('canvas');
    tempDepthCvs.width = effectiveW;
    tempDepthCvs.height = effectiveH;
    const tCtx = tempDepthCvs.getContext('2d', { willReadFrequently: true });
    tCtx.drawImage(depthCanvas, 0, 0, w, h, 0, 0, effectiveW, effectiveH);
    const depthData = tCtx.getImageData(0, 0, effectiveW, effectiveH).data;

    // パターン画像の取得
    let patternData = null;
    let pW = 0; let pH = 0;
    if (bgType === 'pattern' && patternCanvas && patternCanvas.width > 0) {
      pW = patternCanvas.width;
      pH = patternCanvas.height;
      patternData = patternCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, pW, pH).data;
    }

    // 2.5Dゆらぎが有効なら計算を適用
    let finalDepthData = depthData;
    if (loopStateRef.current.wiggleEnabled) {
      finalDepthData = applyWiggleToDepthMap(depthData, effectiveW, effectiveH, time);
    }

    // ステレオグラム・アルゴリズムの実行
    const outputImgData = generateStereogram(finalDepthData, effectiveW, effectiveH, {
      separation: Math.max(1, Math.round(separation / scale)),
      depthFactor,
      method,
      noiseType: bgType === 'color' ? 'color' : 'grayscale',
      patternData,
      patternWidth: pW,
      patternHeight: pH,
      seed: Math.floor(time / 50) // 約20fpsでノイズをキラキラ（シード変化）させる
    });

    // 結果をキャンバスに描画
    const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
    const tempStereoCvs = document.createElement('canvas');
    tempStereoCvs.width = effectiveW;
    tempStereoCvs.height = effectiveH;
    const tsCtx = tempStereoCvs.getContext('2d', { willReadFrequently: true });
    tsCtx.putImageData(new ImageData(outputImgData, effectiveW, effectiveH), 0, 0);

    // ドットサイズに合わせて鮮明に表示するためスムージングをOFFにする
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(tempStereoCvs, 0, 0, finalW, finalH);

    // 合焦用ドット（● ●）の描画
    if (showGuideDots) {
      const actualSeparation = Math.max(1, Math.round(separation / scale)) * scale;
      const dotRadius = Math.max(4, Math.floor(finalW * 0.008));
      const dotY = Math.max(20, Math.floor(finalH * 0.05));
      const centerX = finalW / 2;

      outCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      outCtx.beginPath(); outCtx.arc(centerX - actualSeparation / 2, dotY, dotRadius + 2, 0, Math.PI * 2); outCtx.fill();
      outCtx.beginPath(); outCtx.arc(centerX + actualSeparation / 2, dotY, dotRadius + 2, 0, Math.PI * 2); outCtx.fill();

      outCtx.fillStyle = '#111827';
      outCtx.beginPath(); outCtx.arc(centerX - actualSeparation / 2, dotY, dotRadius, 0, Math.PI * 2); outCtx.fill();
      outCtx.beginPath(); outCtx.arc(centerX + actualSeparation / 2, dotY, dotRadius, 0, Math.PI * 2); outCtx.fill();
    }
  };

  const triggerRender = useCallback(() => {
    if (processRef.current) processRef.current();
  }, []);

  /**
   * AIから返された生の深度データを、ユーザー指定のフィルター（階調化、コントラスト）を通して描画キャンバスに投影する
   */
  const applyAiFiltersAndDraw = useCallback(() => {
    if (!aiRawDataRef.current) return;
    const { data, width: rawW, height: rawH } = aiRawDataRef.current;

    // AIデータの正規化（チャンネル数の判定と最小・最大値の算出）
    const channels = Math.round(data.length / (rawW * rawH)) || 1;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < rawW * rawH; i++) {
      const val = data[i * channels];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    const range = (max - min) === 0 ? 1 : (max - min);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = rawW;
    tempCanvas.height = rawH;
    const tempCtx = tempCanvas.getContext('2d');
    const imgData = tempCtx.createImageData(rawW, rawH);

    for (let i = 0; i < rawW * rawH; i++) {
      let val = data[i * channels];
      let norm = (val - min) / range; // 0.0 ~ 1.0 に正規化

      // コントラスト（ガンマカーブ）の適用
      // 顔などの飛び出しすぎを抑えたり、なだらかにするために使用
      norm = Math.pow(norm, depthContrast);

      let finalVal;
      // 深度の階調化（ポスタライズ）処理
      if (depthLayers >= 256) {
        finalVal = Math.floor(norm * 255);
      } else {
        let quant = Math.floor(norm * depthLayers) / (depthLayers - 1);
        if (quant > 1) quant = 1;
        finalVal = Math.floor(quant * 255);
      }

      imgData.data[i * 4] = finalVal;
      imgData.data[i * 4 + 1] = finalVal;
      imgData.data[i * 4 + 2] = finalVal;
      imgData.data[i * 4 + 3] = 255;
    }
    tempCtx.putImageData(imgData, 0, 0);

    // 結果を描画キャンバスへ書き込み（アスペクト比調整込み）
    const canvas = depthCanvasRef.current;
    if (!canvas) return;
    const { w, h } = getTargetDimensions(rawW, rawH);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    drawAspectImage(ctx, tempCanvas, w, h, rawW, rawH);

    triggerRender();
  }, [depthLayers, depthContrast, getTargetDimensions, triggerRender, drawAspectImage]);

  applyAiFiltersRef.current = applyAiFiltersAndDraw;

  // 深度フィルタのスライダー変更時
  useEffect(() => {
    if (depthMode === 'ai' && aiRawDataRef.current) {
      applyAiFiltersAndDraw();
    } else if (depthSourceType === 'image' && staticImageRef.current) {
      // アップロード画像モードでもフィルタを即座に再適用
      const img = staticImageRef.current;
      const { w, h } = getTargetDimensions(img.width, img.height);
      const cvs = depthCanvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      drawAspectImage(ctx, img, w, h, img.width, img.height);
      applyDepthFiltersToCanvas(ctx, w, h);
      triggerRender();
    }
  }, [depthLayers, depthContrast, depthMode, depthSourceType, applyAiFiltersAndDraw, triggerRender, getTargetDimensions, drawAspectImage]);

  // 設定変更時の再描画トリガー
  useEffect(() => {
    if (depthSourceType === 'image' && staticImageRef.current) {
      const img = staticImageRef.current;
      const { w, h } = getTargetDimensions(img.width, img.height);
      const cvs = depthCanvasRef.current;
      cvs.width = w;
      cvs.height = h;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      drawAspectImage(ctx, img, w, h, img.width, img.height);
      applyDepthFiltersToCanvas(ctx, w, h);
      triggerRender();
    } else if (depthMode === 'default' && depthSourceType === 'default') {
      drawDefaultDepthMap();
      triggerRender();
    } else if (depthMode === 'text') {
      drawTextDepthMap(accumulatedTimeRef.current);
      triggerRender();
    } else if (depthMode === 'ai' && aiRawDataRef.current) {
      applyAiFiltersAndDraw();
    }
  }, [outputResolution, depthSourceType, depthMode, defaultShape, getTargetDimensions, applyAiFiltersAndDraw, triggerRender, drawAspectImage, depthLayers, depthContrast]);

  const AI_MODEL_ID = 'onnx-community/depth-anything-v2-small';

  /**
   * AIモデルがブラウザのCache APIに保存されているか確認する
   */
  const checkIfModelCached = async () => {
    try {
      if (!('caches' in window)) return false;
      const cache = await caches.open('transformers-cache');
      const keys = await cache.keys();
      // モデル名がURLに含まれるリクエストが1つでもあればキャッシュ済みとみなす
      return keys.some(request => request.url.includes(AI_MODEL_ID));
    } catch (e) {
      console.warn('Cache check failed:', e);
      return false;
    }
  };

  /**
   * AI深度推定のための画像アップロード処理
   */
  const handleAiUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // モデルがキャッシュされていない場合のみ警告を出す
    const isCached = await checkIfModelCached();
    if (!isCached) {
      // デバイスに応じた警告メッセージの調整
      // モバイル端末（画面幅またはUserAgent）の場合のみ通信量の警告を表示
      const isMobile = isMobileView || /Mobi|Android|iPhone/i.test(navigator.userAgent);
      const warningTitle = '⚠️ AI画像解析の準備';
      const warningBody = isMobile
        ? '解析に必要なAIモデル（約 50MB）をダウンロードします。\nパケット通信量にご注意ください。'
        : '解析に必要なAIモデル（約 50MB）をロードします。';

      const confirmed = window.confirm(
        `${warningTitle}\n\n`
        + `${warningBody}\n\n`
        + '• モデルはブラウザに保存され、次回以降はすぐに開始できます\n'
        + '• すべての計算はデバイス内で行われ、画像が外部に送信されることはありません\n'
        + '• 初回のみダウンロードに時間がかかる場合があります\n\n'
        + '続行してよろしいですか？'
      );
      if (!confirmed) {
        e.target.value = '';
        return;
      }
    }

    setAiStatus('loading');
    setAiProgress('画像を準備中...');
    setAiDownloadPercent(0);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      if (workerRef.current) {
        workerRef.current.postMessage({ command: 'load' }); // モデルロード命令
        workerRef.current.postMessage({ command: 'predict', image: dataUrl }); // 推論命令
      }
    };
    reader.readAsDataURL(file);
  };

  /**
   * AI処理の中断処理
   */
  const cancelAiProcessing = useCallback(() => {
    if (workerRef.current) workerRef.current.terminate();
    setAiStatus('idle');
    setAiProgress('');
    setAiDownloadPercent(0);
    setAiDownloadDetail('');
    // ワーカーを再作成
    workerRef.current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    workerRef.current.addEventListener('message', handleWorkerMessage);
  }, [handleWorkerMessage]);

  const textDrawRef = useRef(null);

  // モード切替時の初期化処理
  useEffect(() => {
    if (depthMode === 'default') {
      setDepthSourceType('default');
      setIsPlaying(false);
      drawDefaultDepthMap();
      triggerRender();
    } else if (depthMode === 'animated') {
      setDepthSourceType('animated');
      setIsPlaying(true);
    } else if (depthMode === 'text') {
      setDepthSourceType('text');
      // テキストモード選択時に時間をリセットし、中央から開始するようにする
      accumulatedTimeRef.current = 0;
      setTimeout(() => {
        if (textDrawRef.current) textDrawRef.current(0);
        triggerRender();
      }, 0);
    }
  }, [depthMode, triggerRender]);

  // 動画の再生・一時停止を isPlaying 状態に同期
  useEffect(() => {
    if (depthSourceType === 'video' && videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => { });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, depthSourceType]);

  /**
   * 定型シェイプ（ドーナツ、球、階段など）を深度キャンバスに描画する
   */
  const drawDefaultDepthMap = useCallback(() => {
    const canvas = depthCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { w, h } = getTargetDimensions(800, 600);
    canvas.width = w;
    canvas.height = h;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const r1 = Math.min(w, h) * 0.18;
    const maxR = Math.min(w, h) * 0.46;

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 各ピクセルに対して数式で深度(0-255)を計算
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        let depth = 0;

        if (defaultShape === 'torus') {
          // トーラス（ドーナツ型）
          if (distSq < r1 * r1) {
            const z = Math.sqrt(r1 * r1 - distSq);
            depth = Math.floor((z / r1) * 255);
          } else {
            const r2 = Math.min(w, h) * 0.35;
            const r3 = Math.min(w, h) * 0.25;
            const distOffset = Math.abs(dist - (r3 + r2) / 2);
            const maxDist = (r2 - r3) / 2;
            if (distOffset < maxDist) {
              const z = Math.sqrt(maxDist * maxDist - distOffset * distOffset);
              depth = Math.floor((z / maxDist) * 150);
            }
          }
        } else if (defaultShape === 'sphere') {
          // 半球型
          if (dist < maxR) {
            const z = Math.sqrt(maxR * maxR - dist * dist);
            depth = Math.floor((z / maxR) * 255);
          }
        } else if (defaultShape === 'pyramid') {
          // 四角錐
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const mDist = Math.max(absDx, absDy);
          const pSize = Math.min(w, h) * 0.35;
          if (mDist < pSize) {
            depth = Math.floor((1 - mDist / pSize) * 255);
          }
        } else if (defaultShape === 'ripple') {
          // 波紋
          if (dist < maxR) {
            const envelope = 1 - (dist / maxR);
            const wave = (Math.sin(dist / 10) + 1) / 2;
            depth = Math.floor(wave * envelope * 255);
          }
        } else if (defaultShape === 'stairs') {
          // 螺旋状の階段（段差）
          if (dist < maxR) {
            const steps = 6;
            depth = Math.floor(Math.floor((1 - dist / maxR) * steps) / steps * 255);
          }
        } else if (defaultShape === 'heart') {
          // 距離関数(SDF)を用いた3Dハート型
          const scale = maxR * 1.8;
          const u = dx / scale;
          const v = (-dy / scale) + 0.55;
          const au = Math.abs(u);
          let sdf = 0;
          if (v + au > 1.0) {
            const su = au - 0.25; const sv = v - 0.75;
            sdf = Math.sqrt(su * su + sv * sv) - 0.35355339;
          } else {
            const d1 = au * au + (v - 1.0) * (v - 1.0);
            const m = Math.max(au + v, 0.0);
            const dx2 = au - 0.5 * m; const dy2 = v - 0.5 * m;
            const d2 = dx2 * dx2 + dy2 * dy2;
            sdf = Math.sqrt(Math.min(d1, d2)) * Math.sign(au - v);
          }
          if (sdf < 0) {
            const dInside = -sdf;
            const maxD = 0.35355339;
            const dNorm = Math.min(dInside, maxD);
            const z = Math.sqrt(maxD * maxD - Math.pow(maxD - dNorm, 2));
            depth = Math.floor((z / maxD) * 255);
          }
        } else if (defaultShape === 'star') {
          // 星型（折り紙のようなカクカクとした立体感）
          let a = Math.atan2(dx, -dy);
          a = Math.abs(a);
          const segmentAngle = Math.PI / 5;
          a = a % (2 * segmentAngle);
          if (a > segmentAngle) a = 2 * segmentAngle - a;
          const rOuter = maxR * 0.95;
          const rInner = rOuter * 0.45;
          const p1_x = 0; const p1_y = rOuter;
          const p2_x = rInner * Math.sin(segmentAngle);
          const p2_y = rInner * Math.cos(segmentAngle);
          const Vx = p2_x - p1_x; const Vy = p2_y - p1_y;
          let Nx = -Vy; let Ny = Vx;
          const len = Math.sqrt(Nx * Nx + Ny * Ny);
          Nx /= len; Ny /= len;
          const D = p1_x * Nx + p1_y * Ny;
          const px = dist * Math.sin(a); const py = dist * Math.cos(a);
          const dEdge = D - (px * Nx + py * Ny);
          if (dEdge > 0) {
            depth = Math.floor((dEdge / D) * 255);
          }
        }

        if (depth > 0) {
          const idx = (y * w + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = depth;
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [getTargetDimensions, defaultShape]);

  /**
   * アニメーションするシェイプ（脈動、軌道、波など）を深度パスに描画する
   */
  const drawAnimatedDepthMap = useCallback((time) => {
    const canvas = depthCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { w, h } = getTargetDimensions(800, 600);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;
    const t = time / 1000;
    const cx = w / 2; const cy = h / 2;

    if (animatedShape === 'pulse') {
      // 飛び跳ねながら膨らむ球体
      const px = cx + Math.sin(time / 700) * 200;
      const py = cy + Math.cos(time / 500) * 100;
      const r = Math.min(w, h) * 0.2;
      const r_pulse = r + Math.sin(time / 300) * 20;
      const bgWaveScroll = time / 10;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - px; const dy = y - py;
          const distSq = dx * dx + dy * dy;
          let depth = 0;
          if (distSq < r_pulse * r_pulse) {
            depth = Math.floor((Math.sqrt(r_pulse * r_pulse - distSq) / r_pulse) * 255);
          } else {
            const wave = Math.sin((x + bgWaveScroll) / 50) * Math.cos((y + bgWaveScroll) / 50);
            depth = Math.floor((wave + 1) * 25);
          }
          const idx = (y * w + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = depth; data[idx + 3] = 255;
        }
      }
    } else if (animatedShape === 'orbit') {
      // 互いに追いかけっこする2つの球体
      const r = Math.min(w, h) * 0.15;
      const cx1 = cx + Math.cos(t * 1.5) * 150; const cy1 = cy + Math.sin(t * 1.5) * 150;
      const cx2 = cx + Math.cos(t * 1.5 + Math.PI) * 150; const cy2 = cy + Math.sin(t * 1.5 + Math.PI) * 150;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let d = 0;
          const distSq1 = (x - cx1) ** 2 + (y - cy1) ** 2;
          const distSq2 = (x - cx2) ** 2 + (y - cy2) ** 2;
          if (distSq1 < r * r) d = Math.max(d, Math.floor(Math.sqrt(r * r - distSq1) / r * 255));
          if (distSq2 < r * r) d = Math.max(d, Math.floor(Math.sqrt(r * r - distSq2) / r * 255));
          const idx = (y * w + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = d; data[idx + 3] = 255;
        }
      }
    } else if (animatedShape === 'waves') {
      // 画面全体がうねる波
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const wave1 = Math.sin(x / 50 + t * 2.0);
          const wave2 = Math.cos(y / 40 + t * 1.5);
          const wave3 = Math.sin((x + y) / 60 - t);
          let d = Math.floor((wave1 + wave2 + wave3 + 3) / 6 * 255);
          const idx = (y * w + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = d; data[idx + 3] = 255;
        }
      }
    } else if (animatedShape === 'rings') {
      // 雨粒が落ちて波紋が広がるようなエフェクト
      const drops = [];
      for (let i = 0; i < 4; i++) {
        const ph = i * 1.618;
        const cycle = (t * 0.8 + ph) % 5;
        const drx = cx + Math.sin(i * 13.5 + Math.floor((t * 0.8 + ph) / 5)) * (w * 0.35);
        const dry = cy + Math.cos(i * 7.2 + Math.floor((t * 0.8 + ph) / 5)) * (h * 0.35);
        drops.push({ x: drx, y: dry, cycle });
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let maxD = 0;
          for (const drop of drops) {
            const dist = Math.sqrt((x - drop.x) ** 2 + (y - drop.y) ** 2);
            const rWidth = 60;
            const currentR = drop.cycle * 150;
            const diff = Math.abs(dist - currentR);
            if (diff < rWidth) {
              const strength = Math.cos((diff / rWidth) * Math.PI) * 0.5 + 0.5;
              const fade = Math.max(0, 1 - drop.cycle / 4);
              maxD = Math.max(maxD, Math.floor(strength * fade * 180));
            }
          }
          const idx = (y * w + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = maxD; data[idx + 3] = 255;
        }
      }
    } else if (animatedShape === 'spin-star') {
      // 回転する3Dの星
      const maxR_star = Math.min(w, h) * 0.46;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx; const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          let a = Math.atan2(dx, -dy) + t * 1.2;
          a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          if (a > Math.PI) a -= Math.PI * 2;
          a = Math.abs(a);
          const segmentAngle = Math.PI / 5;
          a = a % (segmentAngle * 2);
          if (a > segmentAngle) a = segmentAngle * 2 - a;
          const rO = maxR_star * 0.95; const rI = rO * 0.45;
          const p1x = 0; const p1y = rO;
          const p2x = rI * Math.sin(segmentAngle); const p2y = rI * Math.cos(segmentAngle);
          const Vx = p2x - p1x; const Vy = p2y - p1y;
          let Nx = -Vy; let Ny = Vx;
          const len = Math.sqrt(Nx * Nx + Ny * Ny);
          Nx /= len; Ny /= len;
          const D = p1x * Nx + p1y * Ny;
          const px = dist * Math.sin(a); const py = dist * Math.cos(a);
          const dEdge = D - (px * Nx + py * Ny);
          let dp = 0;
          if (dEdge > 0) dp = Math.floor((dEdge / D) * 255);
          const idx = (y * w + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = dp; data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [getTargetDimensions, animatedShape]);

  /**
   * 任意のテキストを深度キャンバスに描画する
   */
  const drawTextDepthMap = useCallback((time = 0) => {
    const canvas = depthCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { w: canvasW, h: canvasH } = getTargetDimensions(800, 600);
    if (canvas.width !== canvasW || canvas.height !== canvasH) {
      canvas.width = canvasW; canvas.height = canvasH;
    }

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.font = `bold ${textFontSize}px ${textFontFamily}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';

    // 縁のボケ (textSoftness) を適用して、立体が「ぷっくり」するように見せる
    if (textSoftness > 0) {
      ctx.filter = `blur(${textSoftness}px)`;
    }

    const brightness = Math.min(255, Math.max(0, textDepth));
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;

    const metrics = ctx.measureText(depthText);
    const textW = metrics.width;
    let x = canvasW / 2;
    const ascent = metrics.actualBoundingBoxAscent || (textFontSize * 0.75);
    const descent = metrics.actualBoundingBoxDescent || (textFontSize * 0.25);
    const visualCenterOffset = (ascent - descent) / 2;
    let y = canvasH / 2 + visualCenterOffset;

    // スクロール速度が設定されている場合は、渡された時間に基づいて位置を決定する
    // （isPlayingが停止すると、渡される時間も止まるため、その場に静止します）
    if (textScrollSpeed > 0) {
      const speed = 0.1 * textScrollSpeed;
      const totalDist = canvasW + textW;
      // 初期状態(time=0)で中央に来るように、開始点（オフセット）を調整する
      const initialOffset = (canvasW + textW) / 2;
      const offset = (time * speed + initialOffset) % totalDist;
      x = canvasW - offset + textW / 2;
    }

    ctx.fillText(depthText, x, y);
    ctx.filter = 'none';
  }, [depthText, textFontSize, textFontFamily, textScrollSpeed, textSoftness, textDepth, getTargetDimensions]);

  // 静止テキストのパラメータ変更時に同期
  useEffect(() => {
    if (depthMode === 'text') {
      drawTextDepthMap(accumulatedTimeRef.current);
      triggerRender();
    }
  }, [depthText, textFontSize, textFontFamily, textSoftness, textDepth, drawTextDepthMap, triggerRender, depthMode]);

  // 設定変更による自動無音再描画
  useEffect(() => {
    if (!isPlaying && !wiggleEnabled) {
      triggerRender();
    }
  }, [method, bgType, separation, depthFactor, noiseSize, wiggleEnabled, showGuideDots, isPlaying, triggerRender]);

  // --- 再描画ループの状態管理 (Closureの罠を避けるためRefを使用) ---
  const loopStateRef = useRef({ isPlaying, depthSourceType, wiggleEnabled });
  useEffect(() => {
    loopStateRef.current = { isPlaying, depthSourceType, wiggleEnabled };
  }, [isPlaying, depthSourceType, wiggleEnabled]);

  const processRef = useRef();
  useLayoutEffect(() => { processRef.current = processFrame; });
  const animatedDrawRef = useRef();
  useLayoutEffect(() => { animatedDrawRef.current = drawAnimatedDepthMap; });
  const getDimensionsRef = useRef();
  useLayoutEffect(() => { getDimensionsRef.current = getTargetDimensions; });
  useLayoutEffect(() => { textDrawRef.current = drawTextDepthMap; });

  /**
   * キャンバス上の画像に対して深度フィルタ（階調化、コントラスト）を直接適用する
   */
  const applyDepthFiltersToCanvas = useCallback((ctx, w, h) => {
    if (depthLayers >= 256 && depthContrast === 1.0) return; // フィルタ不要な場合はスキップ

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      // グレースケールとして輝度を算出
      let val = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;

      // コントラスト（ガンマ）適用
      if (depthContrast !== 1.0) {
        val = Math.pow(val, depthContrast);
      }

      // 階調化（ポスタライズ）
      let finalVal;
      if (depthLayers >= 256) {
        finalVal = Math.floor(val * 255);
      } else {
        let quant = Math.round(val * (depthLayers - 1)) / (depthLayers - 1);
        finalVal = Math.floor(quant * 255);
      }

      data[i] = data[i + 1] = data[i + 2] = finalVal;
    }
    ctx.putImageData(imgData, 0, 0);
  }, [depthLayers, depthContrast]);

  /**
   * メイン・レンダリング・ループ (requestAnimationFrame)
   * UIスレッドの状態に左右されず、一貫した描画タイミングを維持します。
   */
  useEffect(() => {
    let isSubscribed = true;
    lastFrameTimeRef.current = performance.now();

    const engineLoop = (time) => {
      if (!isSubscribed) return;

      // デルタタイム（前フレームからの経過時間）の計算
      const deltaTime = time - lastFrameTimeRef.current;
      lastFrameTimeRef.current = time;

      const state = loopStateRef.current;

      // isPlaying が有効な場合のみ、コンテンツ用の時間を進める
      if (state.isPlaying) {
        accumulatedTimeRef.current += deltaTime;
      }

      // 何も動いていない場合はループを回すだけで描画はスキップ
      if (!state.isPlaying && !state.wiggleEnabled) {
        animationRef.current = requestAnimationFrame(engineLoop);
        return;
      }

      // コンテンツ描画には accumulatedTime を使用し、
      // 2.5Dゆらぎ等のエフェクト処理には継続的に進む time を使用する
      const contentTime = accumulatedTimeRef.current;

      // ソースの種類に応じて描画関数を振り分け
      if (state.depthSourceType === 'animated') {
        if (animatedDrawRef.current) animatedDrawRef.current(contentTime);
        if (processRef.current) processRef.current(time);
      } else if (videoRef.current && depthCanvasRef.current && state.depthSourceType === 'video') {
        const vid = videoRef.current;
        const ctx = depthCanvasRef.current.getContext('2d', { willReadFrequently: true });
        if (getDimensionsRef.current) {
          const { w, h } = getDimensionsRef.current(vid.videoWidth, vid.videoHeight);
          if (depthCanvasRef.current.width !== w || depthCanvasRef.current.height !== h) {
            depthCanvasRef.current.width = w; depthCanvasRef.current.height = h;
          }
          drawAspectImage(ctx, vid, w, h, vid.videoWidth, vid.videoHeight);
          // ビデオの各フレームに対しても深度フィルタを適用
          applyDepthFiltersToCanvas(ctx, w, h);
        }
        if (processRef.current) processRef.current(time);
      } else if (state.wiggleEnabled) {
        if (processRef.current) processRef.current(time);
      } else if (state.depthSourceType === 'text') {
        if (textDrawRef.current) textDrawRef.current(contentTime);
        if (processRef.current) processRef.current(time);
      }

      animationRef.current = requestAnimationFrame(engineLoop);
    };
    animationRef.current = requestAnimationFrame(engineLoop);
    return () => {
      isSubscribed = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [drawAspectImage]);

  /**
   * 深度マップ用バイナリ（画像/動画）のロード
   */
  const handleDepthUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      setDepthSourceType('video');
      videoRef.current = document.createElement('video');
      videoRef.current.src = url;
      videoRef.current.loop = true; videoRef.current.muted = true;
      videoRef.current.onloadedmetadata = () => { setIsPlaying(true); videoRef.current.play(); };
    } else {
      setDepthSourceType('image');
      setIsPlaying(false);
      const img = new Image();
      img.onload = () => {
        staticImageRef.current = img;
        const { w, h } = getTargetDimensions(img.width, img.height);
        const cvs = depthCanvasRef.current;
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d', { willReadFrequently: true });
        drawAspectImage(ctx, img, w, h, img.width, img.height);
        applyDepthFiltersToCanvas(ctx, w, h);
        triggerRender();
      };
      img.src = url;
    }
  };

  /**
   * ステレオグラムの表面（テクスチャ）パターンのロード
   */
  const handlePatternUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const cvs = patternCanvasRef.current;
      if (!cvs) return;
      cvs.width = img.width; cvs.height = img.height;
      cvs.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
      setBgType('pattern');
      triggerRender();
    };
    img.src = url;
  };

  /**
   * 画面録画の開始（WebM形式）
   */
  const startRecording = () => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;
    const stream = canvas.captureStream(30);
    const options = { mimeType: 'video/webm', videoBitsPerSecond: 20000000 };
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) options.mimeType = 'video/webm;codecs=vp9';
    else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) options.mimeType = 'video/webm;codecs=vp8';
    mediaRecorderRef.current = new MediaRecorder(stream, options);
    mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.current.push(e.data); };
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `stereogram-${Date.now()}.webm`;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); recordedChunks.current = [];
    };
    mediaRecorderRef.current.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); setIsRecording(false); }
  };

  /**
   * 現在のフレームをPNG画像として保存
   */
  const downloadImage = () => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = `stereogram-${Date.now()}.png`;
    a.click();
  };

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
        <div className="control-group">
          <h3>
            <Tooltip content="視点合わせに合わせた表示方式を選択します" showIcon={true}>
              <Settings size={18} /> 視点合わせの方式
            </Tooltip>
          </h3>
          <div className="radio-group">
            <Tooltip content="遠くを見るように焦点を合わせる方法。より深く、自然な立体に見えます。" showIcon={true}>
              <label className={method === 'parallel' ? 'active' : ''}>
                <input type="radio" value="parallel" checked={method === 'parallel'} onChange={() => setMethod('parallel')} />
                平行法 (Parallel-view)
              </label>
            </Tooltip>
            <Tooltip content="寄り目気味に焦点を合わせる方法。平行法が苦手な方でも合わせやすいです。" showIcon={true}>
              <label className={method === 'crosseye' ? 'active' : ''}>
                <input type="radio" value="crosseye" checked={method === 'crosseye'} onChange={() => setMethod('crosseye')} />
                交差法 (Cross-view)
              </label>
            </Tooltip>
          </div>
        </div>

        {/* --- 背景・模様設定 --- */}
        <div className="control-group">
          <h3>
            <Tooltip content="ステレオグラムの表面に描かれる模様を選択します。" showIcon={true}>
              <ImageIcon size={18} /> 表面のテクスチャ (模様)
            </Tooltip>
          </h3>
          <Tooltip content="砂嵐、カラー砂嵐、または画像を選択できます。" showIcon={true}>
            <select className="mb-2" value={bgType} onChange={(e) => setBgType(e.target.value)}>
              <option value="black_white">砂嵐 (白黒ドット)</option>
              <option value="color">砂嵐 (カラードット)</option>
              <option value="pattern">パターン画像を読み込む</option>
            </select>
          </Tooltip>

          {bgType === 'pattern' && (
            <div className="upload-btn-wrapper mt-2">
              <button className="btn outline">
                <Upload size={16} /> パターン画像を選択
              </button>
              <input type="file" accept="image/*" onChange={handlePatternUpload} />
            </div>
          )}
          {bgType !== 'pattern' && (
            <Tooltip content="ドットの粒を大きくすると、立体視の焦点が合わせやすくなります。" showIcon={true}>
              <label className="mt-2 block" style={{ marginTop: '12px' }}>
                ドットの大きさ ({noiseSize}px)
                <input type="range" min="1" max="10" value={noiseSize} onChange={e => setNoiseSize(Number(e.target.value))} />
              </label>
            </Tooltip>
          )}
          <canvas ref={patternCanvasRef} style={{ display: 'none' }} />
        </div>

        {/* --- 詳細パラメータ --- */}
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
        </div>

        {/* --- 深度マップ（立体の元）設定 --- */}
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
                <input type="text" value={depthText} onChange={e => setDepthText(e.target.value)} placeholder="文字を入力..." className="mt-1" />
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
                <select value={textFontFamily} onChange={e => setTextFontFamily(e.target.value)}>
                  <option value="Arial Black, sans-serif">サンセリフ (太字)</option>
                  <option value="Impact, sans-serif">インパクト</option>
                  <option value="'Brush Script MT', cursive">手書き風</option>
                  <option value="'Times New Roman', serif">明朝体 (セリフ)</option>
                </select>
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
                      <button className="btn primary block" onClick={() => setAiStatus('idle')} style={{ padding: '6px 12px', fontSize: '12px', background: '#444' }}>
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
          {((depthMode === 'ai' && aiRawDataRef.current && aiStatus === 'idle') || depthMode === 'upload') && (
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
          <div className="panel depth-panel">
            <h2>立体の形状 (深度マップ)</h2>
            <div className="canvas-container">
              <canvas ref={depthCanvasRef} className="preview-canvas" />
            </div>
          </div>

          {/* 生成結果プレビュー（PCではホバー時に案内を表示） */}
          <div className="panel output-panel">
            <h2>完成したステレオグラム</h2>
            <Tooltip content={!isMobileView ? "クリックで全画面表示" : null}>
              <div className="canvas-container" onClick={() => setFullscreenView(true)} style={{ cursor: 'pointer' }}>
                <canvas ref={outputCanvasRef} className="preview-canvas" />
              </div>
            </Tooltip>
          </div>
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
