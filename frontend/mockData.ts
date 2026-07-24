import { Question, Player } from './types';

// --- 基础文化题库模板 (Culture Templates) ---
const CULTURE_BASE = [
  { text: '日本の夏の風物詩で、空に打ち上げるものは？', options: ['花見', '花火', '月見', '雪祭り'], correctIndex: 1 },
  { text: '日本の伝統的な衣装は？', options: ['スーツ', 'ドレス', '着物', 'パジャマ'], correctIndex: 2 },
  { text: '日本の最も高い山は？', options: ['阿蘇山', '富士山', '桜島', '高尾山'], correctIndex: 1 },
  { text: '大晦日（12月31日）に食べる伝統的な麺料理は？', options: ['年越しそば', '年明けうどん', '月見ラーメン', '冷やし中華'], correctIndex: 0 },
  { text: '日本の国花として広く親しまれている花は？', options: ['梅', '菊', '桜', '椿'], correctIndex: 2 },
  { text: 'お正月に神社やお寺にお参りすることを何という？', options: ['初詣', 'お盆', '七五三', 'お彼岸'], correctIndex: 0 },
  { text: '節分（2月）に「鬼は外、福は内」と言いながら投げるものは？', options: ['塩', '米', '豆', 'お金'], correctIndex: 2 },
  { text: '日本の伝統的なスポーツで、力士が土俵で戦うものは？', options: ['柔道', '剣道', '空手', '相撲'], correctIndex: 3 },
  { text: '生魚を酢飯の上に乗せた日本の代表的な料理は？', options: ['天ぷら', 'すき焼き', '寿司', '刺身'], correctIndex: 2 },
  { text: '温泉に入る時、湯船に入れてはいけないものは？', options: ['タオル', '頭', '手', '足'], correctIndex: 0 },
  { text: '日本の伝統的なお茶の作法を何という？', options: ['華道', '書道', '茶道', '剣道'], correctIndex: 2 },
  { text: '日本の伝統的な演劇で、男性だけが演じるものは？', options: ['能', '狂言', '歌舞伎', '落語'], correctIndex: 2 },
  { text: '紙を折って動物や植物を作る日本の伝統遊びは？', options: ['あやとり', '折り紙', 'お手玉', 'けん玉'], correctIndex: 1 },
  { text: '大豆を発酵させて作る、ネバネバした日本の食品は？', options: ['豆腐', '味噌', '醤油', '納豆'], correctIndex: 3 },
  { text: '日本の高速鉄道の一般的な呼び名は？', options: ['地下鉄', 'モノレール', '新幹線', '路面電車'], correctIndex: 2 },
  { text: '日本の伝統的な部屋に敷かれている床材は？', options: ['カーペット', 'フローリング', '畳', 'タイル'], correctIndex: 2 },
  { text: '日本人が挨拶や感謝の時にする動作は？', options: ['ハグ', '握手', 'お辞儀', 'ハイタッチ'], correctIndex: 2 },
  { text: '日本で食事をする時に主に使う道具は？', options: ['フォーク', 'ナイフ', 'スプーン', '箸'], correctIndex: 3 },
  { text: 'アニメや電化製品の街として有名な東京の地名は？', options: ['渋谷', '新宿', '秋葉原', '池袋'], correctIndex: 2 },
  { text: '七夕（7月7日）に願い事を書いて笹に飾る紙を何という？', options: ['短冊', '絵馬', 'おみくじ', 'お守り'], correctIndex: 0 }
];

// --- 基础语言题库模板 (Language Templates) ---
const LANGUAGE_BASE = [
  { text: '「食べる」の謙譲語はどれですか？', options: ['召し上がる', 'いただく', 'おっしゃる', 'なさる'], correctIndex: 1, type: 'grammar', level: 'N3' },
  { text: '「行く」の尊敬語はどれですか？', options: ['まいる', 'うかがう', 'いらっしゃる', '申す'], correctIndex: 2, type: 'grammar', level: 'N3' },
  { text: '「一生懸命」の正しい読み方は？', options: ['いっしょうけんめい', 'いっしょけんめい', 'いっしょうけんみょう', 'いっしょけんみょう'], correctIndex: 0, type: 'vocab', level: 'N4' },
  { text: '雨が降って＿＿＿、試合は行われます。', options: ['いても', 'いると', 'いれば', 'いたから'], correctIndex: 0, type: 'grammar', level: 'N3' },
  { text: '「飛行機」の正しい読み方は？', options: ['ひこうき', 'ひこき', 'ひこうぎ', 'ひこぎ'], correctIndex: 0, type: 'vocab', level: 'N5' },
  { text: 'ここに自転車を＿＿＿いけません。', options: ['止めては', '止めても', '止めなくては', '止めなくても'], correctIndex: 0, type: 'grammar', level: 'N4' },
  { text: '富士山に登った＿＿＿がありますか。', options: ['こと', 'もの', 'とき', 'ところ'], correctIndex: 0, type: 'grammar', level: 'N4' },
  { text: '「郵便局」はどこですか？（読み方）', options: ['ゆうびんきょく', 'ゆうびんこく', 'ゆびんきょく', 'ゆびんこく'], correctIndex: 0, type: 'vocab', level: 'N4' },
  { text: '明日は早く起き＿＿＿なりません。', options: ['なければ', 'なくては', 'ないでは', 'ずには'], correctIndex: 0, type: 'grammar', level: 'N4' },
  { text: '「図書館」で本を借ります。（読み方）', options: ['としょかん', 'としょけん', 'としょうかん', 'としょうけん'], correctIndex: 0, type: 'vocab', level: 'N5' }
];

