# StereoGen

ステレオグラム生成アプリです。2D画像からAIで深度マップを推定し、リアルタイムにステレオグラムを生成できます。

![StereoGen Screenshot](https://raw.githubusercontent.com/onigiri-uma2/stereogen/main/public/favicon.svg) <!-- TODO: Replace with actual screenshot later -->

## 特徴

- **AI深度推定**: Transformers.js (Depth Anything V2) を使用して、ブラウザ内でローカルに2D画像から深度マップを生成します。
- **生成モード**:
  - 静止画
  - アニメーション
  - カスタムテキスト
  - ユーザー画像/動画アップロード
- **リアルタイム編集**: 視差の強さ、ドットサイズ、背景パターンなどを即座に調整可能。
- **プライバシー重視**: すべての解析と生成はブラウザ内で行われ、サーバーにデータが送信されることはありません。

## 技術スタック

- **Frontend**: React (Hooks, Context API)
- **Build Tool**: Vite
- **AI/ML**: Transformers.js (ONNX Runtime Web)
- **Icons**: Lucide React
- **Styling**: Vanilla CSS

## ローカル開発

### 準備

Node.js (v18以上推奨) がインストールされていることを確認してください。

### セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev
```

### ビルド

```bash
# プロダクションビルド
npm run build
```

## ライセンス

MIT License
