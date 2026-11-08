// FootPrint 的内置目的地。
//
// 在线地名库或 Wikipedia 不可用时，这些内容保证面板仍然可以定位、
// 给出简介和景点推荐。所有条目均按“城市”组织，坐标为城市中心附近。

export const PLACES = [
  {
    id: 'beijing',
    name: '北京',
    nameEn: 'Beijing',
    country: '中国',
    countryEn: 'China',
    lat: 39.9042,
    lon: 116.4074,
    aliases: ['北京', '北京市', 'beijing', 'peking', 'bj'],
    tagline: '古都中轴与胡同烟火',
    taglineEn: 'Imperial axes and hutong life',
    intro:
      '北京是中国的首都，也是一座拥有三千多年建城史的古都。中轴线串起故宫、天安门与钟鼓楼，胡同、四合院和当代艺术区在城中交错，适合把历史与日常放在同一段旅程里。',
    introEn:
      'Beijing is China’s capital and an ancient city with more than three thousand years of history. Its central axis links the Forbidden City, Tiananmen and the Drum and Bell Towers, while hutong lanes and contemporary art districts keep the past and everyday life intertwined.',
    attractions: [
      { id: 'forbidden-city', name: '故宫博物院', nameEn: 'Forbidden City', lat: 39.9163, lon: 116.3972, description: '明清两代皇宫，现存世界规模最大的木结构宫殿建筑群。建议从午门入、神武门出，预留半天。' },
      { id: 'great-wall', name: '八达岭长城', nameEn: 'Badaling Great Wall', lat: 40.3598, lon: 116.0200, description: '长城最具代表性的段落之一，城墙沿山脊起伏。清晨或傍晚光线最好，也能避开正午人流。' },
      { id: 'temple-of-heaven', name: '天坛公园', nameEn: 'Temple of Heaven', lat: 39.8822, lon: 116.4066, description: '明清皇帝祭天祈谷之所，祈年殿的蓝色琉璃瓦、回音壁与古柏群都值得慢慢看。' },
      { id: 'summer-palace', name: '颐和园', nameEn: 'Summer Palace', lat: 39.9999, lon: 116.2755, description: '以昆明湖、万寿山为骨架的皇家园林，长廊、佛香阁与十七孔桥适合留出半天漫步。' },
      { id: 'nanluoguxiang', name: '南锣鼓巷', nameEn: 'Nanluoguxiang', lat: 39.9370, lon: 116.4032, description: '元代胡同格局保留较完整的一片街区，可以串联周边胡同、小吃和四合院改建的小店。' },
    ],
  },
  {
    id: 'shanghai',
    name: '上海',
    nameEn: 'Shanghai',
    country: '中国',
    countryEn: 'China',
    lat: 31.2304,
    lon: 121.4737,
    aliases: ['上海', '上海市', 'shanghai', 'sh'],
    tagline: '江岸天际线与梧桐街区',
    taglineEn: 'A riverfront skyline and plane-tree lanes',
    intro:
      '上海把黄浦江两岸的两种城市面貌放在同一视野里：外滩的近代建筑群与陆家嘴的摩天楼隔水相望。往西走进梧桐掩映的街区，咖啡馆、老洋房和弄堂又构成另一套更日常的城市节奏。',
    introEn:
      'Shanghai sets two cityscapes across the Huangpu River: the historic Bund faces the skyscrapers of Lujiazui, while plane-tree-lined streets to the west reveal old villas, lanes and a more everyday rhythm.',
    attractions: [
      { id: 'the-bund', name: '外滩', nameEn: 'The Bund', lat: 31.2400, lon: 121.4900, description: '沿黄浦江展开的近代建筑群，傍晚到入夜可以一次看到万国建筑与对岸陆家嘴灯光。' },
      { id: 'yu-garden', name: '豫园', nameEn: 'Yu Garden', lat: 31.2270, lon: 121.4920, description: '明代江南园林，假山、廊桥与老城厢街市相连，适合和城隍庙一带一起逛。' },
      { id: 'shanghai-museum', name: '上海博物馆', nameEn: 'Shanghai Museum', lat: 31.2303, lon: 121.4707, description: '以中国古代青铜器、陶瓷和书画收藏见长，人民广场旁的一站式博物馆体验。' },
      { id: 'wukang-road', name: '武康路', nameEn: 'Wukang Road', lat: 31.2050, lon: 121.4370, description: '梧桐树下的历史街区，武康大楼是标志性取景地，沿路分布着老洋房与小店。' },
      { id: 'lujiazui', name: '陆家嘴', nameEn: 'Lujiazui', lat: 31.2397, lon: 121.4998, description: '上海天际线的核心，可从滨江步道、天桥或高层观景台看黄浦江转弯。' },
    ],
  },
  {
    id: 'xian',
    name: '西安',
    nameEn: "Xi'an",
    country: '中国',
    countryEn: 'China',
    lat: 34.3416,
    lon: 108.9398,
    aliases: ['西安', '西安市', "xi'an", 'xian', '长安'],
    tagline: '城墙以内，汉唐气象',
    taglineEn: 'Tang grandeur inside a Ming wall',
    intro:
      '西安是丝绸之路的东方起点之一，也是汉唐都城的所在地。完整的明城墙把老城圈在中间，碑林、清真寺和街巷藏在城墙以内；往东走，秦始皇兵马俑又把时间推得更远。',
    introEn:
      "Xi'an was a capital of the Han and Tang dynasties and an eastern gateway of the Silk Road. A complete Ming city wall encloses the old town, while the Terracotta Army lies farther east.",
    attractions: [
      { id: 'terracotta-army', name: '秦始皇兵马俑', nameEn: 'Terracotta Army', lat: 34.3841, lon: 109.2785, description: '秦始皇陵陪葬坑出土的陶俑军阵，一号坑的规模最震撼，建议预留半天并请讲解。' },
      { id: 'city-wall', name: '西安城墙', nameEn: 'Xi’an City Wall', lat: 34.2610, lon: 108.9420, description: '中国现存规模最大、保存最完整的古代城垣之一，可以骑行一圈，从永宁门上下最方便。' },
      { id: 'giant-wild-goose-pagoda', name: '大雁塔', nameEn: 'Giant Wild Goose Pagoda', lat: 34.2186, lon: 108.9640, description: '唐代玄奘译经与藏经之地，塔身与南北广场构成西安城南的地标。' },
      { id: 'muslim-quarter', name: '回民街', nameEn: 'Muslim Quarter', lat: 34.2650, lon: 108.9400, description: '鼓楼背后的老街巷，适合尝肉夹馍、泡馍和柿子饼，也能转进化觉巷清真寺。' },
    ],
  },
  {
    id: 'chengdu',
    name: '成都',
    nameEn: 'Chengdu',
    country: '中国',
    countryEn: 'China',
    lat: 30.5728,
    lon: 104.0668,
    aliases: ['成都', '成都市', 'chengdu', '蓉城'],
    tagline: '茶馆、火锅与熊猫',
    taglineEn: 'Teahouses, hotpot and pandas',
    intro:
      '成都的节奏藏在茶馆和巷子里。白天可以去大熊猫基地看熊猫吃竹子，下午回到老城喝茶、掏耳朵，晚上再用一顿火锅把一天收尾。城市周边还有青城山与都江堰可以延伸成两日行程。',
    introEn:
      'Chengdu moves at the pace of its teahouses and lanes. See pandas in the morning, spend the afternoon over tea in the old town, and finish with hotpot; Qingcheng Mountain and Dujiangyan are easy day trips.',
    attractions: [
      { id: 'panda-base', name: '成都大熊猫繁育研究基地', nameEn: 'Chengdu Panda Base', lat: 30.7350, lon: 104.1450, description: '看大熊猫最集中的地方，建议开园即到，上午是熊猫进食和活动的高峰。' },
      { id: 'kuanzhai', name: '宽窄巷子', nameEn: 'Kuanzhai Alleys', lat: 30.6690, lon: 104.0550, description: '由宽巷子、窄巷子和井巷子组成的历史街区，适合看院落、喝茶和吃小吃。' },
      { id: 'wuhou-shrine', name: '武侯祠', nameEn: 'Wuhou Shrine', lat: 30.6450, lon: 104.0430, description: '纪念诸葛亮的祠庙，与锦里相邻，红墙竹影是成都经典的取景处。' },
      { id: 'jinli', name: '锦里', nameEn: 'Jinli', lat: 30.6440, lon: 104.0450, description: '武侯祠旁的仿古街，晚上灯笼亮起后更有气氛，适合和武侯祠连着走。' },
      { id: 'dufu-cottage', name: '杜甫草堂', nameEn: 'Du Fu Thatched Cottage', lat: 30.6600, lon: 104.0280, description: '杜甫寓居成都时的旧居纪念地，园林清幽，适合慢慢读诗与散步。' },
    ],
  },
  {
    id: 'hangzhou',
    name: '杭州',
    nameEn: 'Hangzhou',
    country: '中国',
    countryEn: 'China',
    lat: 30.2741,
    lon: 120.1551,
    aliases: ['杭州', '杭州市', 'hangzhou', '临安'],
    tagline: '一半山水，一半城',
    taglineEn: 'A city folded around a lake',
    intro:
      '杭州的城市性格由西湖塑造。绕湖一周，可以看到断桥、苏堤、雷峰塔和层层叠叠的远山；往灵隐、龙井或西溪走，山水、茶田与湿地又把城市边缘变得安静。',
    introEn:
      'West Lake shapes Hangzhou. A circuit takes in Broken Bridge, Su Causeway, Leifeng Pagoda and layered hills, while Lingyin Temple, Longjing tea fields and Xixi Wetland slow the city’s edges.',
    attractions: [
      { id: 'west-lake', name: '西湖', nameEn: 'West Lake', lat: 30.2460, lon: 120.1490, description: '杭州最核心的风景线，苏堤春晓、断桥残雪和雷峰夕照各有最佳时段，步行或骑行都合适。' },
      { id: 'lingyin-temple', name: '灵隐寺', nameEn: 'Lingyin Temple', lat: 30.2400, lon: 120.0980, description: '藏在飞来峰下的千年古刹，飞来峰造像与寺院古木值得一起看。' },
      { id: 'xixi-wetland', name: '西溪国家湿地公园', nameEn: 'Xixi Wetland', lat: 30.2700, lon: 120.0700, description: '城市西侧的大片湿地，水道、芦苇和柿树构成安静的慢行路线。' },
      { id: 'longjing-village', name: '龙井村', nameEn: 'Longjing Village', lat: 30.2200, lon: 120.1100, description: '西湖龙井的核心产区，茶田沿山铺开，可以找一家茶农坐下来喝一杯当季新茶。' },
    ],
  },
  {
    id: 'guilin',
    name: '桂林',
    nameEn: 'Guilin',
    country: '中国',
    countryEn: 'China',
    lat: 25.2736,
    lon: 110.2900,
    aliases: ['桂林', '桂林市', 'guilin', '阳朔', 'yangshuo'],
    tagline: '喀斯特山水之间',
    taglineEn: 'Karst peaks and river light',
    intro:
      '桂林的风景由漓江和喀斯特峰林共同构成。从桂林到阳朔的水路是经典段落，山影倒映在江面上；上岸后可以骑车穿过稻田，或去龙脊看梯田顺着山势铺开。',
    introEn:
      'Guilin is defined by the Li River and its karst peaks. The classic route runs by water from Guilin to Yangshuo; on land, bicycle lanes cross rice fields and the Longji terraces climb the hills.',
    attractions: [
      { id: 'li-river', name: '漓江', nameEn: 'Li River', lat: 24.9000, lon: 110.4500, description: '桂林山水的代表，竹筏或游船可以从水面看九马画山、黄布倒影等峰林景观。' },
      { id: 'elephant-trunk-hill', name: '象鼻山', nameEn: 'Elephant Trunk Hill', lat: 25.2670, lon: 110.2960, description: '桂林城徽的原型，山体伸入江中形成象鼻形状，适合作为市区短途一站。' },
      { id: 'longji-terraces', name: '龙脊梯田', nameEn: 'Longji Rice Terraces', lat: 25.7500, lon: 110.1300, description: '瑶壮村寨间的梯田从山脚盘到山顶，灌水期和秋收前层次最清楚，建议住一晚。' },
      { id: 'yangshuo-west-street', name: '阳朔西街', nameEn: 'Yangshuo West Street', lat: 24.7780, lon: 110.4960, description: '阳朔老城的步行街，白天适合补给和找骑行路线，晚上餐馆与酒吧很热闹。' },
    ],
  },
  {
    id: 'lhasa',
    name: '拉萨',
    nameEn: 'Lhasa',
    country: '中国',
    countryEn: 'China',
    lat: 29.6520,
    lon: 91.1721,
    aliases: ['拉萨', '拉萨市', 'lhasa', '日光城'],
    tagline: '高原上的日光与转经路',
    taglineEn: 'High-altitude light and pilgrimage paths',
    intro:
      '拉萨坐落在海拔约 3650 米的河谷里，阳光强烈，空气稀薄。布达拉宫统领城市天际线，八廓街和大昭寺周围则从清晨开始就有转经的人流。初到高原要给身体留出适应时间。',
    introEn:
      'Lhasa sits in a river valley at about 3,650 metres, with intense sun and thin air. The Potala Palace dominates the skyline, while pilgrims circle the Jokhang and Barkhor from early morning.',
    attractions: [
      { id: 'potala-palace', name: '布达拉宫', nameEn: 'Potala Palace', lat: 29.6578, lon: 91.1172, description: '建在红山上的宫堡式建筑群，参观需提前预约并注意高原体力，内部禁止拍照。' },
      { id: 'jokhang', name: '大昭寺', nameEn: 'Jokhang Temple', lat: 29.6530, lon: 91.1320, description: '藏传佛教最重要的寺院之一，门前与八廓街的朝圣者构成拉萨最有生活感的画面。' },
      { id: 'barkhor', name: '八廓街', nameEn: 'Barkhor Street', lat: 29.6535, lon: 91.1330, description: '围绕大昭寺的转经道，顺时针行走，两侧是老字号、唐卡店和甜茶馆。' },
      { id: 'sera-monastery', name: '色拉寺', nameEn: 'Sera Monastery', lat: 29.7000, lon: 91.1330, description: '拉萨三大寺之一，下午的辩经活动很有感染力，寺院建筑沿山坡展开。' },
    ],
  },
  {
    id: 'hong-kong',
    name: '香港',
    nameEn: 'Hong Kong',
    country: '中国',
    countryEn: 'China',
    lat: 22.3193,
    lon: 114.1694,
    aliases: ['香港', 'hong kong', 'hongkong', 'hk'],
    tagline: '山海之间的高密度城市',
    taglineEn: 'A dense city between hills and sea',
    intro:
      '香港把高密度城市和山海放在很近的距离里。维港两岸的天际线是它的第一印象，但真正好玩的常常是半山扶梯、旧唐楼、离岛渡轮和街市；一天之内可以从摩天楼走到海边山径。',
    introEn:
      'Hong Kong packs a dense city between hills and sea. The harbour skyline is the first impression, but the city reveals itself in escalators, old tenements, outlying-island ferries and wet markets.',
    attractions: [
      { id: 'victoria-harbour', name: '维多利亚港', nameEn: 'Victoria Harbour', lat: 22.2930, lon: 114.1690, description: '香港的城市客厅，可以从尖沙咀海滨、天星小轮或太平山顶看两岸天际线。' },
      { id: 'victoria-peak', name: '太平山顶', nameEn: 'Victoria Peak', lat: 22.2710, lon: 114.1500, description: '俯瞰维港的最佳位置，傍晚坐山顶缆车上去，可以同时看到日景和夜景。' },
      { id: 'tian-tan-buddha', name: '天坛大佛', nameEn: 'Tian Tan Buddha', lat: 22.2540, lon: 113.9050, description: '大屿山昂坪的高座青铜佛像，缆车沿途能看到海、山和机场，适合安排半日。' },
      { id: 'temple-street', name: '庙街夜市', nameEn: 'Temple Street Night Market', lat: 22.3090, lon: 114.1700, description: '油麻地的街头夜市，摊档、煲仔饭和粤曲声混在一起，是九龙夜晚的市井切面。' },
    ],
  },
  {
    id: 'tokyo',
    name: '东京',
    nameEn: 'Tokyo',
    country: '日本',
    countryEn: 'Japan',
    lat: 35.6762,
    lon: 139.6503,
    aliases: ['东京', 'tokyo', '東京', 'とうきょう'],
    tagline: '巨大都市里的秩序与细节',
    taglineEn: 'Order and detail in a megacity',
    intro:
      '东京是一座可以按兴趣自由拼接的城市：浅草保留着老东京的寺院与商店街，涩谷和新宿代表高密度消费文化，明治神宫与代代木公园则提供大片绿意。轨道交通把这一切连成一张细密的网。',
    introEn:
      'Tokyo can be assembled to taste: Asakusa keeps old temple streets, Shibuya and Shinjuku the dense consumer culture, and Meiji Shrine with Yoyogi Park offers a breath of green. Trains tie it all together.',
    attractions: [
      { id: 'sensoji', name: '浅草寺', nameEn: 'Senso-ji', lat: 35.7148, lon: 139.7967, description: '东京最古老的寺院，雷门、仲见世商店街和本堂构成一条完整的参拜动线。' },
      { id: 'meiji-shrine', name: '明治神宫', nameEn: 'Meiji Shrine', lat: 35.6764, lon: 139.6993, description: '藏在代代木公园旁的大片森林里，参道宽阔，适合清晨来避开人流。' },
      { id: 'shibuya-crossing', name: '涩谷十字路口', nameEn: 'Shibuya Crossing', lat: 35.6595, lon: 139.7005, description: '东京最著名的人流景观，可以从周边高处的咖啡馆或观景台俯瞰。' },
      { id: 'tokyo-tower', name: '东京塔', nameEn: 'Tokyo Tower', lat: 35.6586, lon: 139.7454, description: '红白相间的经典电视塔，芝公园一侧可以拍到塔身与城市街道同框。' },
      { id: 'ueno-park', name: '上野公园', nameEn: 'Ueno Park', lat: 35.7148, lon: 139.7730, description: '博物馆群、动物园和樱花道集中在一片公园里，适合安排一整个下午。' },
    ],
  },
  {
    id: 'kyoto',
    name: '京都',
    nameEn: 'Kyoto',
    country: '日本',
    countryEn: 'Japan',
    lat: 35.0116,
    lon: 135.7681,
    aliases: ['京都', 'kyoto', 'きょうと'],
    tagline: '寺院、町屋与四季',
    taglineEn: 'Temples, machiya and the seasons',
    intro:
      '京都把一千多年的都城历史保存在寺院、神社和町屋街巷里。清水寺与东山一带适合清晨步行，伏见稻荷的千本鸟居沿山而上；如果时间允许，去岚山看竹林和渡月桥会把节奏放慢。',
    introEn:
      'Kyoto keeps more than a millennium of capital history in its temples, shrines and machiya lanes. Walk Higashiyama early, climb Fushimi Inari’s torii paths, and slow down in Arashiyama.',
    attractions: [
      { id: 'kiyomizu', name: '清水寺', nameEn: 'Kiyomizu-dera', lat: 34.9949, lon: 135.7850, description: '悬空的木舞台是标志，沿二年坂、三年坂上山，清晨人少时最有古都气氛。' },
      { id: 'fushimi-inari', name: '伏见稻荷大社', nameEn: 'Fushimi Inari Taisha', lat: 34.9671, lon: 135.7727, description: '千本鸟居沿稻荷山铺开，走到四辻约需半小时，越往上人越少。' },
      { id: 'kinkakuji', name: '金阁寺', nameEn: 'Kinkaku-ji', lat: 35.0394, lon: 135.7292, description: '金箔覆盖的舍利殿倒映在镜湖池中，是京都最直接的视觉名片。' },
      { id: 'arashiyama', name: '岚山竹林', nameEn: 'Arashiyama Bamboo Grove', lat: 35.0170, lon: 135.6710, description: '竹林小径与渡月桥、保津川组成岚山经典路线，建议早上八点前到达。' },
    ],
  },
  {
    id: 'paris',
    name: '巴黎',
    nameEn: 'Paris',
    country: '法国',
    countryEn: 'France',
    lat: 48.8566,
    lon: 2.3522,
    aliases: ['巴黎', 'paris', 'parís'],
    tagline: '塞纳河两岸的艺术与日常',
    taglineEn: 'Art and daily life along the Seine',
    intro:
      '巴黎适合沿着塞纳河慢慢展开：西边是埃菲尔铁塔，中间是卢浮宫与杜乐丽花园，东边是圣母院和玛黑区。博物馆之外，面包店、市场与河岸书摊才是这座城市最稳定的日常。',
    introEn:
      'Paris unfolds along the Seine, from the Eiffel Tower in the west through the Louvre and Tuileries to Notre-Dame and the Marais. Beyond museums, bakeries, markets and riverside booksellers set the everyday rhythm.',
    attractions: [
      { id: 'eiffel-tower', name: '埃菲尔铁塔', nameEn: 'Eiffel Tower', lat: 48.8584, lon: 2.2945, description: '巴黎最清晰的城市符号，战神广场、夏乐宫和塞纳河对岸都是经典取景角度。' },
      { id: 'louvre', name: '卢浮宫', nameEn: 'Louvre Museum', lat: 48.8606, lon: 2.3376, description: '从古代近东到欧洲绘画的巨型收藏，建议提前选好两三个展厅，不要试图一次看完。' },
      { id: 'notre-dame', name: '巴黎圣母院', nameEn: 'Notre-Dame de Paris', lat: 48.8530, lon: 2.3499, description: '西堤岛上的哥特式主教座堂，修复后重新开放，周边的塞纳河岸适合散步。' },
      { id: 'montmartre', name: '蒙马特高地', nameEn: 'Montmartre', lat: 48.8867, lon: 2.3431, description: '圣心堂所在的山丘，石阶、画室和小酒馆保留着旧巴黎的波希米亚想象。' },
      { id: 'seine', name: '塞纳河', nameEn: 'The Seine', lat: 48.8580, lon: 2.3300, description: '把巴黎主要地标串起来的水上轴线，傍晚从游船或河岸看桥梁与建筑最舒服。' },
    ],
  },
  {
    id: 'london',
    name: '伦敦',
    nameEn: 'London',
    country: '英国',
    countryEn: 'United Kingdom',
    lat: 51.5074,
    lon: -0.1278,
    aliases: ['伦敦', 'london', 'londres'],
    tagline: '博物馆、公园与泰晤士河',
    taglineEn: 'Museums, parks and the Thames',
    intro:
      '伦敦的旅行可以围绕泰晤士河展开，也可以完全钻进博物馆和公园。大英博物馆、国家美术馆等主要馆藏大多免费；从西敏寺到塔桥的河岸步行，则能把议会大厦、伦敦眼和旧城串成一条完整路线。',
    introEn:
      'London can be planned around the Thames or around its museums and parks. Major collections such as the British Museum are free, and a river walk from Westminster to Tower Bridge links Parliament, the Eye and the old City.',
    attractions: [
      { id: 'british-museum', name: '大英博物馆', nameEn: 'British Museum', lat: 51.5194, lon: -0.1270, description: '世界级百科全书式博物馆，罗塞塔石碑、帕特农神庙雕塑和埃及馆是重点，免费入馆。' },
      { id: 'tower-bridge', name: '伦敦塔桥', nameEn: 'Tower Bridge', lat: 51.5055, lon: -0.0754, description: '泰晤士河上最具辨识度的桥，可以上桥面观景，也能沿河岸看它与伦敦塔同框。' },
      { id: 'westminster-abbey', name: '威斯敏斯特教堂', nameEn: 'Westminster Abbey', lat: 51.4993, lon: -0.1273, description: '英国君主加冕与安葬之地，哥特式内部和诗人角值得留出一小时以上。' },
      { id: 'london-eye', name: '伦敦眼', nameEn: 'London Eye', lat: 51.5033, lon: -0.1196, description: '泰晤士河南岸的观景摩天轮，傍晚时段可以同时看到城市日落与亮灯。' },
      { id: 'borough-market', name: '博罗市场', nameEn: 'Borough Market', lat: 51.5055, lon: -0.0910, description: '伦敦老牌食品市场，奶酪、面包、生蚝和街头小吃集中，适合安排一顿 casual 午餐。' },
    ],
  },
  {
    id: 'rome',
    name: '罗马',
    nameEn: 'Rome',
    country: '意大利',
    countryEn: 'Italy',
    lat: 41.9028,
    lon: 12.4964,
    aliases: ['罗马', 'rome', 'roma', 'rom'],
    tagline: '露天博物馆里的日常',
    taglineEn: 'Daily life inside an open-air museum',
    intro:
      '罗马把古罗马遗迹、文艺复兴宫殿和日常生活叠在同一片街区里。斗兽场与古罗马广场适合一早去，下午可以把万神殿、特雷维喷泉和纳沃纳广场连成一条步行路线，中间随时停下来吃一支冰淇淋。',
    introEn:
      'Rome layers ancient ruins, Renaissance palaces and everyday life in the same streets. Start early at the Colosseum and Forum, then link the Pantheon, Trevi Fountain and Piazza Navona on foot.',
    attractions: [
      { id: 'colosseum', name: '罗马斗兽场', nameEn: 'Colosseum', lat: 41.8902, lon: 12.4922, description: '古罗马最大的圆形竞技场，建议预约早场并和古罗马广场、帕拉蒂尼山买联票。' },
      { id: 'pantheon', name: '万神殿', nameEn: 'Pantheon', lat: 41.8986, lon: 12.4769, description: '穹顶中央的圆洞是唯一采光口，建筑比例和内部大理石值得安静看一会儿。' },
      { id: 'vatican-museums', name: '梵蒂冈博物馆', nameEn: 'Vatican Museums', lat: 41.9065, lon: 12.4536, description: '从古典雕塑到拉斐尔房间和西斯廷礼拜堂，路线很长，务必提前预约。' },
      { id: 'trevi-fountain', name: '特雷维喷泉', nameEn: 'Trevi Fountain', lat: 41.9009, lon: 12.4833, description: '巴洛克喷泉的代表，清晨人最少；投硬币的传统动作要背对水池完成。' },
      { id: 'roman-forum', name: '古罗马广场', nameEn: 'Roman Forum', lat: 41.8925, lon: 12.4853, description: '古罗马政治与宗教生活的中心，残垣之间适合配合讲解想象城市全貌。' },
    ],
  },
  {
    id: 'new-york',
    name: '纽约',
    nameEn: 'New York',
    country: '美国',
    countryEn: 'United States',
    lat: 40.7128,
    lon: -74.0060,
    aliases: ['纽约', 'new york', 'newyork', 'nyc', '纽约市'],
    tagline: '街区、博物馆与天际线',
    taglineEn: 'Neighbourhoods, museums and skyline',
    intro:
      '纽约最适合按街区来玩：曼哈顿中城的摩天楼、中央公园的绿意、大都会博物馆的收藏，以及下城的高线公园和自由女神像。地铁几乎能到所有地方，步行则更容易撞见街头生活。',
    introEn:
      'New York is best explored neighbourhood by neighbourhood: Midtown towers, Central Park, the Met, and Lower Manhattan’s High Line and Statue of Liberty. The subway reaches everything; walking reveals the street life.',
    attractions: [
      { id: 'met', name: '大都会艺术博物馆', nameEn: 'The Met', lat: 40.7794, lon: -73.9632, description: '西半球最大的艺术博物馆之一，埃及馆、欧洲绘画和美国馆都值得单独安排时间。' },
      { id: 'central-park', name: '中央公园', nameEn: 'Central Park', lat: 40.7829, lon: -73.9654, description: '曼哈顿中城北侧的大片绿肺，从 Bethesda Terrace 到水库一带适合步行或租自行车。' },
      { id: 'statue-of-liberty', name: '自由女神像', nameEn: 'Statue of Liberty', lat: 40.6892, lon: -74.0445, description: '从 Battery Park 坐渡轮前往自由岛，登基座需提前预约，回程可以顺路看埃利斯岛。' },
      { id: 'empire-state', name: '帝国大厦', nameEn: 'Empire State Building', lat: 40.7484, lon: -73.9857, description: '装饰艺术风格摩天楼，86 层观景台可以看曼哈顿网格与远处的新泽西。' },
      { id: 'high-line', name: '高线公园', nameEn: 'The High Line', lat: 40.7480, lon: -74.0048, description: '由废弃高架铁路改造的空中步道，串联切尔西市场、画廊区和哈德逊广场。' },
    ],
  },
  {
    id: 'istanbul',
    name: '伊斯坦布尔',
    nameEn: 'Istanbul',
    country: '土耳其',
    countryEn: 'Türkiye',
    lat: 41.0082,
    lon: 28.9784,
    aliases: ['伊斯坦布尔', 'istanbul', '君士坦丁堡', 'constantine'],
    tagline: '两洲之间，帝国层叠',
    taglineEn: 'Two continents, layered empires',
    intro:
      '伊斯坦布尔横跨博斯普鲁斯海峡，欧洲与亚洲在此相接。老城半岛集中了圣索菲亚、蓝色清真寺和托普卡帕宫，渡轮则把加拉塔、于斯屈达尔和博斯普鲁斯沿岸连成另一条水上路线。',
    introEn:
      'Istanbul straddles the Bosphorus, joining Europe and Asia. The historic peninsula holds Hagia Sophia, the Blue Mosque and Topkapı Palace, while ferries link Galata, Üsküdar and the Bosphorus shore.',
    attractions: [
      { id: 'hagia-sophia', name: '圣索菲亚大教堂', nameEn: 'Hagia Sophia', lat: 41.0086, lon: 28.9802, description: '拜占庭建筑的代表，巨大穹顶与马赛克历经教堂、清真寺和博物馆的多次身份转换。' },
      { id: 'blue-mosque', name: '蓝色清真寺', nameEn: 'Blue Mosque', lat: 41.0054, lon: 28.9768, description: '以内部蓝色瓷砖闻名，仍在使用的清真寺，参观时注意礼拜时间和着装。' },
      { id: 'topkapi', name: '托普卡帕宫', nameEn: 'Topkapı Palace', lat: 41.0115, lon: 28.9833, description: '奥斯曼帝国苏丹的宫殿，庭院、后宫与珍宝馆可以安排半天，从宫墙边能看博斯普鲁斯。' },
      { id: 'grand-bazaar', name: '大巴扎', nameEn: 'Grand Bazaar', lat: 41.0108, lon: 28.9680, description: '有顶棚的巨型市场，数千家店铺按品类分布，适合买香料、灯具和手工地毯。' },
      { id: 'bosphorus', name: '博斯普鲁斯海峡', nameEn: 'Bosphorus', lat: 41.0900, lon: 29.0600, description: '坐渡轮看两岸宫殿、木宅和桥梁，是理解这座城市“两洲之间”位置的最好方式。' },
    ],
  },
  {
    id: 'barcelona',
    name: '巴塞罗那',
    nameEn: 'Barcelona',
    country: '西班牙',
    countryEn: 'Spain',
    lat: 41.3874,
    lon: 2.1686,
    aliases: ['巴塞罗那', 'barcelona', 'bcn', '巴塞'],
    tagline: '高迪曲线与地中海',
    taglineEn: 'Gaudí curves and the Mediterranean',
    intro:
      '巴塞罗那把高迪的建筑、哥特区的窄巷和地中海海滩放在同一座城市里。圣家堂、桂尔公园和巴特罗之家构成高迪主线；从哥特区走到海边，再拐进波盖利亚市场，是另一种更日常的巴塞罗那。',
    introEn:
      'Barcelona combines Gaudí’s architecture, the Gothic Quarter’s lanes and Mediterranean beaches. Follow Gaudí through the Sagrada Família, Park Güell and Casa Batlló, then walk from the old town to the sea.',
    attractions: [
      { id: 'sagrada-familia', name: '圣家堂', nameEn: 'Sagrada Família', lat: 41.4036, lon: 2.1744, description: '高迪未完成的大教堂，内部彩色玻璃的光影是重点，登塔需单独预约。' },
      { id: 'park-guell', name: '桂尔公园', nameEn: 'Park Güell', lat: 41.4145, lon: 2.1527, description: '高迪设计的山坡公园，马赛克蜥蜴和波浪长椅是标志，观景台能看全城与海。' },
      { id: 'casa-batllo', name: '巴特罗之家', nameEn: 'Casa Batlló', lat: 41.3917, lon: 2.1649, description: '格拉西亚大道上的高迪住宅，立面像龙鳞与骨骼，内部曲线和天井光影值得细看。' },
      { id: 'gothic-quarter', name: '哥特区', nameEn: 'Gothic Quarter', lat: 41.3839, lon: 2.1762, description: '巴塞罗那老城的核心，罗马城墙遗迹、大教堂和窄巷小广场适合无目的地乱走。' },
      { id: 'la-boqueria', name: '波盖利亚市场', nameEn: 'La Boqueria', lat: 41.3818, lon: 2.1715, description: '兰布拉大道旁的老市场，火腿、海鲜、果汁和 Tapas 吧台集中，上午最有生活气。' },
    ],
  },
];

