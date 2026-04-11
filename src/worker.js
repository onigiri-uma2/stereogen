/**
 * Web Worker: AI深度推定プロセス
 * メインスレッドのUIをブロックせずに、重いAI推論処理をバックグラウンドで実行します。
 */
import { pipeline, env } from '@huggingface/transformers';

// ローカルモデルの使用を無効化（常にHugging Face Hubから最新モデルを取得）
env.allowLocalModels = false;

// 本番環境（GitHub Pages等のサブフォルダ）のみ、WASMファイルの読み取り先を指定
if (self.location.href.includes('/assets/')) {
  const baseUrl = self.location.href.substring(0, self.location.href.lastIndexOf('/assets/')) + '/';
  env.backends.onnx.wasm.wasmPaths = baseUrl;
}

// 互換性設定: SharedArrayBuffer が利用不可な環境（GitHub Pagesなど）への対応
// COOP/COEPヘッダーが設定できないサーバーでは、ONNX runtimeがハングするのを防ぐため
// シングルスレッドのWASMモードを強制します。
try {
  if (typeof SharedArrayBuffer === 'undefined') {
    env.backends.onnx.wasm.numThreads = 1;
    // Worker内Worker（Proxy）を無効化して安定性を高める
    env.backends.onnx.wasm.proxy = false;
  }
} catch (e) {
  // 設定パスが存在しない場合はデフォルト設定を使用
}

/**
 * PipelineSingleton クラス
 * AIモデルのインスタンスをシングルトンとして管理し、再利用します。
 */
class PipelineSingleton {
  static task = 'depth-estimation';
  static model = 'onnx-community/depth-anything-v2-small';
  static instance = null;
  static initializationPromise = null;

  /**
   * インスタンスを取得する。未作成の場合は初期化を行う。
   * プロミスロックにより、同時に複数のリクエストが来ても初期化は一度だけ実行されます。
   */
  static async getInstance(progress_callback = null) {
    if (this.instance) {
      return this.instance;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      const opts = { progress_callback };
      
      if (typeof SharedArrayBuffer === 'undefined') {
        opts.device = 'wasm';
        opts.dtype = 'fp32';
      } else {
        opts.dtype = 'fp32';
      }
      
      try {
        this.instance = await pipeline(this.task, this.model, opts);
        return this.instance;
      } catch (err) {
        this.initializationPromise = null; // エラー時はリトライ可能にする
        throw err;
      }
    })();

    return this.initializationPromise;
  }
}

/**
 * メインスレッドからのメッセージ待受
 */
self.addEventListener('message', async (event) => {
  const { id, command, image } = event.data;

  // 'load' コマンド: モデルの事前ロード
  if (command === 'load') {
    try {
      // 進行状況をメインスレッドに通知
      self.postMessage({ status: 'progress', progress: { status: 'initiate', file: 'AIエンジンを初期化中...' } });
      
      await PipelineSingleton.getInstance(x => {
        // ダウンロードやロードの進捗を転送
        self.postMessage({ status: 'progress', progress: x });
      });
      
      const instance = await PipelineSingleton.getInstance();
      
      // モデル情報の詳細を返す (App.jsxで表示用)
      self.postMessage({ 
        id, 
        status: 'ready', 
        info: {
          model: PipelineSingleton.model,
          dtype: '32-bit (Full Precision)',
          device: 'WebAssembly (WASM)' // 現在はWASM固定だが、将来の拡張性のため
        }
      });
    } catch (err) {
      console.error('Worker load error:', err);
      self.postMessage({ id, status: 'error', error: err.message || String(err) });
    }
  } 
  // 'predict' コマンド: 画像から深度マップを生成
  else if (command === 'predict') {
    try {
      const estimator = await PipelineSingleton.getInstance();
      
      self.postMessage({ id, status: 'inferring' });
      
      // AI推論の実行
      const result = await estimator(image);
      
      // 推論結果（RawImageオブジェクト）からデータを抽出
      // result.depth には .data (ピクセル配列), .width, .height が含まれる
      const depthImage = result.depth;
      
      // メインスレッドに完了通知とデータを送る
      self.postMessage({ 
        id, 
        status: 'complete', 
        result: {
            data: depthImage.data,
            width: depthImage.width,
            height: depthImage.height
        }
      });
      
    } catch (err) {
      console.error('Worker predict error:', err);
      self.postMessage({ id, status: 'error', error: err.message || String(err) });
    }
  }
});

