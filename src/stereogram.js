/**
 * ステレオグラム生成エンジン
 */

/**
 * 擬似乱数ハッシュ関数 (MurmurHash風)
 * 座標 (x, y) とシード値から一意な数値を生成します。
 * Math.imul を使用することで、32ビット整数のオーバーフロー挙動を
 * 異なる JavaScript エンジン（ブラウザ）間で一貫させ、同じシードなら必ず
 * 同じドットパターンが生成されるようにしています。
 */
function getNoiseHash(x, y, seed) {
  let h = Math.imul(x ^ 0x1234567, 0x9E3779B1) + Math.imul(y ^ 0x7654321, 0x85EBCA77) + Math.imul(seed ^ 0xABCDEF, 0xC2B2AE35);
  h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE3D); h ^= h >>> 16;
  return h;
}

/**
 * 高品質（平滑化）モード: トレースバック・レイキャスティング方式
 * 
 * 元の2D位置から視線に沿って光線を飛ばし、対象のZ（深度）に当たる位置を逆算する方式です。
 * 従来の単純なピクセルサンプリングで発生しやすい「ギザギザ」を軽減できるため、
 * 文字などの境界が滑らかに描画されます（サブピクセル単位でサンプリングを行います）。
 */
function generateSmoothStereogram(width, height, options, outputFrame, rowZ, y) {
  const { separation, depthFactor, method, patternData, patternWidth: pW, patternHeight: pH, noiseType, seed } = options;
  const isColorNoise = noiseType === 'color';

  const getInterpolatedZ = (cx) => {
    const x1 = Math.floor(cx);
    const x2 = Math.min(x1 + 1, width - 1);
    const f = cx - x1;
    return rowZ[x1] * (1 - f) + rowZ[x2] * f;
  };

  for (let x = 0; x < width; x++) {
    let currX = x;
    
    let safety = 0;
    while (safety < 100) {
      const targetX = currX - separation / 2;
      const z = getInterpolatedZ(Math.max(0, Math.min(width - 1, targetX)));
      
      let d = 0;
      if (method === 'parallel') {
        d = separation * (1 - depthFactor * z);
      } else {
        d = separation * (1 + depthFactor * z);
      }
      
      if (currX - d < 0) break;
      currX -= d;
      safety++;
    }

    const sourceX = currX;
    let r, g, b, a = 255;

    if (patternData && pW && pH) {
      const px_f = (sourceX % pW + pW) % pW; 
      const px1 = Math.floor(px_f);
      const px2 = (px1 + 1) % pW;
      const pfrac = px_f - px1;
      const py = y % pH;

      const idx1 = (py * pW + px1) * 4;
      const idx2 = (py * pW + px2) * 4;

      r = patternData[idx1] * (1 - pfrac) + patternData[idx2] * pfrac;
      g = patternData[idx1 + 1] * (1 - pfrac) + patternData[idx2 + 1] * pfrac;
      b = patternData[idx1 + 2] * (1 - pfrac) + patternData[idx2 + 2] * pfrac;
      a = patternData[idx1 + 3] * (1 - pfrac) + patternData[idx2 + 3] * pfrac;
    } else {
      const fx1 = Math.floor(sourceX);
      const fx2 = fx1 + 1;
      const ffrac = sourceX - fx1;

      const h1 = getNoiseHash(fx1, y, seed);
      const h2 = getNoiseHash(fx2, y, seed);

      if (isColorNoise) {
        const r1 = h1 & 0xFF, g1 = (h1 >>> 8) & 0xFF, b1 = (h1 >>> 16) & 0xFF;
        const r2 = h2 & 0xFF, g2 = (h2 >>> 8) & 0xFF, b2 = (h2 >>> 16) & 0xFF;
        r = r1 * (1 - ffrac) + r2 * ffrac;
        g = g1 * (1 - ffrac) + g2 * ffrac;
        b = b1 * (1 - ffrac) + b2 * ffrac;
      } else {
        const v1 = (h1 & 0x1) ? 255 : 0;
        const v2 = (h2 & 0x1) ? 255 : 0;
        const val = v1 * (1 - ffrac) + v2 * ffrac;
        r = g = b = val;
      }
    }

    const outIdx = (y * width + x) * 4;
    outputFrame[outIdx] = r;
    outputFrame[outIdx + 1] = g;
    outputFrame[outIdx + 2] = b;
    outputFrame[outIdx + 3] = a;
  }
}

/**
 * 通常（Classic）モード: 対称リンク構造 (Symmetric Thimbleby Linking)
 * 
 * 最も伝統的かつ高速なステレオグラムの生成アルゴリズムです。ピクセル間に「結びつき（Link）」
 * の拘束条件を設定し、Union-Find木を用いて同じ色になるべきピクセル群をグループ化します。
 * 隠面消去（Hidden Surface Removal）も部分的に自然に処理できる特性を持ちます。
 */
