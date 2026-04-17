import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { generateStereogram, applyWiggleToDepthMap } from '../stereogram';

export function useStereoLoop({
  method, bgType, noiseSize, separation, depthFactor, showGuideDots, guideDotSize,
  textPatternChars, textPatternSize, textPatternDensity, textPatternColor,
  depthMode, depthSourceType, setDepthSourceType,
  defaultShape, animatedShape,
  isPlaying, setIsPlaying, wiggleEnabled,
  depthLayers, depthContrast,
  depthText, textFontSize, textFontFamily, textScrollSpeed, textSoftness, textDepth,
  outputResolution,
  depthCanvasRef, patternCanvasRef, outputCanvasRef, fullscreenCanvasRef,
  videoRef, staticImageRef, aiRawDataRef,
  fullscreenView, setBgType
}) {

  const accumulatedTimeRef = useRef(0);
  const animationRef = useRef(null);
  const lastFrameTimeRef = useRef(performance.now());
  const processRef = useRef();
  const animatedDrawRef = useRef();
  const getDimensionsRef = useRef();
  const textDrawRef = useRef(null);

  const getTargetDimensions = useCallback((sourceW, sourceH) => {
    if (outputResolution === 'auto') return { w: sourceW || 800, h: sourceH || 600 };
    const [sw, sh] = outputResolution.split('x').map(Number);
    return { w: sw, h: sh };
  }, [outputResolution]);

  /**
   * 画像をアスペクト比を維持したまま Canvas に描画するヘルパー
   * 背景を黒で塗りつぶした後、中央寄せ（Object-fit: contain 相当）で描画します。
   */
  const drawAspectImage = useCallback((ctx, img, canvasW, canvasH, sourceW, sourceH) => {
    // 縦横どちらの比率に合わせるべきかを計算
    const scale = Math.min(canvasW / sourceW, canvasH / sourceH);
    const rw = sourceW * scale;
    const rh = sourceH * scale;

    // 背景をクリアしてから描画
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, (canvasW - rw) / 2, (canvasH - rh) / 2, rw, rh);
  }, []);

  const triggerRender = useCallback(() => {
    if (processRef.current) processRef.current();
  }, []);

  /**
   * 深度マップ（Canvas）に対して、コントラスト調整と階調化（ポスタライズ）を適用します。
   * - depthContrast: ガンマ補正のように累算(pow)を用いて、暗部や明部の強調度合を変えます。
   * - depthLayers: 深度を段階的に制限することで、段々畑のような立体効果を作成できます。
   */
  const applyDepthFiltersToCanvas = useCallback((ctx, w, h) => {
    if (depthLayers >= 256 && depthContrast === 1.0) return;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      // RGBの平均値を輝度(0.0 - 1.0)として取得
      let val = (data[i] + data[i + 1] + data[i + 2]) / 3 / 255;
      
      // コントラスト（ガンマ補正代わり）の適用
      if (depthContrast !== 1.0) val = Math.pow(val, depthContrast);
      
      let finalVal;
      if (depthLayers >= 256) {
        finalVal = Math.floor(val * 255);
      } else {
        // 階調化ロジック: 指定されたステップ数に丸める
        let quant = Math.round(val * (depthLayers - 1)) / (depthLayers - 1);
        finalVal = Math.floor(quant * 255);
      }
      data[i] = data[i + 1] = data[i + 2] = finalVal;
    }
    ctx.putImageData(imgData, 0, 0);
  }, [depthLayers, depthContrast]);

  /**
   * AI（Depth-Anything-V2）から返された生の数値データ（float）を正規化し、フィルタを適用して Canvas に描画します。
   * モデルの出力値は輝度ではないため、画面内の最小値と最大値を使って 0-255 の範囲に正規化しています。
   */
  const applyAiFiltersAndDraw = useCallback(() => {
    if (!aiRawDataRef.current || !depthCanvasRef.current) return;
    const { data, width: rawW, height: rawH } = aiRawDataRef.current;

    const channels = Math.round(data.length / (rawW * rawH)) || 1;
    let min = Infinity, max = -Infinity;
    // 最小値と最大値を走査
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
      let norm = (val - min) / range;
      norm = Math.pow(norm, depthContrast);
      let finalVal;
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

    const canvas = depthCanvasRef.current;
    const { w, h } = getTargetDimensions(rawW, rawH);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    drawAspectImage(ctx, tempCanvas, w, h, rawW, rawH);
    triggerRender();
  }, [depthLayers, depthContrast, getTargetDimensions, triggerRender, drawAspectImage, aiRawDataRef, depthCanvasRef]);

  // 深度フィルタのスライダー変更時
  useEffect(() => {
    if (depthMode === 'ai' && aiRawDataRef.current) {
      applyAiFiltersAndDraw();
    } else if (depthSourceType === 'image' && staticImageRef.current) {
      const img = staticImageRef.current;
      const { w, h } = getTargetDimensions(img.width, img.height);
      const cvs = depthCanvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      drawAspectImage(ctx, img, w, h, img.width, img.height);
      applyDepthFiltersToCanvas(ctx, w, h);
      triggerRender();
    }
  }, [depthLayers, depthContrast, depthMode, depthSourceType, applyAiFiltersAndDraw, triggerRender, getTargetDimensions, drawAspectImage, applyDepthFiltersToCanvas, staticImageRef, depthCanvasRef, aiRawDataRef]);

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

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        let depth = 0;

        if (defaultShape === 'torus') {
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
          if (dist < maxR) {
            const z = Math.sqrt(maxR * maxR - dist * dist);
            depth = Math.floor((z / maxR) * 255);
          }
        } else if (defaultShape === 'pyramid') {
          const mDist = Math.max(Math.abs(dx), Math.abs(dy));
          const pSize = Math.min(w, h) * 0.35;
          if (mDist < pSize) depth = Math.floor((1 - mDist / pSize) * 255);
        } else if (defaultShape === 'ripple') {
          if (dist < maxR) {
            const envelope = 1 - (dist / maxR);
            const wave = (Math.sin(dist / 10) + 1) / 2;
            depth = Math.floor(wave * envelope * 255);
          }
        } else if (defaultShape === 'stairs') {
          if (dist < maxR) {
            const steps = 6;
            depth = Math.floor(Math.floor((1 - dist / maxR) * steps) / steps * 255);
          }
        } else if (defaultShape === 'heart') {
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
            const maxD = 0.35355339;
            const dNorm = Math.min(-sdf, maxD);
            const z = Math.sqrt(maxD * maxD - Math.pow(maxD - dNorm, 2));
            depth = Math.floor((z / maxD) * 255);
          }
        } else if (defaultShape === 'star') {
          let a = Math.atan2(dx, -dy);
          a = Math.abs(a);
          const segmentAngle = Math.PI / 5;
          a = a % (2 * segmentAngle);
          if (a > segmentAngle) a = 2 * segmentAngle - a;
          const rOuter = maxR * 0.95;
          const rInner = rOuter * 0.45;
          const p1x = 0; const p1y = rOuter;
          const p2x = rInner * Math.sin(segmentAngle);
          const p2y = rInner * Math.cos(segmentAngle);
          const Vx = p2x - p1x; const Vy = p2y - p1y;
          const len = Math.sqrt(Vx * Vx + Vy * Vy);
          const Nx = -Vy / len; const Ny = Vx / len;
          const D = p1x * Nx + p1y * Ny;
          const px = dist * Math.sin(a); const py = dist * Math.cos(a);
          const dEdge = D - (px * Nx + py * Ny);
          if (dEdge > 0) depth = Math.floor((dEdge / D) * 255);
        }

        if (depth > 0) {
          const idx = (y * w + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = depth;
          data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [getTargetDimensions, defaultShape, depthCanvasRef]);

  /**
   * プリセットのアニメーションシェイプ（ウェーブ、パルスなど）の深度マップを Canvas に描画します。
   * 時間 (time) に応じて動的に形状が変化します。
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
          const len = Math.sqrt(Vx * Vx + Vy * Vy);
          const Nx = -Vy / len; const Ny = Vx / len;
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
  }, [getTargetDimensions, animatedShape, depthCanvasRef]);

  /**
   * ユーザー入力テキスト（複数行対応）から深度マップを生成し、Canvas に描画します。
   * テキストのアウトラインぼかし（textSoftness）を用いて、ドロップシャドウや丸みのある立体感を演出します。
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

    if (textSoftness > 0) {
      ctx.filter = `blur(${textSoftness}px)`;
    }

    const brightness = Math.min(255, Math.max(0, textDepth));
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;

    const lines = depthText.split('\n');
    const lineHeight = textFontSize * 1.2;

    let maxTextW = 0;
    lines.forEach(line => {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxTextW) maxTextW = metrics.width;
    });

    let x = canvasW / 2;
    if (textScrollSpeed > 0) {
      const speed = 0.1 * textScrollSpeed;
      const totalDist = canvasW + maxTextW;
      const initialOffset = (canvasW + maxTextW) / 2;
      const offset = (time * speed + initialOffset) % totalDist;
      x = canvasW - offset + maxTextW / 2;
    }

    const firstLineMetrics = ctx.measureText(lines[0] || '');
    const ascent = firstLineMetrics.actualBoundingBoxAscent || (textFontSize * 0.75);
    const lastLineMetrics = ctx.measureText(lines[lines.length - 1] || '');
    const descent = lastLineMetrics.actualBoundingBoxDescent || (textFontSize * 0.25);
    const blockHeight = Math.max(0, lines.length - 1) * lineHeight + ascent + descent;

    let currentY = (canvasH - blockHeight) / 2 + ascent;
    lines.forEach((line) => {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    });
    ctx.filter = 'none';
  }, [depthText, textFontSize, textFontFamily, textScrollSpeed, textSoftness, textDepth, getTargetDimensions, depthCanvasRef]);

  // モード切替時の初期化
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
      accumulatedTimeRef.current = 0;
      setTimeout(() => {
        if (textDrawRef.current) textDrawRef.current(0);
        triggerRender();
      }, 0);
    }
  }, [depthMode, triggerRender, drawDefaultDepthMap, setDepthSourceType, setIsPlaying]);

  // 動画再生制御
  useEffect(() => {
    if (depthSourceType === 'video' && videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => { });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, depthSourceType, videoRef]);

  // テキスト更新時の同期
  useEffect(() => {
    if (depthMode === 'text') {
      drawTextDepthMap(accumulatedTimeRef.current);
      triggerRender();
    }
  }, [depthText, textFontSize, textFontFamily, textSoftness, textDepth, drawTextDepthMap, triggerRender, depthMode]);

  // 再描画ループの状態管理 (Closureの罠を避けるためのRef)
  const loopStateRef = useRef({ isPlaying, depthSourceType, wiggleEnabled });
  useEffect(() => {
    loopStateRef.current = { isPlaying, depthSourceType, wiggleEnabled };
  }, [isPlaying, depthSourceType, wiggleEnabled]);

  // 設定変更による自動無音再描画
  useEffect(() => {
    if (!isPlaying && !wiggleEnabled) {
      triggerRender();
    }
  }, [method, bgType, separation, depthFactor, noiseSize, wiggleEnabled, showGuideDots, guideDotSize, isPlaying, triggerRender, textPatternChars, textPatternSize, textPatternDensity, textPatternColor]);

  // 全画面表示の同期
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
  }, [fullscreenView, outputCanvasRef, fullscreenCanvasRef]);

  // 設定変更時の再描画トリガー (画像・通常・AI)
  useEffect(() => {
    if (depthSourceType === 'image' && staticImageRef.current) {
      const img = staticImageRef.current;
      const { w, h } = getTargetDimensions(img.width, img.height);
      const cvs = depthCanvasRef.current;
      if (!cvs) return;
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
  }, [outputResolution, depthSourceType, depthMode, defaultShape, getTargetDimensions, applyAiFiltersAndDraw, triggerRender, drawAspectImage, applyDepthFiltersToCanvas, depthLayers, depthContrast, staticImageRef, depthCanvasRef, aiRawDataRef, drawDefaultDepthMap, drawTextDepthMap]);


  // 生成のコア（processFrame）
  const processFrame = useCallback((time = performance.now()) => {
    const depthCanvas = depthCanvasRef.current;
    const patternCanvas = patternCanvasRef.current;
    const outputCanvas = outputCanvasRef.current;

    if (!depthCanvas || !outputCanvas) return;
    const w = depthCanvas.width;
    const h = depthCanvas.height;
    if (w === 0 || h === 0) return;

    const scale = (bgType === 'color' || bgType === 'black_white') ? noiseSize : 1;
    const effectiveW = Math.max(1, Math.floor(w / scale));
    const effectiveH = Math.max(1, Math.floor(h / scale));
    const finalW = effectiveW * scale;
    const finalH = effectiveH * scale;

    if (outputCanvas.width !== finalW) outputCanvas.width = finalW;
    if (outputCanvas.height !== finalH) outputCanvas.height = finalH;

    const tempDepthCvs = document.createElement('canvas');
    tempDepthCvs.width = effectiveW;
    tempDepthCvs.height = effectiveH;
    const tCtx = tempDepthCvs.getContext('2d', { willReadFrequently: true });
    tCtx.drawImage(depthCanvas, 0, 0, w, h, 0, 0, effectiveW, effectiveH);
    const depthData = tCtx.getImageData(0, 0, effectiveW, effectiveH).data;

    let finalDepthData = depthData;
    if (loopStateRef.current.wiggleEnabled) {
      finalDepthData = applyWiggleToDepthMap(depthData, effectiveW, effectiveH, time);
    }

    const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });

    if (bgType === 'text_pattern') {
      outCtx.fillStyle = '#FFFFFF';
      outCtx.fillRect(0, 0, finalW, finalH);

      if (textPatternChars) {
        const charsArr = Array.from(textPatternChars);
        const actualSeparation = Math.max(1, Math.round(separation / scale)) * scale;
        const seedCount = Math.floor((actualSeparation * finalH / (textPatternSize * textPatternSize)) * (textPatternDensity / 100) * 1.5);

        const seedsByY = {};
        for (let i = 0; i < seedCount; i++) {
          let y = Math.floor(Math.random() * finalH);
          let x = Math.floor(Math.random() * finalW);
          let char = charsArr[Math.floor(Math.random() * charsArr.length)];

          let color;
          if (textPatternColor === 'monochrome') {
            color = '#000000';
          } else if (textPatternColor === 'grayscale') {
            const v = Math.floor(Math.random() * 150);
            color = `rgb(${v},${v},${v})`;
          } else if (textPatternColor === 'neon') {
            const hue = Math.floor(Math.random() * 360);
            color = `hsl(${hue}, 100%, 50%)`;
          } else if (textPatternColor === 'pastel') {
            const hue = Math.floor(Math.random() * 360);
            color = `hsl(${hue}, 70%, 80%)`;
          } else if (textPatternColor === 'autumn') {
            const hue = Math.floor(Math.random() * 60);
            color = `hsl(${hue}, 80%, 40%)`;
          } else if (textPatternColor === 'ocean') {
            const hue = 180 + Math.floor(Math.random() * 80);
            color = `hsl(${hue}, 80%, 45%)`;
          } else {
            const r = Math.floor(Math.random() * 200);
            const g = Math.floor(Math.random() * 200);
            const b = Math.floor(Math.random() * 200);
            color = `rgb(${r},${g},${b})`;
          }

          let alpha = 0.8 + Math.random() * 0.2;

          if (!seedsByY[y]) seedsByY[y] = [];
          seedsByY[y].push({ x, char, color, alpha });
        }

        const stamps = [];
        const same = new Int32Array(finalW);

        for (const yStr of Object.keys(seedsByY)) {
          const y = Number(yStr);

          // ====================================================================================
          // ThimblebyのSymmetric Linking（対象リンクアルゴリズム）の適用
          // 従来のピクセル単位のサンプリングとは異なり、「文字（オブジェクト）がどの深さに描画されるべきか」
          // を横方向のピクセル拘束条件から逆算します。
          // これにより、文字スタンプを複数描画した際にも、ステレオグラムの視差整合性が担保されます。
          // ====================================================================================

          // 初期化: 各ピクセルは自分自身（root）を指す
          for (let x = 0; x < finalW; x++) same[x] = x;

          // 視差の拘束条件を伝播させる
          for (let x = 0; x < finalW; x++) {
            // 現在のピクセルの深さZ（0.0 ~ 1.0）
            let z = finalDepthData[(y * finalW + x) * 4] / 255.0;

            // 視差(d)を計算。平行法(parallel)と交差法(crosseye)で計算を分離。
            // depthFactor は視差の強度（ユーザー設定）。
            let d = (method === 'parallel') ? actualSeparation * (1 - depthFactor * z) : actualSeparation * (1 + depthFactor * z);

            // 左右の対応するピクセル位置を計算
            let left = Math.floor(x - d / 2);
            let right = Math.floor(left + d);

            // 画面内に収まるペアのみをリンク（結合）する
            if (left >= 0 && right < finalW) {
              // Union-Find木の構造：現在のrootを探す
              let l = left; while (same[l] !== l) l = same[l];
              let r = right; while (same[r] !== r) r = same[r];

              // 異なるグループに属している場合、同一のグループとして統合する
              if (l !== r) {
                if (l < r) same[r] = l; else same[l] = r;
              }
            }
          }

          // リンクの完全な平坦化（ルート解決）
          // 各ピクセルが最終的にどの「ルートピクセル」に紐づくかを解決し、直接参照できるようにする
          for (let x = 0; x < finalW; x++) {
            let root = x; while (same[root] !== root) root = same[root];
            same[x] = root;
          }

          // この行に出現する文字シードを、解決されたルートに集約。
          // 複数のピクセルが同じルートを持つ場合、1つの文字がリピートして描画される（視差の形成）
          const processedRoots = new Set();
          for (const seed of seedsByY[y]) {
            const root = same[seed.x];
            // 既に同じルートのグループが処理済みならスキップ
            if (processedRoots.has(root)) continue;
            processedRoots.add(root);

            const drawXs = [];
            for (let x = 0; x < finalW; x++) {
              if (same[x] === root) drawXs.push(x);
            }

            const z = finalDepthData[(y * finalW + root) * 4] / 255.0;
            stamps.push({ drawXs, y, z, char: seed.char, color: seed.color, alpha: seed.alpha });
          }
        }

        // Z値順（奥から手前）にソートして、手前の文字が上に描画されるようにする
        stamps.sort((a, b) => a.z - b.z);

        outCtx.font = `bold ${textPatternSize}px sans-serif`;
        outCtx.textAlign = 'center';
        outCtx.textBaseline = 'middle';

        for (let s of stamps) {
          outCtx.fillStyle = s.color;
          outCtx.globalAlpha = s.alpha;
          for (let drawX of s.drawXs) {
            outCtx.fillText(s.char, drawX, s.y);
          }
        }
        outCtx.globalAlpha = 1.0;
      }
    } else {
      let patternData = null;
      let pW = 0; let pH = 0;
      if (bgType === 'pattern' && patternCanvas && patternCanvas.width > 0) {
        pW = patternCanvas.width;
        pH = patternCanvas.height;
        patternData = patternCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, pW, pH).data;
      }

      const outputImgData = generateStereogram(finalDepthData, effectiveW, effectiveH, {
        separation: Math.max(1, Math.round(separation / scale)),
        depthFactor,
        method,
        noiseType: bgType === 'color' ? 'color' : 'grayscale',
        patternData,
        patternWidth: pW,
        patternHeight: pH,
        seed: Math.floor(time / 50),
        smoothing: bgType === 'pattern'
      });

      const tempStereoCvs = document.createElement('canvas');
      tempStereoCvs.width = effectiveW;
      tempStereoCvs.height = effectiveH;
      const tsCtx = tempStereoCvs.getContext('2d', { willReadFrequently: true });
      tsCtx.putImageData(new ImageData(outputImgData, effectiveW, effectiveH), 0, 0);

      outCtx.imageSmoothingEnabled = false;
      outCtx.drawImage(tempStereoCvs, 0, 0, finalW, finalH);
    }

    if (showGuideDots) {
      const actualSeparation = Math.max(1, Math.round(separation / scale)) * scale;
      const dotRadius = guideDotSize;
      const dotY = Math.max(20 + dotRadius, Math.floor(finalH * 0.05));
      const centerX = finalW / 2;

      outCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      outCtx.beginPath(); outCtx.arc(centerX - actualSeparation / 2, dotY, dotRadius + 2, 0, Math.PI * 2); outCtx.fill();
      outCtx.beginPath(); outCtx.arc(centerX + actualSeparation / 2, dotY, dotRadius + 2, 0, Math.PI * 2); outCtx.fill();

      outCtx.fillStyle = '#111827';
      outCtx.beginPath(); outCtx.arc(centerX - actualSeparation / 2, dotY, dotRadius, 0, Math.PI * 2); outCtx.fill();
      outCtx.beginPath(); outCtx.arc(centerX + actualSeparation / 2, dotY, dotRadius, 0, Math.PI * 2); outCtx.fill();
    }
  }, [bgType, noiseSize, separation, depthFactor, method, showGuideDots, guideDotSize, depthCanvasRef, patternCanvasRef, outputCanvasRef, loopStateRef, textPatternChars, textPatternSize, textPatternDensity, textPatternColor]);

  useLayoutEffect(() => { processRef.current = processFrame; });
  useLayoutEffect(() => { animatedDrawRef.current = drawAnimatedDepthMap; });
  useLayoutEffect(() => { getDimensionsRef.current = getTargetDimensions; });
  useLayoutEffect(() => { textDrawRef.current = drawTextDepthMap; });

  // ====================================================================================
  // メイン描画ループ (requestAnimationFrame)
  // 
  // 【クロージャの罠についての注意書き】
  // Reactの `useEffect` 内で `requestAnimationFrame` のループを回す際、ループ内でステート
  // （isPlayingなど）を直接参照すると、初回実行時の古いクロージャ値に束縛され一生更新されません。
  // それを防ぐため、常に最新の値を持つ `loopStateRef` および最新の関数参照を持つ
  // 各種 `processRef` や `animatedDrawRef` にアクセスすることで安全にループを継続しています。
  // ====================================================================================
  useEffect(() => {
    let isSubscribed = true;
    lastFrameTimeRef.current = performance.now();

    const engineLoop = (time) => {
      if (!isSubscribed) return;
      const deltaTime = time - lastFrameTimeRef.current;
      lastFrameTimeRef.current = time;

      const state = loopStateRef.current;
      if (state.isPlaying) accumulatedTimeRef.current += deltaTime;

      if (!state.isPlaying && !state.wiggleEnabled) {
        animationRef.current = requestAnimationFrame(engineLoop);
        return;
      }

      const contentTime = accumulatedTimeRef.current;

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
  }, [drawAspectImage, applyDepthFiltersToCanvas, depthCanvasRef, videoRef]);

  /**
   * 深度マップ用バイナリ（画像/動画）のロード
   */
  const handleDepthUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      setDepthSourceType('video');
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src'); // unload previous
      }
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
        if (!cvs) return;
        cvs.width = w; cvs.height = h;
        const ctx = cvs.getContext('2d', { willReadFrequently: true });
        drawAspectImage(ctx, img, w, h, img.width, img.height);
        applyDepthFiltersToCanvas(ctx, w, h);
        triggerRender();
      };
      img.src = url;
    }
  }, [setDepthSourceType, setIsPlaying, getTargetDimensions, drawAspectImage, applyDepthFiltersToCanvas, triggerRender, depthCanvasRef, staticImageRef, videoRef]);

  const handlePatternUpload = useCallback((e) => {
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
  }, [patternCanvasRef, setBgType, triggerRender]);

  return {
    handleDepthUpload,
    handlePatternUpload,
    applyAiFiltersAndDraw
  };
}
