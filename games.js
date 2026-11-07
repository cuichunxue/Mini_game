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
window.GAMES_VERSION = "36";

/* 管理画面のパスワード（SHA-256 ハッシュ。パスワードそのものは書かない）
 * 変更するには: "mini-game-arcade:" + 新しいパスワード を SHA-256 にかけた値に置き換える */
window.ADMIN_PASSWORD_HASH = "c7793f384cf22b066d54f9b21c81c3cb8ef8c240488cfd3654c551c5dc2c0534";

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
  },
  {
    id: "downhill-king",
    title: "Downhill King",
    description: "山頂から一気に駆け下りろ！スピードを制御しながら7人のライバルと競うダウンヒルレース。",
    path: "games/downhill-king/index.html",
    emoji: "🚵",
    color: "#2f6d3a",
    accent: "#ffd23d"
  },
  {
    id: "one-noodle-king",
    title: "ONE NOODLE KING",
    description: "一杯に一本だけの長寿麺を、切らずに最後まですすりきれ！長押しの加減が勝負。",
    path: "games/one-noodle-king/index.html",
    emoji: "🍜",
    color: "#b8322a",
    accent: "#ffe0a3"
  },
  {
    id: "bounce-king",
    title: "Bounce King",
    description: "トランポリンでリングに合わせてタップ！5回バウンドでパワーをためて、どこまで遠くへ飛べるか挑戦。",
    path: "games/bounce-king/index.html",
    emoji: "🤸",
    color: "#43b3ff",
    accent: "#ffd23f"
  },
  {
    id: "cliff-fly",
    title: "CLIFF FLY",
    description: "長押しで助走、崖ぎわで跳んで滑空！風と上昇気流にのって、どこまで遠くへ飛べるか挑戦。",
    path: "games/cliff-fly/index.html",
    emoji: "🪂",
    color: "#3a7bd5",
    accent: "#ffd23f"
  },
  {
    id: "gyro-spin-king",
    title: "GYRO SPIN KING",
    description: "巨大リングの中で回転！30秒で何回転できる？速すぎるとバランスを失う人間ジャイロ回転王。",
    path: "games/gyro-spin-king/index.html",
    emoji: "🎡",
    color: "#5b2a86",
    accent: "#ffcf4a"
  },
  {
    id: "slap-king-usa",
    title: "SLAP KING USA",
    description: "力をためて、狙って、一気にスワイプ！自分の一撃で会場全体を爆発させろ。",
    path: "games/slap-king-usa/index.html",
    emoji: "🇺🇸",
    color: "#1d3a8a",
    accent: "#e8344e"
  },
  {
    id: "flap",
    title: "FLAP! ハエたたき",
    description: "たった30秒。飛び回るハエを何匹たたける？コンボと命中率で称号が決まる。",
    path: "games/flap/index.html",
    emoji: "🪰",
    color: "#d8483f",
    accent: "#fff3c4"
  },
  {
    id: "toro-king",
    title: "TORO KING",
    description: "突進する猛牛をギリギリでかわせ！マントで誘導しながら何回連続で避けられるか。",
    path: "games/toro-king/index.html",
    emoji: "🐂",
    color: "#b3201f",
    accent: "#ffcc33"
  },
  {
    id: "dodge-king",
    title: "DODGE KING",
    description: "避けろ！キャッチしろ！投げ返せ！連勝するほど速くなるドッジボール王。",
    path: "games/dodge-king/index.html",
    emoji: "🏐",
    color: "#1f6f8b",
    accent: "#ff7a3d"
  },
  {
    id: "popcorn-panic-king",
    title: "Popcorn Panic King",
    description: "ポップコーン屋を切り盛りしろ！バターからキュウリ味まで、お客さんの好みに合わせて作って売りまくれ。",
    path: "games/popcorn-panic-king/index.html",
    emoji: "🍿",
    color: "#c0392b",
    accent: "#ffe066"
  },
  {
    id: "boulder-king",
    title: "BOULDER KING",
    description: "タップでホールドに手を伸ばし、重心とスタミナを管理しながら頂上をつかめ！ボルダリングゲーム。",
    path: "games/boulder-king/index.html",
    emoji: "🧗",
    color: "#4a5d3a",
    accent: "#ff9f43"
  },
  {
    id: "tokyo-sky-king",
    title: "TOKYO SKY KING",
    description: "ビルの谷間をすり抜けて羽田に降りろ！X-100で地球一周、飛行ロボSG-1で宇宙の衛星バトルも。",
    path: "games/tokyo-sky-king/index.html",
    emoji: "🗼",
    color: "#1b2f5c",
    accent: "#ff8a3d"
  },
  {
    id: "bottle-spin-king",
    title: "BOTTLE SPIN KING",
    description: "スワイプして瓶を回せ！狙ったマスに倒すソロと、2〜6人で遊べるパーティーモード。",
    path: "games/bottle-spin-king/index.html",
    emoji: "🍾",
    color: "#2b7a4b",
    accent: "#ffd23f"
  },
  {
    id: "sky-tree-king",
    title: "SKY TREE KING",
    description: "大きな木を登れ、雲を越えろ、月の上まで！枝から枝へジャンプして発見アルバムを埋めよう。",
    path: "games/sky-tree-king/index.html",
    emoji: "🌳",
    color: "#2f7d4a",
    accent: "#ffe27a"
  },
  {
    id: "swing-board-king",
    title: "SWING BOARD KING",
    description: "揺れるボードの上で体重移動！何秒乗っていられる？耐久・トリック・親子対決の3モード。",
    path: "games/swing-board-king/index.html",
    emoji: "🛹",
    color: "#7b3fa0",
    accent: "#ffd23f"
  },
  {
    id: "hurdles-400m",
    title: "400mハードル 決勝",
    description: "スタジアムのトラックを一人称で疾走！10台のハードルを跳び越え、スタミナを残して表彰台を狙え。",
    path: "games/hurdles-400m/index.html",
    emoji: "🏃",
    color: "#b5382c",
    accent: "#ffe066"
  },
  {
    id: "javelin",
    title: "やり投げ 決勝 2X",
    description: "夜のスタジアムで8人の決勝！連打で助走、長押しで角度を決めて投てき。3投のベストでメダルを争え。",
    path: "games/javelin/index.html",
    emoji: "🎯",
    color: "#0d1d3a",
    accent: "#ffc83d"
  },
  {
    id: "diving-10m",
    title: "10m高飛び込み 決勝",
    description: "タイミングよく踏み切り、長押しで回転、離して真っすぐ入水！審判7人が採点するオリンピック形式の決勝。",
    path: "games/diving-10m/index.html",
    emoji: "🤿",
    color: "#0f5d8c",
    accent: "#7fe3ff"
  },
  {
    id: "fuji-earth-dive-king",
    title: "FUJI EARTH DIVE KING",
    description: "富士山の火口から地球の中心へダイブ！落ち続けるか、洞窟を探るか。装備と発見を集めて6,371kmの底をめざせ。",
    path: "games/fuji-earth-dive-king/index.html",
    emoji: "🌋",
    color: "#7a2a1e",
    accent: "#ffc83d"
  },
  {
    id: "slap-spin-king",
    title: "SLAP SPIN KING",
    description: "回転する腕ガードのすき間を見切ってビンタ！ヘリコプター化やタコ化など、ハプニング満載のタイミングゲーム。",
    path: "games/slap-spin-king/index.html",
    emoji: "🌀",
    color: "#8a1f6a",
    accent: "#ffd23f"
  },
  {
    id: "cliff-descent-king",
    title: "CLIFF DESCENT KING",
    description: "乗客18人を乗せたバスで断崖絶壁を下れ！ブレーキは踏むほど熱くなる。LOWギアと補助ブレーキを使いこなす物理運転ゲーム。",
    path: "games/cliff-descent-king/index.html",
    emoji: "🚌",
    color: "#3a4a52",
    accent: "#ffb020"
  },
  {
    id: "durian-catch-king",
    title: "DURIAN CATCH KING",
    description: "高さ51mの木から落ちるドリアンを麻袋でキャッチ！落ちる瞬間に振り出して包み込め。",
    path: "games/durian-catch-king/index.html",
    emoji: "🍈",
    color: "#1f3a2a",
    accent: "#c8e04a"
  },
  {
    id: "honey-cliff-king",
    title: "HONEY CLIFF KING",
    description: "崖にぶら下がって命がけの蜂蜜採り。欲張るほど帰れなくなる、ロープアクション。",
    path: "games/honey-cliff-king/index.html",
    emoji: "🍯",
    color: "#6a4a1a",
    accent: "#ffc23d"
  },
  {
    id: "drill-earth-king",
    title: "DRILL EARTH KING",
    description: "ドリルで地球を掘り進め！燃料と熱を管理し、コンボでDRILL FEVER。資源を集めて最深記録へ。",
    path: "games/drill-earth-king/index.html",
    emoji: "⛏️",
    color: "#3a2a20",
    accent: "#ff8a3d"
  },
  {
    id: "tenwari-ronin",
    title: "天割り浪人",
    description: "夜空から襲う妖を斬撃・突進・天割りで斬り払え！七つの地をめぐる旅路で村を守る浪人アクション。",
    path: "games/tenwari-ronin/index.html",
    emoji: "⚔️",
    color: "#141a33",
    accent: "#e0263f"
  }
];
