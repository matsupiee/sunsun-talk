# おしゃべりMVP

固定応答とローカル動画クリップのランダム再生だけに絞った、個人用の会話プロトタイプです。

Vite + React + TanStack Router + Tailwind CSS で構成し、API とデプロイは Cloudflare Workers（Hono）を使います。

## できること

- `おはよう` -> `おはよう！`
- `こんにちは` -> `こんにちは！`
- `ありがとう` -> `どういたしまして！`
- `今日こんなことがあってね` -> `うんとえらいね！`
- 朝・昼・夕方・夜で背景を自動切り替え
- `assets/stickerpack@2x` のAPNGステッカーを返答ごとに切り替え
- ステッカーに対応する `m4a` 音声を再生
- ローカル動画を選ぶと、会話のたびにランダムなクリップを再生

## 技術構成

- **Vite** — 開発サーバーと本番ビルド（出力先は `dist/`）
- **React 19** — UI
- **TanStack Router** — ルーティング（`src/router.tsx`）
- **Tailwind CSS v4** — `@tailwindcss/vite` プラグイン（`src/styles.css` で `@import "tailwindcss"`）
- **Hono on Cloudflare Workers** — `GET /api/health` と `POST /api/reply`（`src/index.ts`）

### ディレクトリ

```
index.html            Vite のエントリ
public/assets/        ステッカー・背景・動画などの静的素材
src/main.tsx          React エントリ
src/router.tsx        TanStack Router
src/styles.css        Tailwind + 画面デザイン
src/features/talk/    会話画面のコンポーネントとロジック
src/index.ts          Cloudflare Worker（Hono API）
```

## 開発

```bash
npm install
npm run dev
```

ブラウザで表示された URL（既定は `http://localhost:5173`）を開きます。`npm run dev` はフロントエンドのみを起動し、API が無い場合はローカルの固定応答にフォールバックするのでそのまま会話できます。

型チェックとビルド:

```bash
npm run typecheck
npm run build
```

## Cloudflare Worker + Hono

Worker と静的アセットの両方を含めてローカル確認したい場合は、ビルドしてから `wrangler dev` を実行します。

```bash
npm run cf:dev
```

Worker 側には `GET /api/health` と `POST /api/reply` を用意しています。画面は Vite が `dist/` に出力した静的ファイルを Cloudflare Workers Assets で配信し、`/api/*` のみ Worker が処理します。

デプロイ:

```bash
npm run cf:whoami
npm run deploy
```

未ログインの場合は、先に以下を実行してください。

```bash
npx wrangler login
```

## 動画クリップ

画面左下の `+` ボタンから手元の動画を複数選べます。動画を選ぶと、ステッカー表示より動画再生が優先されます。毎回選ぶのが面倒な場合は、動画を `public/assets/clips/` に置いて `public/assets/clips/manifest.json` に追記してください。

```json
{
  "clips": [
    {
      "name": "sample-1",
      "src": "/assets/clips/sample-1.mp4"
    }
  ]
}
```

このリポジトリには公式キャラクターやテレビ番組由来の素材は同梱していません。権利のある素材、または個人の環境で扱える素材をローカルに追加して使う想定です。
