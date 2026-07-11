# おしゃべりMVP

OpenAI API でキャラクター返答を生成し、TTS で音声化してブラウザ再生する個人用の会話プロトタイプです。API キーが未設定の環境では、固定応答とステッカー内蔵音声にフォールバックします。

Vite + React + TanStack Router + Tailwind CSS で構成し、API とデプロイは Cloudflare Workers（Hono）を使います。

## できること

- `POST /api/talk` で LLM 返答生成 + TTS 音声生成
- OpenAI API キー未設定時は固定応答へフォールバック
- `おはよう` / `こんにちは` / `ありがとう` / `今日こんなことがあってね` のローカル固定応答
- 朝・昼・夕方・夜で背景を自動切り替え
- `assets/stickerpack@2x` のAPNGステッカーを返答ごとに切り替え
- ステッカーに対応する `m4a` 音声を再生
- ローカル動画を選ぶと、会話のたびにランダムなクリップを再生

## 技術構成

- **Vite** — 開発サーバーと本番ビルド（出力先は `dist/`）
- **React 19** — UI
- **TanStack Router** — ルーティング（`src/router.tsx`）
- **Tailwind CSS v4** — `@tailwindcss/vite` プラグイン（`src/styles.css` で `@import "tailwindcss"`）
- **Hono on Cloudflare Workers** — `GET /api/health`、`POST /api/reply`、`POST /api/talk`（`src/index.ts`）

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

Worker 側には `GET /api/health`、`POST /api/reply`、`POST /api/talk` を用意しています。画面は Vite が `dist/` に出力した静的ファイルを Cloudflare Workers Assets で配信し、`/api/*` のみ Worker が処理します。

OpenAI API を使う場合は、Worker の secret として API キーを設定します。

```bash
npx wrangler secret put OPENAI_API_KEY
```

必要に応じてモデルと音声も環境変数で上書きできます。

```bash
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy
```

`POST /api/talk` は次の形で呼べます。

```json
{
  "text": "こんにちは",
  "history": [
    { "role": "user", "content": "おはよう" },
    { "role": "assistant", "content": "おはよう！" }
  ]
}
```

レスポンスは返答文と、生成できた場合の音声 data URL を返します。

```json
{
  "reply": "こんにちは、今日も会えてうれしいよ。",
  "audioUrl": "data:audio/mpeg;base64,...",
  "mode": "openai"
}
```

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
