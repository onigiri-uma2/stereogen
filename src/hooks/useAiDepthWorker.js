import { useState, useRef, useEffect, useCallback } from 'react';

const AI_MODEL_ID = 'onnx-community/depth-anything-v2-small';

export function useAiDepthWorker({ isMobileView, onInferenceComplete }) {
  const [aiStatus, setAiStatus] = useState('idle'); // 'idle', 'loading', 'inferring', 'error'
  const [aiProgress, setAiProgress] = useState(''); // 進捗メッセージ
  const [aiDownloadPercent, setAiDownloadPercent] = useState(0); // モデルDLの％
  const [aiDownloadDetail, setAiDownloadDetail] = useState(''); // DL中のファイル名など
  const [aiModelInfo, setAiModelInfo] = useState(null); // 現在ロードされているAIモデルの情報

  const workerRef = useRef(null);

  /**
   * AIモデルがブラウザのCache APIに保存されているか確認する
   * 
   * ONNX Runtime Web は初回実行時に HuggingFace からモデル（約100MB）をダウンロードし、
   * Cache API（'transformers-cache'）にキャッシュします。
   * オフライン時やリロード時にユーザーへ不必要な「ダウンロード警告」を出さないよう事前にチェックします。
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
   * AIワーカー（worker.js）からのメッセージ（通信）処理
   * 
   * メインスレッド（UI）をブロックせずに重い推論タスクやモデルのダウンロードを
   * バックグラウンドで実行し、進捗状況（progress）や結果（result）を受け取ります。
   */
  const handleWorkerMessage = useCallback((e) => {
    const { status, progress, result, error, info } = e.data;
    if (status === 'progress' && progress) {
      // モデルダウンロードの進捗表示
      setAiDownloadDetail(prev => {
         const fileName = progress.file?.split('/').pop() || progress.file || prev || '';
         return fileName;
      });
      const fileName = progress.file?.split('/').pop() || progress.file || '';
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
      setAiStatus(prev => (prev === 'inferring' ? 'inferring' : 'idle'));
    } else if (status === 'inferring') {
      setAiStatus('inferring');
      setAiProgress('AIが深度を推定しています...');
    } else if (status === 'error') {
      setAiStatus('error');
      setAiProgress(`エラー: ${error}`);
      setAiDownloadPercent(0);
    } else if (status === 'complete') {
      setAiStatus('idle');
      setAiDownloadPercent(0);
      setAiDownloadDetail('');
      if (onInferenceComplete) {
        onInferenceComplete(result);
      }
    }
  }, [onInferenceComplete]);

  /**
   * WebWorkerの初期化と後始末（コンポーネントマウント時）
   * 
   * Viteの機能 `new Worker(new URL(..., import.meta.url))` を利用し、
   * 別スレッドで `worker.js` を初期化します。
   */
  useEffect(() => {
    workerRef.current = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
    workerRef.current.addEventListener('message', handleWorkerMessage);

    // 既にモデルがダウンロード済みであればバックグラウンドで起動
    checkIfModelCached().then(isCached => {
      if (isCached && workerRef.current) {
        workerRef.current.postMessage({ command: 'load' });
      }
    });

    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, [handleWorkerMessage]);

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
    workerRef.current = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
    workerRef.current.addEventListener('message', handleWorkerMessage);
  }, [handleWorkerMessage]);

  /**
   * 画像アップロードによるAI推論の開始
   */
  const handleAiUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isCached = await checkIfModelCached();
    if (!isCached) {
      const isMobile = isMobileView || /Mobi|Android|iPhone/i.test(navigator.userAgent);
      const warningTitle = '⚠️ AI画像解析の準備';
      const warningBody = isMobile
        ? '解析に必要なAIモデル（約 100MB）をダウンロードします。\nパケット通信量にご注意ください。'
        : '解析に必要なAIモデル（約 100MB）をロードします。';

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

  return {
    aiStatus,
    setAiStatus,
    aiProgress,
    aiDownloadPercent,
    aiModelInfo,
    handleAiUpload,
    cancelAiProcessing
  };
}