function generateClassicStereogram(width, height, options, outputFrame, rowZ, same, y) {
  const { separation, depthFactor, method, patternData, patternWidth: pW, patternHeight: pH, noiseType, seed } = options;
  const isColorNoise = noiseType === 'color';

  for (let x = 0; x < width; x++) {
    const z = rowZ[x];
    let d = 0;
    if (method === 'parallel') {
      d = Math.round(separation * (1 - depthFactor * z));
    } else {
      d = Math.round(separation * (1 + depthFactor * z));
    }

    const left = x - Math.floor(d / 2);
    const right = left + d;

    if (left >= 0 && right < width) {
      let l = left; while (same[l] !== l) l = same[l];
      let r = right; while (same[r] !== r) r = same[r];

      if (l !== r) {
        if (l < r) same[r] = l;
        else same[l] = r;
      }
    }
  }

  for (let x = 0; x < width; x++) {
    let root = x; while (same[root] !== root) root = same[root];
    let r, g, b, a = 255;

    // --- パターン（色）の決定 ---
    // rootピクセルが確定したため、このグループ全体に適用する色（シード色）を決定します。
    // 背景（深度 = 0）の場合は、周期ごとにノイズが固定されるようにパターン幅でモジュロをとります。
    let stableX = root;
    if (rowZ[root] === 0) {
      stableX = root % separation;
    }

    if (patternData && pW && pH) {
      // 画像パターンを使用する場合
      const pX = stableX % pW;
      const pY = y % pH;
      const pIdx = (pY * pW + pX) * 4;
      r = patternData[pIdx]; g = patternData[pIdx + 1]; b = patternData[pIdx + 2]; a = patternData[pIdx + 3];
    } else {
      // ランダムドットを使用する場合
      const h = getNoiseHash(stableX, y, seed);
      if (isColorNoise) {
        // 24bitカラー値をRGBに分配
        r = h & 0xFF; g = (h >>> 8) & 0xFF; b = (h >>> 16) & 0xFF;
      } else {
        // 最下位ビットを使って白(255)か黒(0)を決定
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

/**
 * ステレオグラムの画像を生成する
 * 
 * @param {Uint8ClampedArray} depthData - 深度マップのピクセルデータ (0-255)
 * @param {number} width - 画像の幅
 * @param {number} height - 画像の高さ
 * @param {object} options - 生成オプション
 * @returns {Uint8ClampedArray} 生成されたステレオグラムの画像データ
 */
export function generateStereogram(depthData, width, height, options) {
  const outputFrame = new Uint8ClampedArray(width * height * 4);
  const same = new Int32Array(width);
  const rowZ = new Float32Array(width);

  // パラメータのデフォルト値設定
  const opts = {
    separation: options.separation || 150,
    depthFactor: options.depthFactor || 0.33,
    method: options.method || 'parallel',
    patternData: options.patternData,
    patternWidth: options.patternWidth,
    patternHeight: options.patternHeight,
    noiseType: options.noiseType,
    seed: options.seed || 0,
    smoothing: options.smoothing || false
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      same[x] = x;
      rowZ[x] = depthData[(y * width + x) * 4] / 255.0;
    }

    if (opts.smoothing) {
      generateSmoothStereogram(width, height, opts, outputFrame, rowZ, y);
    } else {
      generateClassicStereogram(width, height, opts, outputFrame, rowZ, same, y);
    }
  }

  return outputFrame;
}

/**
 * 深度マップに「ゆらぎ（Wiggle）」効果を適用して、2.5D的なアニメーションを作成する
 */
export function applyWiggleToDepthMap(sourceData, width, height, time) {
  const theta = Math.sin(time / 600) * 0.35;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const zScale = (width * 0.3) / 255.0;
  const outData = new Uint8ClampedArray(width * height * 4);
  const zBuffer = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const sz = sourceData[idx];
      if (sz === 0) continue;

      const cx = x - width / 2;
      const Z = sz * zScale;

      const nx = cx * cosT + Z * sinT;
      const dx = Math.round(nx + width / 2);

      if (dx >= 0 && dx < width) {
        const outIdx = y * width + dx;
        if (sz > zBuffer[outIdx]) zBuffer[outIdx] = sz;
      }
    }
  }

  for (let y = 0; y < height; y++) {
    let lastZ = 0;
    for (let x = 0; x < width; x++) {
      const outIdx = y * width + x;
      let sz = zBuffer[outIdx];

      if (sz === 0 && lastZ > 0) {
        if (x + 1 < width && zBuffer[outIdx + 1] > 0) {
          sz = lastZ;
          zBuffer[outIdx] = sz;
        }
      } else {
        lastZ = sz;
      }

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
