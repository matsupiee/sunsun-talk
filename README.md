# おしゃべりMVP

固定応答とローカル動画クリップのランダム再生だけに絞った、個人用の会話プロトタイプです。

## できること

- `おはよう` -> `おはよう！`
- `こんにちは` -> `こんにちは！`
- `ありがとう` -> `どういたしまして！`
- `今日こんなことがあってね` -> `うんとえらいね！`
- 朝・昼・夕方・夜で背景を自動切り替え
- `assets/stickerpack@2x` のAPNGステッカーを返答ごとに切り替え
- ステッカーに対応する `m4a` 音声を再生
- ローカル動画を選ぶと、会話のたびにランダムなクリップを再生

## 起動

```bash
python3 -m http.server 4173
```

ブラウザで `http://localhost:4173` を開きます。

## Cloudflare Worker + Hono

Cloudflare Workersにデプロイする場合は、Hono Workerと静的アセット配信を使います。

```bash
npm install
npm run dev
```

ローカルのWorker開発サーバーで確認後、Cloudflareにログインしてデプロイします。

```bash
npm run cf:whoami
npm run deploy
```

未ログインの場合は、先に以下を実行してください。

```bash
npx wrangler login
```

Worker側には `GET /api/health` と `POST /api/reply` を用意しています。画面自体は `dist/` にコピーした静的ファイルをCloudflare Workers Assetsで配信します。

## 動画クリップ

画面左下の `+` ボタンから手元の動画を複数選べます。動画を選ぶと、ステッカー表示より動画再生が優先されます。毎回選ぶのが面倒な場合は、動画を `assets/clips/` に置いて `assets/clips/manifest.json` に追記してください。

```json
{
  "clips": [
    {
      "name": "sample-1",
      "src": "./assets/clips/sample-1.mp4"
    }
  ]
}
```

このリポジトリには公式キャラクターやテレビ番組由来の素材は同梱していません。権利のある素材、または個人の環境で扱える素材をローカルに追加して使う想定です。