// --- 日本防災知識（内閣府・気象庁の一般向け防災指針に基づく） ---
const DISASTER_BASE = [
  { text: '強い地震の揺れを感じた時、まず優先する行動は？', options: ['窓を開けに走る', '机の下などで頭を守る', 'すぐ外へ飛び出す', 'エレベーターに乗る'], correctIndex: 1 },
  { text: '海辺で強い揺れや長い揺れを感じた時は？', options: ['海を見に行く', '高い安全な場所へ避難する', '車内で待つ', '警報が出るまで砂浜にいる'], correctIndex: 1 },
  { text: '津波警報・注意報が出ている間の正しい行動は？', options: ['第一波の後に戻る', '解除まで避難を続ける', '海岸で撮影する', '川沿いへ移動する'], correctIndex: 1 },
  { text: '津波は一度だけ来るとは限らない。これは正しい？', options: ['正しい', '必ず一度だけ', '夜だけ複数回来る', '台風時だけ正しい'], correctIndex: 0 },
  { text: '日本で火事・救急車を呼ぶ電話番号は？', options: ['110', '117', '118', '119'], correctIndex: 3 },
  { text: '日本で警察へ緊急通報する電話番号は？', options: ['110', '115', '118', '119'], correctIndex: 0 },
  { text: '災害用伝言ダイヤルの番号は？', options: ['104', '117', '171', '177'], correctIndex: 2 },
  { text: 'ハザードマップで確認できるものは？', options: ['地域の災害リスクや避難場所', '電車の座席', '商品の価格', '学校の成績'], correctIndex: 0 },
  { text: '「指定緊急避難場所」の主な目的は？', options: ['長期宿泊', '災害から命を守る緊急避難', '荷物の保管', '観光案内'], correctIndex: 1 },
  { text: '家具の地震対策として有効なのは？', options: ['高い所に重い物を置く', '転倒防止器具で固定する', '窓の前に集める', 'キャスターを自由にする'], correctIndex: 1 },
  { text: '地震でエレベーター内に閉じ込められそうな時は？', options: ['全階のボタンを押し停止階で降りる', '飛び跳ねる', '扉をこじ開ける', '屋上ボタンだけ押す'], correctIndex: 0 },
  { text: '火災の煙の中を避難する時の姿勢は？', options: ['できるだけ低い姿勢', '背伸びする', '走り回る', '煙の濃い方へ進む'], correctIndex: 0 },
  { text: '消火器を使う時、最初に抜くものは？', options: ['安全栓', 'ホース', 'ラベル', '底のふた'], correctIndex: 0 },
  { text: '大雨で冠水した地下道・アンダーパスには？', options: ['速度を上げて入る', '入らず迂回する', '歩いて深さを測る', '中央で停車する'], correctIndex: 1 },
  { text: '警戒レベル4で危険な場所にいる人が取る行動は？', options: ['避難する', '旅行を予約する', '川を見に行く', '翌日まで待つ'], correctIndex: 0 },
  { text: '警戒レベル5はどのような状況？', options: ['災害発生または切迫', '雨の可能性なし', '訓練開始', '通常営業'], correctIndex: 0 },
  { text: '土砂災害の前兆として注意すべきものは？', options: ['崖から小石が落ちる', '星がよく見える', '風が止む', '気温が少し上がる'], correctIndex: 0 },
  { text: '地震時に車を運転中なら、まずどうする？', options: ['急ブレーキ', 'ゆっくり減速して左側に停止', '交差点の中央で停止', '速度を上げる'], correctIndex: 1 },
  { text: '避難で家を離れる前、可能なら確認するものは？', options: ['ブレーカーを切る', 'テレビを最大音量にする', '窓を全開にする', '冷房を強くする'], correctIndex: 0 },
  { text: '寝室の地震対策として役立つものは？', options: ['枕元の靴と懐中電灯', '棚の上の花瓶', '割れ物の山', '重い額縁を頭上に置く'], correctIndex: 0 },
  { text: '非常用飲料水は最低何日分を備える考え方が一般的？', options: ['半日分', '1日分', '3日分', '30日分だけ'], correctIndex: 2 },
  { text: '停電時の情報収集に役立つものは？', options: ['電池式ラジオ', '電気だけで動くテレビ', '紙のないプリンター', '壊れた時計'], correctIndex: 0 },
  { text: '断水に備えて用意すると役立つものは？', options: ['携帯トイレ', '花火', '香水', 'スケート靴'], correctIndex: 0 },
  { text: '家族の防災会議で決めておくとよいものは？', options: ['集合場所と連絡方法', 'テレビ番組', '服のブランド', 'ゲームの順位'], correctIndex: 0 },
  { text: 'ガラスの飛散対策として有効なのは？', options: ['飛散防止フィルム', '窓を強くたたく', '薄い紙を置く', '鍵を外す'], correctIndex: 0 },
  { text: '「正常性バイアス」とは？', options: ['危険を過小評価しやすい心理', '必ず正しく避難できる能力', '天気予報の種類', '非常食の名称'], correctIndex: 0 },
  { text: '避難中に切れた電線を見つけたら？', options: ['近づかず通報する', '手で移動する', 'またいで進む', '水をかける'], correctIndex: 0 },
  { text: '緊急地震速報を見聞きした時に大切なのは？', options: ['周囲の状況に応じ身を守る', '必ず外へ走る', 'エレベーターを呼ぶ', '火を新しくつける'], correctIndex: 0 },
  { text: '火山灰が降る時に目や呼吸器を守るには？', options: ['マスクやゴーグルを使う', '目をこする', '灰を吸い込む', 'コンタクトを洗わず使う'], correctIndex: 0 },
  { text: '避難情報を確認する手段として適切なのは？', options: ['自治体、防災無線、公式情報', 'うわさだけ', '古い広告だけ', '知らない人の予想だけ'], correctIndex: 0 },
  { text: '家庭で備える飲料水の1人1日分の目安は？', options: ['約500ミリリットル', '約1リットル', '約3リットル', '約10リットル'], correctIndex: 2 },
  { text: '食料や水を日常的に使い、使った分を買い足す備蓄方法は？', options: ['ローリングストック', 'クールビズ', 'リサイクル避難', 'タイムセール'], correctIndex: 0 },
  { text: '大規模災害に備える食料・水は、できれば何日分が望ましい？', options: ['1日分', '2日分', '1週間分', '1か月分だけ'], correctIndex: 2 },
  { text: '非常用持ち出し袋を置く場所として適切なのは？', options: ['すぐ持ち出せる玄関や寝室付近', '鍵のない遠い倉庫だけ', '家具の一番奥', '屋根の上'], correctIndex: 0 },
  { text: '非常用持ち出し袋の中身は誰に合わせて準備する？', options: ['家族構成や必要な薬に合わせる', '隣町の人口だけに合わせる', '全員まったく同じにする', '季節を一切考えない'], correctIndex: 0 },
  { text: '災害時に携帯電話がつながりにくい時の安否確認に役立つものは？', options: ['災害用伝言サービス', '何度も連続で通常通話だけする', '知らない番号へ電話する', '電源を壊す'], correctIndex: 0 },
  { text: '指定避難所の主な役割は？', options: ['被災者が一定期間生活する場所', '津波を見る展望台', '災害時だけの駐車場', '観光客だけの案内所'], correctIndex: 0 },
  { text: '指定緊急避難場所は何に応じて指定される？', options: ['洪水・地震・津波など災害の種類', '好きなスポーツ', '建物の色だけ', '曜日だけ'], correctIndex: 0 },
  { text: '避難経路を平常時に確認する時、重要なのは？', options: ['危険箇所と複数の経路を確認する', '最短距離だけ覚える', '夜は確認しない', '川沿いだけを選ぶ'], correctIndex: 0 },
  { text: '大雨時、川や用水路の様子を確認しに行く行動は？', options: ['危険なので近づかない', '水位が高いほど近づく', '必ず一人で行く', '橋の下で待つ'], correctIndex: 0 },
  { text: '浸水が始まって屋外避難が危険な場合に検討する行動は？', options: ['建物のより高く安全な場所へ移動', '地下室へ降りる', '川岸へ移動', '低い道路へ出る'], correctIndex: 0 },
  { text: '冠水した道路を歩く必要がある時、特に注意するものは？', options: ['見えない側溝やマンホール', '空の雲だけ', '道路標識の色', '靴ひもの長さだけ'], correctIndex: 0 },
  { text: '雷が近づいた時、安全性が高い場所は？', options: ['丈夫な建物や自動車の中', '高い木の真下', '開けた運動場の中央', '山頂'], correctIndex: 0 },
  { text: '竜巻が近づいた屋内で取る行動は？', options: ['窓から離れ丈夫な机の下などで身を守る', '窓を開けて見る', '屋根に上る', 'ベランダへ出る'], correctIndex: 0 },
  { text: '急な大雨や雷をもたらすことが多い雲は？', options: ['積乱雲', '巻雲', '飛行機雲', '霧だけ'], correctIndex: 0 },
  { text: '大雪で車が立ち往生する可能性に備えて積むとよいものは？', options: ['防寒具・水・食料・スコップ', '浮き輪だけ', '花火だけ', '薄着だけ'], correctIndex: 0 },
  { text: '雪道で車の排気口が雪に埋まると危険な理由は？', options: ['一酸化炭素が車内に入るおそれ', 'ラジオが大きくなる', 'タイヤが新品になる', '窓が透明になる'], correctIndex: 0 },
  { text: '火山灰が積もった屋根に上がる時は？', options: ['転落の危険があるため無理をしない', '一人で急いで上がる', '灰を吸いながら作業する', '滑りやすい靴を履く'], correctIndex: 0 },
  { text: '地震後にガス臭を感じた時の行動は？', options: ['火や電気スイッチを使わず元栓を確認する', '照明を何度も点滅する', 'ライターで場所を探す', '換気扇のスイッチを入れる'], correctIndex: 0 },
  { text: '停電中、ろうそくより火災リスクを抑えやすい照明は？', options: ['電池式LEDライト', 'たき火', 'ガスコンロの炎', '紙を燃やす'], correctIndex: 0 },
  { text: '感震ブレーカーの役割は？', options: ['強い揺れを感知して電気を遮断する', '水道を増圧する', '津波を止める', '家具を自動で固定する'], correctIndex: 0 },
  { text: '消火器で火を狙う基本は？', options: ['炎ではなく火元を狙う', '天井だけを狙う', '自分の足元だけを狙う', '煙の上だけを狙う'], correctIndex: 0 },
  { text: '天ぷら油の火災に水をかけてはいけない理由は？', options: ['燃えた油が飛び散り危険', '油が冷えすぎるだけ', '鍋が軽くなる', '煙がなくなる'], correctIndex: 0 },
  { text: '避難時、煙で前が見えない時に頼るべきものは？', options: ['誘導灯や壁沿いの避難経路', '煙が濃い方向', 'エレベーター', '屋上への近道だけ'], correctIndex: 0 },
  { text: '乳幼児がいる家庭の防災備蓄に加えるものは？', options: ['ミルク・おむつ・おしりふき', '重いガラスだけ', '大人用の靴だけ', '香水だけ'], correctIndex: 0 },
  { text: '持病がある人が防災時に準備しておくとよいものは？', options: ['薬とお薬手帳の情報', '薬の名前を忘れる', '期限切れ薬だけ', '処方情報を捨てる'], correctIndex: 0 },
  { text: 'ペット同行避難に備えて平常時にすることは？', options: ['自治体のルール確認とケージ等の準備', '災害後に初めて考える', '名札を外す', '餌を用意しない'], correctIndex: 0 },
  { text: '避難所で感染症を広げにくくする基本行動は？', options: ['手洗い・換気・体調申告', 'タオルを全員で共有', '換気を全くしない', '体調不良を隠す'], correctIndex: 0 },
  { text: '災害ボランティアとして活動する前に確認するものは？', options: ['現地の募集状況とボランティアセンター情報', 'うわさだけで現地へ直行', '装備なしで危険区域へ入る', '交通規制を無視する'], correctIndex: 0 },
  { text: '避難訓練を繰り返す主な目的は？', options: ['災害時に迷わず安全行動を取りやすくする', '訓練だけで災害をなくす', '避難経路を忘れる', '非常口を閉鎖する'], correctIndex: 0 },
  { text: '地震の揺れで屋外にいる時、ブロック塀の近くでは？', options: ['塀にもたれる', '倒壊に備えて離れる', '塀の上に登る', '揺れが収まるまで触る'], correctIndex: 1 },
  { text: '商業施設で地震に遭った時、頭上からの落下物に対しては？', options: ['かばんなどで頭を守る', '商品棚に登る', 'ガラスの前へ移動する', '出口へ全速力で走る'], correctIndex: 0 },
  { text: '駅のホームで強い揺れを感じた時に避ける行動は？', options: ['係員の指示を聞く', '線路へ降りる', '頭を守る', '転落しない位置を取る'], correctIndex: 1 },
  { text: '学校で地震が起きた時の基本行動は？', options: ['机の下で頭を守り先生の指示を聞く', '窓際に集まる', '階段へ一斉に走る', '校外へ勝手に出る'], correctIndex: 0 },
  { text: '入浴中に地震が起きた時、可能なら確保しておきたいものは？', options: ['浴室の出口', '浴槽の栓だけ', '鏡の前', '天井の照明'], correctIndex: 0 },
  { text: '家具を配置する時、地震対策として避けたい場所は？', options: ['避難経路をふさぐ位置', '壁に固定できる位置', '寝床から離れた位置', '低い家具を置ける位置'], correctIndex: 0 },
  { text: '地震後の「通電火災」を防ぐために有効な設備は？', options: ['加湿器', '感震ブレーカー', '目覚まし時計', '空気清浄機'], correctIndex: 1 },
  { text: '地震直後、火を使っていた場合の基本は？', options: ['揺れている最中に無理して近づく', '身を守り、揺れが収まってから確認する', '油を床に流す', '必ず窓から外へ投げる'], correctIndex: 1 },
  { text: '大地震で交通が止まった時、むやみに移動を始めない理由は？', options: ['道路混雑や群集事故を避けるため', '携帯電話が軽くなるため', '天気が必ず晴れるため', '電車が速くなるため'], correctIndex: 0 },
  { text: '大きな地震後、損傷した建物に戻る前に必要なのは？', options: ['安全確認', '写真撮影だけ', '窓をすべて開けることだけ', 'エレベーターの使用'], correctIndex: 0 },
  { text: '津波は海岸だけでなく、どこをさかのぼることがある？', options: ['川', '山頂', 'トンネルの天井', '空'], correctIndex: 0 },
  { text: '津波の高さは海岸の地形によってどうなることがある？', options: ['どこでも同じ', '局地的に高くなる', '必ず低くなる', '季節だけで決まる'], correctIndex: 1 },
  { text: '津波は地震後すぐ到達する場合があるため、海辺では？', options: ['警報を待たず揺れを感じたら避難を始める', '荷物を全部取りに戻る', '海面を観察し続ける', '防波堤へ集まる'], correctIndex: 0 },
  { text: '津波避難で車の渋滞が予想される地域では、原則として？', options: ['地域の計画に従い徒歩避難を検討する', '海岸方向へ運転する', '道路の中央に駐車する', '信号を無視する'], correctIndex: 0 },
  { text: '海水浴場で赤と白の格子模様の旗が示すものは？', options: ['遊泳大会', '津波警報などの発表', '海水温の上昇', '魚の群れ'], correctIndex: 1 },
  { text: '津波から避難した後、戻る判断に使う情報は？', options: ['周囲のうわさ', '気象庁や自治体の公式な解除情報', '海の色だけ', '自分の時計だけ'], correctIndex: 1 },
  { text: '近くに高台がない時、津波避難で利用を検討するものは？', options: ['指定された津波避難ビル', '地下街', '海岸の倉庫', '川に近い低層建物'], correctIndex: 0 },
  { text: '津波避難では、より安全を目指してどう移動する？', options: ['できるだけ高く海から遠い場所へ', '海岸と平行だけに移動', '河口へ近づく', '低い地下へ移動'], correctIndex: 0 },
  { text: '気象庁の「キキクル」で確認できるものは？', options: ['大雨による災害の危険度', '電車の空席', '地震の予知時刻', '商品の在庫'], correctIndex: 0 },
  { text: '線状降水帯が発生すると、同じ場所で何が続くおそれがある？', options: ['強い雨', '快晴', '降雪だけ', '無風だけ'], correctIndex: 0 },
  { text: '洪水から避難する経路として避けたい場所は？', options: ['川沿いや低い道路', '高い道路', '自治体が示す経路', '複数確認した安全な道'], correctIndex: 0 },
  { text: '地下街や地下室が浸水し始める前に重要なのは？', options: ['早めに地上へ移動する', 'さらに地下へ降りる', '水を見に行く', 'エレベーター内で待つ'], correctIndex: 0 },
  { text: '冠水した道路を車で通行する判断として正しいのは？', options: ['見た目が浅くても進入を避ける', '速度を上げれば安全', '前の車だけを信じる', '窓を開ければ安全'], correctIndex: 0 },
  { text: '土砂災害の前兆として注意する地面の変化は？', options: ['斜面のひび割れ', '芝生の色だけ', '落ち葉の枚数', '日なたの温度'], correctIndex: 0 },
  { text: '山や崖の近くで「地鳴り」のような音を聞いた時は？', options: ['土砂災害を警戒して安全な場所へ離れる', '崖の下で確認する', '斜面に登る', '音を録るため近づく'], correctIndex: 0 },
  { text: '台風接近前、窓ガラスへの備えとして有効なのは？', options: ['雨戸やシャッターを閉める', '窓を開け放つ', '窓際に寝る', 'ガラスをたたく'], correctIndex: 0 },
  { text: '強風が予想される前にベランダで行うことは？', options: ['飛ばされやすい物を屋内へ入れる', '植木鉢を手すりに置く', '物干し竿を外へ突き出す', '段ボールを積む'], correctIndex: 0 },
  { text: '台風の暴風が始まってから屋根を補修する行動は？', options: ['危険なので行わない', '一人で急いで行う', '傘を差せば安全', '夜なら安全'], correctIndex: 0 },
  { text: '雷鳴が聞こえる時、それは何を意味する？', options: ['雷が届く可能性がある', '雷は必ず遠い', '雨が止んだ', '屋外が安全になった'], correctIndex: 0 },
  { text: '雷の時、大きな木のすぐ下が危険な理由は？', options: ['落雷の電流が人へ移るおそれがある', '木が日陰を作る', '雨音が大きい', '葉が落ちるだけ'], correctIndex: 0 },
  { text: '竜巻の兆候を屋外で感じた時に優先する場所は？', options: ['頑丈な建物の中', '物置の陰だけ', '橋の下', '開けた場所'], correctIndex: 0 },
  { text: '災害後の暑い時期、避難生活で特に注意するものは？', options: ['熱中症', 'しもやけだけ', '花粉だけ', '乗り物酔いだけ'], correctIndex: 0 },
  { text: '住宅用火災警報器について必要なことは？', options: ['定期的な作動確認と交換', '電池を常に外す', '布で完全に覆う', '音が鳴らないよう壊す'], correctIndex: 0 },
  { text: '暖房器具の近くで避けるべきものは？', options: ['洗濯物や燃えやすい物', '十分な空間', '取扱説明書', '消火器'], correctIndex: 0 },
  { text: 'たこ足配線や傷んだ電気コードを放置すると？', options: ['火災の原因になることがある', '電気代が必ずゼロになる', 'コードが自然に直る', '停電を完全に防げる'], correctIndex: 0 },
  { text: '石油ストーブへ給油する時の基本は？', options: ['火を消してから行う', '燃焼中に行う', 'こぼしても拭かない', '灯油以外を混ぜる'], correctIndex: 0 },
  { text: '防火扉の前に荷物を置いてはいけない理由は？', options: ['避難や延焼防止の妨げになる', '扉の色が変わる', '荷物が軽くなる', '室温が下がる'], correctIndex: 0 },
  { text: '火災を発見した時、周囲へ知らせる行動は？', options: ['大声で知らせ119番通報につなげる', '一人で黙って隠す', '動画だけ撮る', '警報器を止める'], correctIndex: 0 },
  { text: '消火器を使う時、背後に確保しておきたいものは？', options: ['避難できる出口', '燃えている部屋の奥', '閉じた行き止まり', '煙が濃い場所'], correctIndex: 0 },
  { text: '火災から避難した後にしてはいけないことは？', options: ['物を取りに建物へ戻る', '消防へ情報を伝える', '安全な場所で待つ', '人数を確認する'], correctIndex: 0 },
  { text: '停電に備えるモバイルバッテリーはどう管理する？', options: ['定期的に充電状態を確認する', '完全放電のまま放置する', '水の中で保管する', '膨張しても使い続ける'], correctIndex: 0 },
  { text: '断水時に備え、家庭で用意しておくと衛生維持に役立つものは？', options: ['携帯トイレとウェットティッシュ', '生花だけ', '大きな鏡だけ', '紙吹雪'], correctIndex: 0 },
  { text: '災害時の買い物に備えて現金を用意するなら？', options: ['小銭や小額紙幣も含める', '高額紙幣一枚だけ', '海外硬貨だけ', '現金は必ず不要'], correctIndex: 0 },
  { text: '停電時でも家族の連絡先を確認できる備えは？', options: ['紙にも連絡先を書いておく', '携帯電話一台だけに保存', '番号をすべて消す', '暗記は禁止する'], correctIndex: 0 },
  { text: '風呂の残り湯を災害時に役立てる場合の用途は？', options: ['トイレなどの生活用水', 'そのまま飲料水', '傷口の洗浄専用', '薬を飲む水'], correctIndex: 0 },
  { text: '眼鏡や補聴器を使う人の非常持ち出し品として大切なのは？', options: ['予備や必要な付属品', '使わないケースだけ', '別人の度数の眼鏡', '電池を全部捨てる'], correctIndex: 0 },
  { text: '災害時に必要な証明書情報への備えは？', options: ['安全に保管したコピーや記録を用意する', '原本を屋外に放置する', '番号を公開する', 'すべて処分する'], correctIndex: 0 },
  { text: '非常持ち出し品を見直す時に考えるものは？', options: ['季節と家族の変化', '袋の色だけ', '広告の枚数', 'テレビ番組'], correctIndex: 0 },
  { text: '車の燃料を防災面から管理する方法として役立つのは？', options: ['残量が少なくなる前に給油する', '常に空に近づける', '警告灯を無視する', '災害後だけ初めて確認する'], correctIndex: 0 },
  { text: '地域の防災倉庫や給水拠点について平常時にすることは？', options: ['場所を確認しておく', '災害時まで知らないままにする', '勝手に移動する', '入口をふさぐ'], correctIndex: 0 },
  { text: '避難時に支援が必要な近所の人について大切なのは？', options: ['平常時から地域で助け合いを話し合う', '災害時も無関心でいる', '個人情報を公開する', '必ず一人だけで対応する'], correctIndex: 0 },
  { text: '避難所に到着した時、運営側へ伝えるとよいものは？', options: ['自分の状況や必要な支援', 'うその名前', '他人の秘密', '何も伝えない'], correctIndex: 0 },
  { text: '避難所で着替えや授乳などに必要な配慮は？', options: ['プライバシーを確保する', '全員から見える場所だけを使う', '照明を最大にするだけ', '配慮は不要'], correctIndex: 0 },
  { text: '食物アレルギーがある人が避難所で確認するものは？', options: ['配給食品の原材料表示', '包装の色だけ', '食品の値段だけ', '配る人の服装'], correctIndex: 0 },
  { text: 'ペットとの避難で従うべきものは？', options: ['自治体や避難所の受入れルール', '自分だけの思い込み', 'SNSのうわさだけ', '普段と無関係な地域の規則だけ'], correctIndex: 0 },
  { text: '車中泊が続く時、血栓予防のために意識することは？', options: ['水分を取り適度に体を動かす', '同じ姿勢を続ける', '水分を完全に断つ', '足を一切動かさない'], correctIndex: 0 },
  { text: '災害後、自宅が安全で生活できる場合に選択肢となるのは？', options: ['在宅避難', '必ず危険な場所へ移動', '川辺で野宿', '損傷した建物へ移る'], correctIndex: 0 },
  { text: '避難所のトイレを衛生的に保つために必要なのは？', options: ['決められた使い方と清掃を守る', 'ごみを便器へ詰める', '手洗いをしない', '使用状況を共有しない'], correctIndex: 0 },
  { text: '冬の避難生活で低体温症を防ぐために重要なのは？', options: ['体を濡らさず保温する', '薄着で風に当たる', '濡れた服のまま過ごす', '床に直接寝続ける'], correctIndex: 0 },
  { text: '災害時の情報が複数あり迷った時、優先して確認するものは？', options: ['気象庁や自治体などの公式情報', '出所不明の投稿', '昔のうわさ', '題名だけの動画'], correctIndex: 0 },
];

