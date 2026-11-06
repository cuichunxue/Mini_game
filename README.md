# Mini Game Arcade

ミニゲームをまとめた統合サイトです。`index.html` を開くとゲーム一覧が表示され、好きなゲームを選んで遊べます。

## 構成

```
index.html                         統合サイト（ゲーム一覧・プレイ画面・管理画面）
games.js                           組み込みゲームの一覧
games/
  golden-egg-chase-king/index.html
  fart-candle-king/index.html
  30-second-panic-king/index.html
  frypan-ronin/index.html          （three.min.js 同梱）
  nonsense-barber/index.html
```

## 遊び方

- カードの「▶ 遊ぶ」を押すとゲームが開きます。「← 戻る」で一覧に戻ります。
- ↻ で最初からやり直し、⛶ で全画面表示（対応ブラウザのみ）。
- ゲームごとの URL（例：`index.html#/play/fart-candle-king`）を直接開くこともできます。

## ゲームの追加・削除

### サイト上で行う（このブラウザだけに反映）

右上の「⚙ 管理」を押して管理モードにします。

- **追加**：「＋ ゲームを追加」から、HTML ファイルをアップロードするか、URL / パスを指定します。
- **削除**：カード右上の ✕ を押します。
- **元に戻す**：組み込みゲームを削除してしまった場合は「削除したゲームを元に戻す」で戻せます。

データはブラウザ（localStorage / IndexedDB）に保存されるため、他の端末や他の人には反映されません。

### サイト全体に反映する（全員に反映）

**追加**

1. `games/<id>/index.html` にゲームを置く
2. `games.js` の配列に 1 件追加する

```js
{
  id: "my-game",
  title: "My Game",
  description: "ゲームの説明",
  path: "games/my-game/index.html",
  emoji: "🎮",
  color: "#3b2690",   // カード背景色
  accent: "#ffd400"   // カードのアクセント色（省略可）
}
```

**削除**：`games.js` から該当行を消し、`games/<id>/` フォルダを削除します。

## ローカルで動かす

`index.html` をブラウザで直接開いても動きますが、ローカルサーバー経由がおすすめです。

```sh
python3 -m http.server 8000
# http://localhost:8000/ を開く
```