const EARTH_RADIUS_KM = 6371;

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s,，.。·'’"“”\-_/()（）]+/g, '');
}

export function materializePlace(place, lang = 'zh') {
  const zh = lang !== 'en';
  const name = zh ? place.name : place.nameEn;
  const country = zh ? place.country : place.countryEn;
  return {
    id: `curated:${place.id}`,
    curatedId: place.id,
    name,
    nameZh: place.name,
    nameEn: place.nameEn,
    localName: place.name,
    displayName: `${name} · ${country}`,
    country,
    lat: place.lat,
    lon: place.lon,
    kind: 'city',
    category: 'city',
    tagline: zh ? place.tagline : place.taglineEn,
    intro: zh ? place.intro : place.introEn || place.intro,
    source: 'guide',
    attractions: place.attractions.map((item, index) => ({
      id: `curated:${place.id}:${item.id}`,
      name: zh ? item.name : item.nameEn,
      nameZh: item.name,
      nameEn: item.nameEn,
      lat: item.lat,
      lon: item.lon,
      description: zh
        ? item.description
        : item.descriptionEn || `A stop worth seeking out in ${place.nameEn}.`,
      distance: Math.round(haversineKm(place.lat, place.lon, item.lat, item.lon) * 10) / 10,
      order: index,
      source: 'guide',
    })),
  };
}

