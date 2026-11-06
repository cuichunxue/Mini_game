/*
 * ゲーム一覧（サイトに常に表示される「組み込みゲーム」）
 *
 * ■ ゲームを追加する
 *   1. games/<id>/index.html にゲームを置く
 *   2. 下の配列に 1 件追加する
 *
 * ■ ゲームを削除する
 *   1. 下の配列から該当行を消す
 *   2. games/<id>/ フォルダを消す
 *
 * ゲームの中身を更新したら GAMES_VERSION の数字を上げてください（スマホの古いキャッシュを使わせないため）。
 *
 * サイト上の「管理」画面からも追加・削除できます（その場合はこのブラウザだけに保存されます）。
 */
window.GAMES_VERSION = "2";

window.GAMES = [
  {
    id: "golden-egg-chase-king",
    title: "Golden Egg Chase King",
    description: "牧場を駆け回る金の卵を追いかけろ！60秒でコンボをつなげてハイスコアを狙う。",
    path: "games/golden-egg-chase-king/index.html",
    emoji: "🥚",
    color: "#7cc24a",
    accent: "#ffc928"
  },
  {
    id: "fart-candle-king",
    title: "Fart Candle King",
    description: "おならでロウソクを吹き消せ！パーティー会場を大混乱に陥れるおバカゲーム。",
    path: "games/fart-candle-king/index.html",
    emoji: "🕯️",
    color: "#2d1838",
    accent: "#ff5a8f"
  },
  {
    id: "30-second-panic-king",
    title: "30 Second Panic King",
    description: "時計は3秒で消える。30.00秒だと思った瞬間にSTOP！いちばん近い人の勝ち。",
    path: "games/30-second-panic-king/index.html",
    emoji: "⏱️",
    color: "#1d1147",
    accent: "#ffd400"
  }
];
