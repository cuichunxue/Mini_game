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
window.GAMES_VERSION = "8";

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
  },
  {
    id: "frypan-ronin",
    title: "Frypan Ronin",
    description: "フライパン一本で台所に押し寄せる敵をぶっ飛ばせ！叩く・蹴る・受ける・避けるのコンボアクション。",
    path: "games/frypan-ronin/index.html",
    emoji: "🍳",
    color: "#1a2027",
    accent: "#00bfdc"
  },
  {
    id: "nonsense-barber",
    title: "ナンセンス理髪店",
    description: "ネギを刺せ？ちょんまげ？無茶な注文に応えて髪を仕上げ、5日間で伝説の店を目指せ！",
    path: "games/nonsense-barber/index.html",
    emoji: "💈",
    color: "#de3340",
    accent: "#edf3f8"
  },
  {
    id: "sky-slide-king",
    title: "Sky Slide King",
    description: "天空の浮き輪スライダーを滑り降りろ！タイム・飛距離・AIレース・親子対戦で遊べる3Dスライダー。",
    path: "games/sky-slide-king/index.html",
    emoji: "🛟",
    color: "#1e6fd9",
    accent: "#9fe3ff"
  },
  {
    id: "shoe-kick-king",
    title: "靴飛ばし王",
    description: "長押しでパワーをためて靴を蹴り飛ばせ！誰が一番遠くまで飛ばせるか勝負。",
    path: "games/shoe-kick-king/index.html",
    emoji: "👟",
    color: "#2f7d32",
    accent: "#ffd23d"
  },
  {
    id: "croc-jaw-king",
    title: "Croc Jaw King",
    description: "巨大ワニと一本勝負！銛を投げて巻き上げ、顎が開いたら顎打ちで仕留めろ。",
    path: "games/croc-jaw-king/index.html",
    emoji: "🐊",
    color: "#2e4a2b",
    accent: "#9be36b"
  },
  {
    id: "slap-king",
    title: "SLAP KING",
    description: "ビンタ王決定戦！連勝で強敵が出るKING MODEと、飛距離を競うFLY MODE。",
    path: "games/slap-king/index.html",
    emoji: "✋",
    color: "#c2185b",
    accent: "#ffd0e0"
  },
  {
    id: "tuna-spear-king",
    title: "Tuna Spear King",
    description: "巨大マグロと一本勝負！狙って銛を投げ、船ごと引きずられる前に巻き上げろ。",
    path: "games/tuna-spear-king/index.html",
    emoji: "🐟",
    color: "#0b3c6e",
    accent: "#5ad1ff"
  },
  {
    id: "slippery-log-king",
    title: "Slippery Log King",
    description: "ツルツルの丸太を走り抜けて最後の旗をつかめ！左右スライドでバランスを保とう。",
    path: "games/slippery-log-king/index.html",
    emoji: "🪵",
    color: "#6d4c2f",
    accent: "#ffcf6b"
  },
  {
    id: "toilet-panic-king",
    title: "Toilet Panic King",
    description: "月まで踏ん張れ！ためて発射を連続して空高く。ギリギリを攻めるほどコンボアップ。",
    path: "games/toilet-panic-king/index.html",
    emoji: "🚽",
    color: "#26355f",
    accent: "#ffe066"
  },
  {
    id: "kyuri-card-game",
    title: "キュウリ斬りトランプ",
    description: "上にスワイプしてトランプを投げ、キュウリを注文どおりにスライスしよう。",
    path: "games/kyuri-card-game/index.html",
    emoji: "🥒",
    color: "#2e7d4f",
    accent: "#c8f2a0"
  },
  {
    id: "smoke-ring-bar",
    title: "スモークリング・バー",
    description: "押して吸って、離して輪を吐く。小さい輪で大きい輪をくぐらせて金の輪を狙え。",
    path: "games/smoke-ring-bar/index.html",
    emoji: "💨",
    color: "#3a2a24",
    accent: "#f2c48d"
  },
  {
    id: "plane-landing-king",
    title: "Plane Landing King",
    description: "着陸は真剣、滑走路はふざけている。速度・機首・傾きを操ってぴったり着陸せよ。",
    path: "games/plane-landing-king/index.html",
    emoji: "✈️",
    color: "#2b4f7a",
    accent: "#ffb547"
  },
  {
    id: "burger-tower",
    title: "BURGER TOWER",
    description: "タップでバーガーの具をぴったり重ねて、天空の100段をめざせ！",
    path: "games/burger-tower/index.html",
    emoji: "🍔",
    color: "#e0662d",
    accent: "#ffd36b"
  },
  {
    id: "fuwafuwa-rocket-king",
    title: "ふわふわロケット KING",
    description: "長押しで力をため、離して発射！ふわふわロケットでどこまで高く行けるか。",
    path: "games/fuwafuwa-rocket-king/index.html",
    emoji: "🚀",
    color: "#3b3f9e",
    accent: "#ffb3e6"
  },
  {
    id: "chicken-race",
    title: "チキンレース",
    description: "崖のふちに一番近く止まった人の勝ち！ブレーキのタイミングで勝負する度胸ゲーム。",
    path: "games/chicken-race/index.html",
    emoji: "🚗",
    color: "#b23a2a",
    accent: "#ffd166"
  },
  {
    id: "kangaroo-fight-king",
    title: "Kangaroo Fight King",
    description: "カンガルーとボクシング対決！パンチ・キック・ガード・回避を親指で操れ。",
    path: "games/kangaroo-fight-king/index.html",
    emoji: "🦘",
    color: "#8a4b1f",
    accent: "#ffc078"
  },
  {
    id: "hanataba-darts",
    title: "花束ダーツ",
    description: "花を選んで上にスワイプ、花束に投げて刺そう。注文どおりの花束を作れ。",
    path: "games/hanataba-darts/index.html",
    emoji: "💐",
    color: "#b8406a",
    accent: "#ffd6e5"
  },
  {
    id: "shoot-king",
    title: "SHOOT KING",
    description: "タップでシュート！クセのあるゴールキーパーたちの弱点を見抜いてゴールを決めろ。",
    path: "games/shoot-king/index.html",
    emoji: "⚽",
    color: "#1f7a3d",
    accent: "#e9ff70"
  }
];
