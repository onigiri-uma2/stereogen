import { useState, useRef } from 'react';

export function useMediaExport(outputCanvasRef) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunks = useRef([]);

  /**
   * 画面録画の開始（WebM形式）
   */
  const startRecording = () => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;
    const stream = canvas.captureStream(30);
    // 録画設定 (ビットレート 20Mbpsで高画質を確保)
    const options = { mimeType: 'video/webm', videoBitsPerSecond: 20000000 };
    
    // ブラウザごとの互換性を保つためのコーデックのフォールバック機構
    // 高圧縮・高画質な vp9 を優先し、非対応（古いブラウザや一部のSafari等）なら vp8 にフォールバックします。
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      options.mimeType = 'video/webm;codecs=vp9';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      options.mimeType = 'video/webm;codecs=vp8';
    }
    mediaRecorderRef.current = new MediaRecorder(stream, options);
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.current.push(e.data);
    };
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; 
      a.download = `stereogram-${Date.now()}.webm`;
      document.body.appendChild(a); 
      a.click();
      URL.revokeObjectURL(url); 
      recordedChunks.current = [];
    };
    mediaRecorderRef.current.start();
    setIsRecording(true);
  };

  /**
   * 画面録画の停止
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  /**
   * 現在のフレームをPNG画像として保存
   */
  const downloadImage = () => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; 
    a.download = `stereogram-${Date.now()}.png`;
    a.click();
  };

  return {
    isRecording,
    startRecording,
    stopRecording,
    downloadImage,
  };
}
