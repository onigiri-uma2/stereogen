/**
 * ステレオグラム生成エンジン
 */

/**
 * ステレオグラムの画像を生成する
 * 
 * @param {Uint8ClampedArray} depthData - 深度マップのピクセルデータ (0-255)
 * @param {number} width - 画像の幅
 * @param {number} height - 画像の高さ
 * @param {object} options - 生成オプション（separation, depthFactor, method, patternData等）
 * @returns {Uint8ClampedArray} 生成されたステレオグラムの画像データ
 */
export function generateStereogram(depthData, width, height, options) {
  const outputFrame = new Uint8ClampedArray(width * height * 4);

  // パラメータの初期化
  const separation = options.separation || 150; // 基本のズレ量（目の幅に相当）
  const depthFactor = options.depthFactor || 0.33; // 深度の強調度
  const method = options.method || 'parallel'; // 平行法(parallel)か交差法(cross)か
  const patternData = options.patternData;    // 背景パターン画像を使う場合
  const pW = options.patternWidth;
  const pH = options.patternHeight;
  const isColorNoise = options.noiseType === 'color'; // カラーノイズか白黒ノイズか
  const seed = options.seed || 0; // ノイズ生成用のシード値（アニメーション用）

  // Thimbleby等のアルゴリズムで使用するリンク配列
  // same[x] は、x座標のピクセルがどの座標のピクセルと同じ色であるべきかを示す
  const same = new Int32Array(width);
  const rowZ = new Float32Array(width); // 現在の行の深度情報を保持

  for (let y = 0; y < height; y++) {
    // 1. リンクの初期化
    // 全てのピクセルを「自分自身と同じ色」として初期化し、深度データを読み込む
    for (let x = 0; x < width; x++) {
      same[x] = x;
      rowZ[x] = depthData[(y * width + x) * 4] / 255.0; // 0.0 ~ 1.0 に正規化
    }

    // 2. 対称リンク処理 (Symmetric Thimbleby Linking)
    // 各ピクセル x に対して、適切な視差(d)を持つ左右のピクセルを結合する
    for (let x = 0; x < width; x++) {
      const z = rowZ[x];
      let d = 0;

      // 平行法と交差法で視差の計算方向を逆にする
      if (method === 'parallel') {
        // 深度が深い（zが大きい）ほど、視差(d)を小さくする -> 前に飛び出して見える
        d = Math.round(separation * (1 - depthFactor * z));
      } else {
        // 交差法はその逆
        d = Math.round(separation * (1 + depthFactor * z));
      }

      // xを中心として、視差dの半分ずつ左右に離れた地点(left, right)を同じ色にする
      const left = x - Math.floor(d / 2);
      const right = left + d;

      if (left >= 0 && right < width) {
        // 既にどこかとリンクされている場合は、その根本（ルーツ）を探す
        let l = left; while (same[l] !== l) l = same[l];
        let r = right; while (same[r] !== r) r = same[r];

        // 左右のルーツが異なる場合、それらを結合する（同じ色にする）
        if (l !== r) {
          if (l < r) same[r] = l;
          else same[l] = r;
        }
      }
    }

    // 3. 描画パス
    // 決定したリンク構造に基づき、各ピクセルに実際の色（ドットまたはパターン）を割り当てる
    for (let x = 0; x < width; x++) {
      // 現在のピクセルが属するリンクの「根本(root)」を見つける
      let root = x; while (same[root] !== root) root = same[root];
      let r, g, b, a = 255;

      // 安定性のためのハイブリッド・シーディング:
      // - 背景 (z=0): 固定されたグリッド座標を使用して、背景がチラつかないようにする
      // - オブジェクト (z>0): root座標（リンクの根本）を使用して、テクスチャが立体に追従するようにする
      let stableX = root;
      if (rowZ[root] === 0) {
        stableX = root % separation; // 背景を規則的なパターンで固定
      }

      if (patternData && pW && pH) {
        // 外部パターン画像を使用する場合
        const pX = stableX % pW;
        const pY = y % pH;
        const pIdx = (pY * pW + pX) * 4;
        r = patternData[pIdx]; g = patternData[pIdx + 1]; b = patternData[pIdx + 2]; a = patternData[pIdx + 3];
      } else {
        // ノイズ（砂嵐）を使用する場合
        // 擬似乱数(ハッシュ関数)を用いてピクセルの色を決定する
        // 'seed' を含めることで、アニメーション時に全体に動き（キラキラ感）を出せる
        let h = Math.imul(stableX ^ 0x1234567, 0x9E3779B1) +
          Math.imul(y ^ 0x7654321, 0x85EBCA77) +
          Math.imul(seed ^ 0xABCDEF, 0xC2B2AE35);

        h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE3D); h ^= h >>> 16;

        if (isColorNoise) {
          r = h & 0xFF; g = (h >>> 8) & 0xFF; b = (h >>> 16) & 0xFF;
        } else {
          const val = (h & 0x1) ? 255 : 0; r = val; g = val; b = val;
        }
      }

      const outIdx = (y * width + x) * 4;
      outputFrame[outIdx] = r;
      outputFrame[outIdx + 1] = g;
      outputFrame[outIdx + 2] = b;
      outputFrame[outIdx + 3] = a;
    }
  }

  return outputFrame;
}