// --- 富山県文化・自然・食 ---
const TOYAMA_BASE = [
  { text: '富山県の県庁所在地は？', options: ['高岡市', '富山市', '魚津市', '砺波市'], correctIndex: 1 },
  { text: '富山県の県花は？', options: ['チューリップ', 'ラベンダー', 'ひまわり', '梅'], correctIndex: 0 },
  { text: '富山県の県鳥は？', options: ['トキ', 'ライチョウ', 'タンチョウ', 'ウグイス'], correctIndex: 1 },
  { text: '富山県の県木は？', options: ['タテヤマスギ', 'ソメイヨシノ', 'アカマツ', 'イチョウ'], correctIndex: 0 },
  { text: '合掌造り集落で世界文化遺産に登録されている富山県の地域は？', options: ['五箇山', '宇奈月', '雨晴', '八尾'], correctIndex: 0 },
  { text: '「おわら風の盆」で有名な富山市の地域は？', options: ['八尾', '岩瀬', '呉羽', '水橋'], correctIndex: 0 },
  { text: '日本最古級の民謡「こきりこ」が伝わる地域は？', options: ['五箇山', '黒部峡谷', '氷見海岸', '立山山頂'], correctIndex: 0 },
  { text: '立山黒部アルペンルートが結ぶ二つの県は？', options: ['富山県と長野県', '富山県と福井県', '富山県と岐阜県', '富山県と石川県だけ'], correctIndex: 0 },
  { text: '立山黒部アルペンルートの春の名物は？', options: ['雪の大谷', '流氷', '砂丘', '桜島'], correctIndex: 0 },
  { text: '日本一の高さを誇ることで知られる富山県のダムは？', options: ['黒部ダム', '小河内ダム', '宮ヶ瀬ダム', '御母衣ダム'], correctIndex: 0 },
  { text: '富山湾の宝石と呼ばれる海産物は？', options: ['白えび', '伊勢えび', '毛がに', 'あわび'], correctIndex: 0 },
  { text: '春の富山湾を代表する、光る海産物は？', options: ['ホタルイカ', 'タコ', 'サンマ', 'ウニ'], correctIndex: 0 },
  { text: '冬の氷見を代表する魚は？', options: ['ひみ寒ぶり', 'うなぎ', 'かつお', 'ししゃも'], correctIndex: 0 },
  { text: '富山名物「ます寿し」で酢飯にのせる魚は？', options: ['サクラマス', 'マグロ', 'アジ', 'フグ'], correctIndex: 0 },
  { text: '富山の「ます寿し」は一般に何で包む？', options: ['笹の葉', '海苔だけ', '竹の皮だけ', '新聞紙'], correctIndex: 0 },
  { text: '濃い色の醤油スープで知られる富山のラーメンは？', options: ['富山ブラック', '札幌味噌', '博多豚骨', '喜多方'], correctIndex: 0 },
  { text: '高岡市の代表的な伝統工芸で、金属を鋳造するものは？', options: ['高岡銅器', '有田焼', '輪島塗', '南部鉄器'], correctIndex: 0 },
  { text: '高岡市で受け継がれる漆の伝統工芸は？', options: ['高岡漆器', '京友禅', '江戸切子', '博多人形'], correctIndex: 0 },
  { text: '南砺市井波の代表的な伝統工芸は？', options: ['井波彫刻', '西陣織', '備前焼', '箱根寄木細工'], correctIndex: 0 },
  { text: '国宝・瑞龍寺がある富山県の市は？', options: ['高岡市', '滑川市', '射水市', '南砺市'], correctIndex: 0 },
  { text: '雨晴海岸から富山湾越しに望める山々は？', options: ['立山連峰', '阿蘇山', '六甲山', '八ヶ岳だけ'], correctIndex: 0 },
  { text: '落差日本一として知られる立山町の滝は？', options: ['称名滝', '華厳滝', '那智滝', '袋田滝'], correctIndex: 0 },
  { text: '黒部峡谷を走る観光列車の愛称は？', options: ['トロッコ電車', 'ゆりかもめ', 'ロマンスカー', 'SLやまぐち号'], correctIndex: 0 },
  { text: '黒部峡谷の玄関口として知られる温泉地は？', options: ['宇奈月温泉', '草津温泉', '道後温泉', '別府温泉'], correctIndex: 0 },
  { text: '砺波市で春に開催される花のイベントは？', options: ['となみチューリップフェア', '雪まつり', 'ねぶた祭', '阿波おどり'], correctIndex: 0 },
  { text: '富山県のブランド米の名前は？', options: ['富富富', 'ななつぼし', '青天の霹靂', '森のくまさん'], correctIndex: 0 },
  { text: '富山市ガラス美術館が紹介する富山の文化は？', options: ['ガラス芸術', '砂像', '陶磁器だけ', '刀剣だけ'], correctIndex: 0 },
  { text: '万葉集の歌人・大伴家持とゆかりが深い富山県の市は？', options: ['高岡市', '那覇市', '奈良市だけ', '松山市'], correctIndex: 0 },
  { text: '富山湾が「天然のいけす」と呼ばれる理由は？', options: ['多様で新鮮な魚介が豊富', '魚が一種類だけ', '海がすべて人工', '一年中凍っている'], correctIndex: 0 },
  { text: 'ホタルイカミュージアムがある富山県の市は？', options: ['滑川市', '小矢部市', '砺波市', '高岡市'], correctIndex: 0 },
];

