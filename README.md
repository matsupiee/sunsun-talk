# おしゃべりMVP

OpenAI API でキャラクター返答を生成し、ElevenLabs の cloned voice で音声化してブラウザ再生する個人用の会話プロトタイプです。API キーが未設定の環境では、固定応答とステッカー内蔵音声にフォールバックします。

Vite + React + TanStack Router + Tailwind CSS で構成し、API とデプロイは Cloudflare Workers（Hono）を使います。

## できること

- `POST /api/talk` で LLM 返答生成 + ElevenLabs TTS 音声生成
- OpenAI API キー未設定時は固定応答へフォールバック
- `おはよう` / `こんにちは` / `ありがとう` / `今日こんなことがあってね` のローカル固定応答
- 朝・昼・夕方・夜で背景を自動切り替え
- `assets/stickerpack@2x` のAPNGステッカーを返答ごとに切り替え
- ステッカーに対応する `m4a` 音声を再生
- ローカル動画を選ぶと、会話のたびにランダムなクリップを再生

## 技術構成

- **Vite** — 開発サーバーと本番ビルド（出力先は `dist/`）
- **React 19** — UI
- **TanStack Router** — ルーティング（`src/client/router.tsx`）
- **Tailwind CSS v4** — `@tailwindcss/vite` プラグイン（`src/client/styles.css` で `@import "tailwindcss"`）
- **Hono on Cloudflare Workers** — `GET /api/health`、`POST /api/reply`、`POST /api/talk`（`src/server/index.ts`）

### ディレクトリ

```
index.html            Vite のエントリ
public/assets/        ステッカー・背景・動画などの静的素材
src/client/main.tsx                 React エントリ
src/client/router.tsx               TanStack Router
src/client/styles.css               Tailwind + 画面デザイン
src/client/features/talk/page.tsx   会話画面
src/client/features/talk/_utils/    会話画面のブラウザ側ロジック
src/server/index.ts                 Cloudflare Worker（Hono API）
src/server/routes/                  Worker の API routes
src/server/services/openai/         OpenAI API 呼び出し（返答生成）
src/server/services/elevenlabs/     ElevenLabs API 呼び出し（音声生成）
src/server/domain/                  サーバー側ドメインロジック
src/api-contracts/talk.ts           フロントエンド/バックエンド間のAPI契約
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

必要に応じて返答生成モデルも環境変数で上書きできます。

```bash
OPENAI_TEXT_MODEL=gpt-4.1-mini
```

音声生成には ElevenLabs の API キーと cloned voice の `voice_id` が必要です。先に ElevenLabs の Voice Cloning で音声を作成し、作成された `voice_id` を設定してください。

```bash
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
```

ローカルの `wrangler dev` で試す場合は、`.dev.vars` に同じ値を置けます。

```bash
OPENAI_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

必要に応じて ElevenLabs のモデルと出力形式も環境変数で上書きできます。

```bash
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
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
  "mode": "elevenlabs"
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