/**
 * 深度マップに「ゆらぎ（Wiggle）」効果を適用して、2.5D的なアニメーションを作成する
 * 
 * @param {Uint8ClampedArray} sourceData - 元の深度データ
 * @param {number} width - 幅
 * @param {number} height - 高さ
 * @param {number} time - 経過時間
 * @returns {Uint8ClampedArray} 2.5Dに変換された深度データ
 */
export function applyWiggleToDepthMap(sourceData, width, height, time) {
  // 正弦波で角度(theta)を計算し、左右の傾きを作る
  const theta = Math.sin(time / 600) * 0.35;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const zScale = (width * 0.3) / 255.0; // 深度値を実際の距離に変換するスケール
  const outData = new Uint8ClampedArray(width * height * 4);
  const zBuffer = new Uint8Array(width * height);

  // ステップ1: 各ピクセルを傾いた座標に投影する
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const sz = sourceData[idx]; // 深度値を取得
      if (sz === 0) continue; // 背景ならスキップ

      const cx = x - width / 2; // 中心からの相対X座標
      const Z = sz * zScale;    // 実際の奥行き距離

      // Y軸中心の回転行列を適用 (X_new = X*cos - Z*sin 的な計算)
      const nx = cx * cosT + Z * sinT;
      const dx = Math.round(nx + width / 2); // キャンバス上の新しいX座標

      if (dx >= 0 && dx < width) {
        const outIdx = y * width + dx;
        // 重なりがある場合は、より手前の（深度が大きい）値を優先する（Z-buffer的な処理）
        if (sz > zBuffer[outIdx]) zBuffer[outIdx] = sz;
      }
    }
  }

  // ステップ2: 投影によって生じた隙間を埋める（簡単なポスト処理）
  for (let y = 0; y < height; y++) {
    let lastZ = 0;
    for (let x = 0; x < width; x++) {
      const outIdx = y * width + x;
      let sz = zBuffer[outIdx];

      // 前後のピクセルに深度があり、今のピクセルが空(0)の場合、値を補間して隙間を埋める
      if (sz === 0 && lastZ > 0) {
        if (x + 1 < width && zBuffer[outIdx + 1] > 0) {
          sz = lastZ;
          zBuffer[outIdx] = sz;
        }
      } else {
        lastZ = sz;
      }

      // 書き込み
      if (sz > 0) {
        const cIdx = outIdx * 4;
        outData[cIdx] = sz;
        outData[cIdx + 1] = sz;
        outData[cIdx + 2] = sz;
        outData[cIdx + 3] = 255;
      }
    }
  }
  return outData;
}