// Genuinely different prompts. The old 2,000-entry array repeated only
// 30 texts, so the same-match de-duplicator exhausted it after 30 encounters.
export const MOCK_QUESTIONS: Question[] = (() => {
  const groups = [
    { prefix: 'cult', level: undefined, questions: CULTURE_BASE },
    { prefix: 'lang', level: undefined, questions: LANGUAGE_BASE },
    { prefix: 'bousai', level: '防災', questions: DISASTER_BASE },
    { prefix: 'toyama', level: '富山', questions: TOYAMA_BASE },
  ];
  const questions: Question[] = groups.flatMap(group => group.questions.map((template, index) => ({
    id: `q-${group.prefix}-${index + 1}`,
    text: template.text,
    options: [...template.options],
    correctIndex: template.correctIndex,
    type: ('type' in template ? template.type : 'culture') as Question['type'],
    level: ('level' in template ? template.level : group.level) as string | undefined,
  })));

  // Fisher-Yates shuffle keeps categories mixed while preserving uniqueness.
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }

  return questions;
})();

export const BOT_NAMES = ['アカリ', 'カイト', 'ナナミ', 'ハヤテ', 'ミナト', 'サクラ', 'ツバサ', 'ヒカリ', 'レン', 'ユズ'];
export const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export const generateBots = (count: number): Player[] => {
  return Array.from({ length: count }).map(() => generateRandomBot());
};

export const generateRandomBot = (): Player => ({
  id: `bot-${crypto.randomUUID()}`,
  name: `${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]}${Math.floor(10 + Math.random() * 90)} 🤖`,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  isBot: true,
  iq: Math.floor(55 + Math.random() * 111),
});

// Helper to blend two hex colors
export const blendColors = (color1: string, color2: string): string => {
  const hex2rgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };
  const rgb1 = hex2rgb(color1);
  const rgb2 = hex2rgb(color2);
  const blended = rgb1.map((c, i) => Math.round((c + rgb2[i]) / 2));
  return `#${blended.map(c => c.toString(16).padStart(2, '0')).join('')}`;
};