export function materializeAttraction(place, attraction, lang = 'zh') {
  const zh = lang !== 'en';
  const name = zh ? attraction.name : attraction.nameEn;
  const cityName = zh ? place.name : place.nameEn;
  const country = zh ? place.country : place.countryEn;
  return {
    id: `curated:${place.id}:${attraction.id}`,
    curatedId: place.id,
    name,
    nameZh: attraction.name,
    nameEn: attraction.nameEn,
    localName: attraction.name,
    displayName: `${name} · ${cityName}, ${country}`,
    country,
    lat: attraction.lat,
    lon: attraction.lon,
    kind: 'attraction',
    category: 'attraction',
    intro: zh
      ? attraction.description
      : attraction.descriptionEn || `${attraction.nameEn} is a highlight of ${cityName}.`,
    source: 'guide',
    attractions: [],
  };
}

export function searchCurated(term, limit = 6, lang = 'zh') {
  const q = normalize(term);
  if (!q) return [];
  const matches = [];
  for (const place of PLACES) {
    const names = [place.name, place.nameEn, ...(place.aliases || [])].map(normalize);
    let cityScore = 0;
    for (const candidate of names) {
      if (!candidate) continue;
      if (candidate === q) cityScore = Math.max(cityScore, 120);
      else if (candidate.startsWith(q)) cityScore = Math.max(cityScore, 90);
      else if (candidate.includes(q)) cityScore = Math.max(cityScore, 70);
      else if (q.length >= 2 && q.includes(candidate)) cityScore = Math.max(cityScore, 50);
    }
    if (cityScore > 0) matches.push({ type: 'city', place, score: cityScore });
    for (const attraction of place.attractions || []) {
      const sights = [attraction.name, attraction.nameEn].map(normalize);
      let sightScore = 0;
      for (const candidate of sights) {
        if (!candidate) continue;
        if (candidate === q) sightScore = Math.max(sightScore, 108);
        else if (candidate.startsWith(q)) sightScore = Math.max(sightScore, 86);
        else if (candidate.includes(q)) sightScore = Math.max(sightScore, 64);
      }
      if (sightScore > 0) {
        matches.push({ type: 'attraction', place, attraction, score: sightScore });
      }
    }
  }
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((match) =>
      match.type === 'attraction'
        ? materializeAttraction(match.place, match.attraction, lang)
        : materializePlace(match.place, lang),
    );
}

export function nearestCurated(lat, lon) {
  let best = null;
  let bestDistance = Infinity;
  for (const place of PLACES) {
    const distance = haversineKm(lat, lon, place.lat, place.lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = place;
    }
  }
  return best ? { place: best, distanceKm: bestDistance } : null;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
