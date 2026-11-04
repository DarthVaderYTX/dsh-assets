window.__ModuleLoader__.load({
  id: 'dsh-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-pet';
    const STORE_KEY = 'dsh.pet.v1';
    const SCALE = 3; // 32×36 的像素格 → 96×108
    const TICK_MS = 110;
    const HAPPY_MS = 950;
    const BUBBLE_MS = 1700;
    const BREED_ORDER = ['tabby', 'white', 'black', 'chinchilla', 'golden', 'samoyed', 'husky'];

    // ------------------------------------------------------------ 精灵开始
    // #region sprite

// 像素宠物精灵：32×36 网格，几何铺色 + 自动描边 + 体积明暗 + 品种花纹。
// 纯函数、不依赖 React；按帧参数生成（呼吸 / 眨眼 / 尾巴 / 表情 / 耳朵）。

const W = 32;
const H = 36;

/** 七个品种：耳朵形状、花纹、以及后面动画用的性格参数在 pet.js 里。 */
const BREEDS = {
  tabby: { species: 'cat', ear: 'pointy', pattern: 'tabby' },
  white: { species: 'cat', ear: 'pointy', pattern: 'none' },
  black: { species: 'cat', ear: 'pointy', pattern: 'sheen' },
  chinchilla: { species: 'cat', ear: 'pointy', pattern: 'gold' },
  golden: { species: 'dog', ear: 'floppy', pattern: 'none' },
  samoyed: { species: 'dog', ear: 'prick', pattern: 'fluff' },
  husky: { species: 'dog', ear: 'prick', pattern: 'mask' },
};

const PALETTES = {
  // 狸花：灰褐底 + 深色虎斑
  tabby: {
    o: '#3a2c22', f: '#b09a7c', F: '#6f5c47', L: '#d3c2a6', w: '#f4ead6',
    p: '#f0a0b4', i: '#8fbf5e', s: '#ffffff', e: '#2a1d17', t: '#ff8fa8', r: '#e0563f', g: '#e8c05a',
  },
  // 白猫
  white: {
    o: '#8c7f74', f: '#fdfaf4', F: '#e6dcd0', L: '#ffffff', w: '#ffffff',
    p: '#ffb3c6', i: '#79b9e6', s: '#ffffff', e: '#3a3230', t: '#ff8fa8', r: '#e0563f', g: '#e8c05a',
  },
  // 黑猫
  black: {
    o: '#141115', f: '#443b49', F: '#302a35', L: '#6f6679', w: '#574f5e',
    p: '#c98a9c', i: '#f2c14e', s: '#fff6c9', e: '#12100f', t: '#e08aa0', r: '#e0563f', g: '#e8c05a',
  },
  // 金渐层：奶油底、毛尖带金
  chinchilla: {
    o: '#584636', f: '#f0e0c0', F: '#d8c49c', L: '#fff8e6', w: '#fffaf0',
    p: '#ffb3c6', i: '#86b96b', s: '#ffffff', e: '#3a2f26', t: '#ff8fa8', r: '#e0563f', g: '#d9a94e',
  },
  // 金毛
  golden: {
    o: '#4a2f18', f: '#e6a955', F: '#c1843a', L: '#f8d191', w: '#fff1d9',
    p: '#f0a0b4', i: '#5a3a1e', s: '#ffffff', e: '#2b1d14', t: '#ff7f9c', r: '#d94f3d', g: '#e8c05a',
  },
  // 萨摩耶
  samoyed: {
    o: '#6f6862', f: '#fdfbf6', F: '#e4ded4', L: '#ffffff', w: '#ffffff',
    p: '#ffb3c6', i: '#3c3029', s: '#ffffff', e: '#2b211d', t: '#ff8fa8', r: '#5aa0e0', g: '#e8c05a',
  },
  // 哈士奇
  husky: {
    o: '#33383d', f: '#98a0a7', F: '#4c5259', L: '#cdd4da', w: '#fdfbf7',
    p: '#ffb3c6', i: '#7ec8e3', s: '#ffffff', e: '#201c1a', t: '#ff8fa8', r: '#d94f3d', g: '#e8c05a',
  },
};

const blank = () => Array.from({ length: H }, () => new Array(W).fill('.'));

function put(g, x, y, ch) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  g[iy][ix] = ch;
}

function ellipse(g, cx, cy, rx, ry, ch) {
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) g[y][x] = ch;
    }
  }
}

function rounded(g, x0, y0, w, h, ch, radius) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const cx = Math.min(Math.max(x + 0.5, x0 + radius), x0 + w - radius);
      const cy = Math.min(Math.max(y + 0.5, y0 + radius), y0 + h - radius);
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      put(g, x, y, ch);
    }
  }
}

function triangle(g, a, b, c, ch) {
  const cross = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const p = [x + 0.5, y + 0.5];
      const d1 = cross(p, a, b);
      const d2 = cross(p, b, c);
      const d3 = cross(p, c, a);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) g[y][x] = ch;
    }
  }
}

function mirror(g) {
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W / 2; x += 1) g[y][W - 1 - x] = g[y][x];
  }
}

function outlined(g) {
  const out = g.map((row) => row.slice());
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (g[y][x] !== '.') continue;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < W && ny < H && g[ny][nx] !== '.';
      });
      if (touches) out[y][x] = 'o';
    }
  }
  return out;
}

function rimShadow(rows) {
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (rows[y][x] !== 'f') continue;
      if (rows[y][x + 1] === 'o' || (rows[y][x + 2] === 'o' && rows[y][x + 1] === 'f')) rows[y][x] = 'F';
    }
  }
  return rows;
}

// --------------------------------------------------------------- 形体

function drawEars(g, breed, frame) {
  const ear = BREEDS[breed].ear;
  const twitch = frame.ear ? 1 : 0;

  if (ear === 'pointy') {
    // 猫：尖耳 + 圆底
    ellipse(g, 9.4, 9.0 - twitch * 0.6, 3.4, 3.4, 'f');
    triangle(g, [6.6 - twitch * 0.9, 1.2 + twitch * 0.5], [4.6, 10.0], [12.8, 7.4], 'f');
    mirror(g);
    return;
  }

  if (ear === 'prick') {
    // 萨摩耶 / 哈士奇：立耳，三角更厚，左右张开
    triangle(g, [7.0 - twitch * 0.8, 1.0 + twitch * 0.4], [4.8, 9.6], [12.4, 6.6], 'f');
    ellipse(g, 9.2, 8.4 - twitch * 0.5, 2.8, 2.8, 'f');
    mirror(g);
    return;
  }

  // 金毛：垂耳（头画完再压上去）
}

function drawFloppy(g, frame) {
  const drop = frame.ear ? 0.8 : 0;
  ellipse(g, 8.2, 12.0 + drop, 2.0, 5.0, 'F');
  ellipse(g, 7.8, 16.0 + drop, 1.9, 1.9, 'F');
  mirror(g);
}

function bodyShape(breed, frame) {
  const art = BREEDS[breed];
  const cat = art.species === 'cat';
  const g = blank();
  const bob = frame.breath ? -1 : 0;

  rounded(g, 9, 20, 15, 14, 'f', 5);
  drawEars(g, breed, frame);

  ellipse(g, 16, 13.4 + bob, 8.4, 7.6, 'f');

  if (art.ear === 'floppy') drawFloppy(g, frame);

  if (cat) ellipse(g, 16, 17.6 + bob, 4.8, 3.0, 'w');
  else ellipse(g, 16, 17.8 + bob, 5.6, 3.8, 'w');

  ellipse(g, 16, 29.6, 4.6, 4.2, 'w');
  ellipse(g, 13.0, 33.4, 2.6, 1.5, 'w');
  mirror(g);

  return g;
}

// --------------------------------------------------------------- 花纹

function paintPattern(rows, breed, frame) {
  const pattern = BREEDS[breed].pattern;
  const bob = frame.breath ? -1 : 0;
  const only = (x, y, ch, allowed) => {
    if (y < 0 || y >= H || x < 0 || x >= W) return;
    if (allowed.includes(rows[y][x])) rows[y][x] = ch;
  };
  const fur = ['f', 'F', 'L'];

  if (pattern === 'tabby') {
    // 额头三道虎斑 + 两颊各一道 + 身上两道 + 尾巴环
    for (const [x, y, w] of [[14, 8, 1], [16, 8, 1], [18, 8, 1], [14, 9, 1], [16, 9, 1], [18, 9, 2]]) {
      for (let i = 0; i < w; i += 1) only(x + i, y + bob, 'F', fur);
    }
    for (const [x, y] of [[8, 14], [9, 14], [8, 15], [9, 15], [22, 14], [23, 14], [22, 15], [23, 15]]) {
      only(x, y + bob, 'F', fur);
    }
    for (const [x, y] of [[11, 24], [12, 24], [11, 25], [12, 25], [19, 24], [20, 24], [19, 25], [20, 25]]) {
      only(x, y, 'F', fur);
    }
  }

  if (pattern === 'gold') {
    // 金渐层：头顶到背脊的金色毛尖
    for (const [x, y] of [[13, 7], [14, 7], [17, 7], [18, 7], [13, 8], [18, 8], [12, 9], [19, 9]]) {
      only(x, y + bob, 'g', fur);
    }
    for (const [x, y] of [[11, 22], [12, 22], [19, 22], [20, 22], [11, 23], [20, 23], [10, 24], [21, 24]]) {
      only(x, y, 'g', fur);
    }
  }

  if (pattern === 'sheen') {
    // 黑猫：一道冷调高光，避免整只糊成一团
    for (const [x, y] of [[12, 7], [13, 6], [14, 6], [12, 8], [11, 10], [10, 11], [10, 12]]) {
      only(x, y + bob, 'L', fur);
    }
    for (const [x, y] of [[12, 26], [11, 27], [12, 27], [13, 28]]) only(x, y, 'L', fur);
  }

  if (pattern === 'mask') {
    // 哈士奇：额头白色火焰纹 + 头顶深色帽子
    for (const [x, y] of [[15, 6], [16, 6], [15, 7], [16, 7], [15, 8], [16, 8], [15, 9], [16, 9], [15, 10], [16, 10]]) {
      only(x, y + bob, 'w', fur);
    }
    for (const [x, y] of [[10, 6], [11, 6], [12, 6], [19, 6], [20, 6], [21, 6], [9, 7], [22, 7], [9, 8], [22, 8]]) {
      only(x, y + bob, 'F', fur);
    }
    // 耳尖压深
    for (const [x, y] of [[7, 2], [8, 3], [7, 3], [24, 2], [23, 3], [24, 3]]) only(x, y + bob, 'F', fur);
  }

  if (pattern === 'fluff') {
    // 萨摩耶：耳缘一圈浅灰，撑出蓬松感
    for (const [x, y] of [[7, 4], [8, 5], [24, 4], [23, 5], [6, 6], [25, 6], [6, 7], [25, 7]]) {
      only(x, y + bob, 'F', fur);
    }
  }

  return rows;
}

// --------------------------------------------------------------- 五官

function drawFace(rows, breed, frame) {
  const cat = BREEDS[breed].species === 'cat';
  const bob = frame.breath ? -1 : 0;
  const noseY = 16 + bob;
  const tongue = frame.happy || frame.tongue;
  // 开心时嘴角往两边咧开一格，和待机区分开
  const smile = frame.happy;

  if (cat) {
    for (const x of [14, 15, 16, 17]) put(rows, x, noseY, 'p');
    for (const x of [15, 16]) put(rows, x, noseY + 1, 'p');
    put(rows, 14, noseY + 2, 'o');
    put(rows, 17, noseY + 2, 'o');
    if (smile) {
      put(rows, 13, noseY + 2, 'o');
      put(rows, 18, noseY + 2, 'o');
    }
    if (tongue) {
      for (const x of [15, 16]) {
        put(rows, x, noseY + 3, 'o');
        put(rows, x, noseY + 4, 't');
      }
    } else {
      put(rows, 15, noseY + 3, 'o');
      put(rows, 16, noseY + 3, 'o');
    }
  } else {
    ellipse(rows, 16, noseY + 0.6, 2.2, 1.6, 'e');
    put(rows, 15, noseY - 0.2, 's');
    put(rows, 16, noseY - 0.2, 's');
    put(rows, 14, noseY + 2, 'o');
    put(rows, 17, noseY + 2, 'o');
    if (smile) {
      put(rows, 13, noseY + 2, 'o');
      put(rows, 18, noseY + 2, 'o');
    }
    if (tongue) {
      for (const x of [15, 16]) {
        put(rows, x, noseY + 3, 'o');
        put(rows, x, noseY + 4, 't');
        put(rows, x, noseY + 5, 't');
      }
    } else {
      put(rows, 15, noseY + 3, 'o');
      put(rows, 16, noseY + 3, 'o');
    }
    for (const x of [11, 12, 19, 20]) put(rows, x, 9 + bob, 'F');
  }

  return rows;
}

/** 眼睛模板：5×5，'i' 是虹膜（颜色随品种）。 */
function eyeTemplate(kind) {
  if (kind === 'happy') {
    return [[0, 3, 'o'], [1, 2, 'o'], [2, 1, 'o'], [3, 2, 'o'], [4, 3, 'o']];
  }
  if (kind === 'closed') {
    return [[0, 3, 'o'], [1, 3, 'o'], [2, 3, 'o'], [3, 3, 'o'], [4, 3, 'o'],
            [1, 2, 'o'], [3, 2, 'o']];
  }
  if (kind === 'half') {
    return [[0, 3, 'o'], [1, 3, 'o'], [2, 3, 'o'], [3, 3, 'o'], [4, 3, 'o'],
            [0, 2, 'o'], [4, 2, 'o'], [1, 2, 'i'], [2, 2, 'i'], [3, 2, 'i']];
  }
  return [
    [1, 0, 'o'], [2, 0, 'o'], [3, 0, 'o'],
    [0, 1, 'o'], [1, 1, 's'], [2, 1, 'i'], [3, 1, 'i'], [4, 1, 'o'],
    [0, 2, 'o'], [1, 2, 'i'], [2, 2, 'i'], [3, 2, 'i'], [4, 2, 'o'],
    [0, 3, 'o'], [1, 3, 'i'], [2, 3, 'i'], [3, 3, 'i'], [4, 3, 'o'],
    [1, 4, 'o'], [2, 4, 'o'], [3, 4, 'o'],
  ];
}

function eyeAnchors(frame) {
  const bob = frame.breath ? -1 : 0;
  return [{ x: 9, y: 11 + bob }, { x: 18, y: 11 + bob }];
}

// --------------------------------------------------------------- 尾巴

function tailShape(breed, frame) {
  const art = BREEDS[breed];
  const g = blank();
  const sway = [-2.6, 0, 2.6, 0][((frame.tail % 4) + 4) % 4];
  const bezier = (p0, p1, p2, t) => [
    (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
    (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
  ];

  if (art.species === 'cat') {
    const p0 = [20.6, 29.8];
    const p1 = [28.6, 33.6];
    const p2 = [28.8, 25.8];
    const ring = art.pattern === 'tabby';
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      const [x, y] = bezier(p0, p1, p2, t);
      // 狸花尾巴一节一节
      ellipse(g, x + sway * t * 1.2, y, 1.6, 1.6, ring && i % 6 >= 3 ? 'F' : 'f');
    }
    const [tx, ty] = bezier(p0, p1, p2, 1);
    ellipse(g, tx + sway * 1.2, ty, 1.7, 1.7, ring ? 'F' : art.pattern === 'gold' ? 'g' : 'w');
  } else {
    const p0 = [20.8, 29.6];
    const p1 = [28.4, 33.2];
    const p2 = [28.2, 25.4];
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const [x, y] = bezier(p0, p1, p2, t);
      ellipse(g, x + sway * t, y, 1.9, 1.9, 'F');
    }
  }

  return outlined(g);
}

// --------------------------------------------------------------- 组装

function buildSprite(breed, frame = {}) {
  const key = BREEDS[breed] ? breed : 'tabby';
  const f = {
    breath: frame.breath ? 1 : 0,
    tail: Number.isFinite(frame.tail) ? frame.tail : 0,
    eyes: frame.eyes || 'open',
    happy: Boolean(frame.happy),
    tongue: Boolean(frame.tongue),
    ear: frame.ear ? 1 : 0,
  };

  const body = bodyShape(key, f);
  let rows = outlined(body);
  rows = rimShadow(rows);
  paintPattern(rows, key, f);

  // 头顶高光
  for (const [x, y] of [[11, 9], [12, 9], [11, 10], [12, 10], [13, 9]]) {
    if (rows[y][x] === 'f' || rows[y][x] === 'F') rows[y][x] = 'L';
  }

  drawFace(rows, key, f);

  // 狗戴项圈：金毛红、萨摩耶蓝、哈士奇红
  if (BREEDS[key].species === 'dog') {
    const y0 = 20;
    for (let x = 10; x <= 21; x += 1) {
      for (const y of [y0, y0 + 1]) {
        if (rows[y][x] !== '.' && rows[y][x] !== 'o') rows[y][x] = 'r';
      }
    }
    for (const y of [y0 + 1, y0 + 2]) {
      put(rows, 15, y, 'g');
      put(rows, 16, y, 'g');
    }
  }

  return { body: rows, tail: tailShape(key, f), eyes: f.eyes };
}

/** 同色的横向连续格子并成一条 path，整只宠物只需要几个 <path>。 */
function spritePaths(rows) {
  const byColor = new Map();
  for (const { x, y, w, ch } of spriteSpans(rows)) {
    const parts = byColor.get(ch) || [];
    parts.push(`M${x} ${y}h${w}v1h-${w}z`);
    byColor.set(ch, parts);
  }
  return [...byColor].map(([ch, parts]) => ({ ch, d: parts.join('') }));
}

function spriteSpans(rows) {
  const spans = [];
  for (let y = 0; y < H; y += 1) {
    let x = 0;
    while (x < W) {
      const ch = rows[y][x];
      if (ch === '.') {
        x += 1;
        continue;
      }
      let w = 1;
      while (x + w < W && rows[y][x + w] === ch) w += 1;
      spans.push({ x, y, w, ch });
      x += w;
    }
  }
  return spans;
}

    // #endregion sprite

    // ------------------------------------------------------------------ 性格
    // 每个品种一套节奏：呼吸、摇尾、眨眼、抖耳、张望、打盹、突然发疯。
    // 数值单位：呼吸/摇尾是"几个节拍"，其余是毫秒区间。
    const TRAITS = {
      // 狸花猫：机警、利落、野性足 —— 动作碎而快，一直在观察
      tabby: {
        breathTicks: 6,
        tailTicks: 1,
        blink: [2200, 3800],
        blinkHold: 60,
        twitch: [2400, 4200],
        glance: [2000, 3600],
        glanceHold: 900,
        hopMs: 520,
        hearts: 2,
        bounce: 1,
      },
      // 白猫：优雅、高冷、慢条斯理 —— 慢眨眼（猫的示好），动作幅度小
      white: {
        breathTicks: 10,
        tailTicks: 3,
        blink: [4200, 7200],
        blinkHold: 260,
        twitch: [7000, 12000],
        glance: [5200, 8600],
        glanceHold: 1300,
        hopMs: 620,
        hearts: 2,
        bounce: 0.75,
      },
      // 黑猫：神秘、安静、喜欢盯着你 —— 几乎不动，一次看很久
      black: {
        breathTicks: 11,
        tailTicks: 4,
        blink: [5200, 9000],
        blinkHold: 300,
        twitch: [9000, 15000],
        glance: [4200, 7000],
        glanceHold: 1800,
        hopMs: 700,
        hearts: 2,
        bounce: 0.65,
      },
      // 金渐层：懒、贪睡、黏人 —— 动不动就打盹，被摸醒会很开心
      chinchilla: {
        breathTicks: 12,
        tailTicks: 3,
        blink: [3000, 5000],
        blinkHold: 140,
        twitch: [8000, 13000],
        glance: [6000, 9000],
        glanceHold: 1100,
        doze: [9000, 15000, 3200],
        hopMs: 700,
        hearts: 4,
        bounce: 0.6,
      },
      // 金毛：热情、黏人、尾巴闲不住
      golden: {
        breathTicks: 5,
        tailTicks: 1,
        blink: [2600, 4200],
        blinkHold: 60,
        twitch: [3000, 5200],
        glance: [2600, 4200],
        glanceHold: 900,
        tongue: true,
        hopMs: 460,
        hearts: 4,
        bounce: 1.3,
      },
      // 萨摩耶：笑口常开、弹跳力惊人 —— 跳得最高，一直在笑
      samoyed: {
        breathTicks: 5,
        tailTicks: 1,
        blink: [2400, 3800],
        blinkHold: 80,
        twitch: [3400, 5600],
        glance: [2400, 4200],
        glanceHold: 850,
        tongue: true,
        hopMs: 420,
        hearts: 4,
        bounce: 1.55,
      },
      // 哈士奇：戏多、突然发疯、爱嗷呜
      husky: {
        breathTicks: 6,
        tailTicks: 1,
        blink: [2600, 4200],
        blinkHold: 80,
        twitch: [2000, 3600],
        glance: [1800, 3000],
        glanceHold: 800,
        zoomies: [7000, 12000, 1500],
        hopMs: 480,
        hearts: 3,
        bounce: 1.2,
      },
    };

    const rand = ([min, max]) => min + Math.random() * (max - min);

    /** 把眼睛模板摆到脸上，单独一层好让它跟着鼠标转。 */
    function eyeGrid(frame) {
      const g = blank();
      const template = eyeTemplate(frame.eyes);
      for (const { x, y } of eyeAnchors(frame)) {
        for (const [dx, dy, ch] of template) put(g, x + dx, y + dy, ch);
      }
      return g;
    }

    // ------------------------------------------------------------------ 文案
    const ZH = {
      aria: '电子宠物，点一下摸摸它',
      hint: '按住我拖到别处，点一下摸摸',
      picker: '换个伙伴',
      pats: '已经摸过 {n} 次',
      breed: {
        tabby: '狸花猫',
        white: '白猫',
        black: '黑猫',
        chinchilla: '金渐层',
        golden: '金毛',
        samoyed: '萨摩耶',
        husky: '哈士奇',
      },
      lines: {
        tabby: ['喵？', '有事说事', '别碰尾巴', '这地盘我的'],
        white: ['……', '嗯。', '轻一点', '知道了'],
        black: ['……', '我看见你了', '别开灯', '嗯'],
        chinchilla: ['困…', '再睡五分钟', '呼…', '摸摸～'],
        golden: ['一起玩！', '你回来啦！', '再扔一次球！', '好开心！'],
        samoyed: ['嘿嘿嘿', '开心！', '抱抱！', '今天也超棒'],
        husky: ['嗷呜——', '你听我解释', '拆家预备', '我要出去！'],
      },
    };
    const EN = {
      aria: 'Pixel pet — click to pet it',
      hint: 'Drag me anywhere, click to pet',
      picker: 'Change companion',
      pats: 'petted {n} times',
      breed: {
        tabby: 'Tabby',
        white: 'White cat',
        black: 'Black cat',
        chinchilla: 'Chinchilla',
        golden: 'Golden',
        samoyed: 'Samoyed',
        husky: 'Husky',
      },
      lines: {
        tabby: ['Mrrp?', 'What do you want', 'Not the tail', 'This is my turf'],
        white: ['…', 'Mm.', 'Gently', 'Noted.'],
        black: ['…', 'I see you', 'Leave the light off', 'Mm.'],
        chinchilla: ['Sleepy…', 'Five more minutes', 'Mrr…', 'Mm, pets'],
        golden: ['Let us play!', 'You are back!', 'Throw it again!', 'So happy!'],
        samoyed: ['Hehehe', 'Yay!', 'Hug me!', 'Best day!'],
        husky: ['Awooo—', 'Let me explain', 'Chaos incoming', 'Let me out!'],
      },
    };

    // ------------------------------------------------------------------ 存储
    function readStore() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }

    function writeStore(next) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        /* 隐私模式下存不了就算了 */
      }
    }

    function pickBreed(stored) {
      if (BREED_ORDER.indexOf(stored) >= 0) return stored;
      // 老版本只存了 cat / dog
      return stored === 'dog' ? 'golden' : 'tabby';
    }

    // ------------------------------------------------------------------ 样式
    const CSS = `
.dsp-root {
  position: fixed;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
  z-index: 40;
  cursor: grab;
}
.dsp-root.is-dragging { cursor: grabbing; }
.dsp-root:focus-visible { outline: 2px solid var(--dsh-color-accent, #247bbf); outline-offset: 6px; border-radius: 14px; }
.dsp-figure {
  position: relative;
  width: ${W * SCALE}px;
  height: ${H * SCALE}px;
  transition: transform 140ms cubic-bezier(.34, 1.56, .64, 1);
}
.dsp-root.is-happy .dsp-figure { animation: dsp-hop 620ms cubic-bezier(.34, 1.4, .64, 1); }
.dsp-root.is-zoomies .dsp-figure { animation: dsp-zoom 260ms ease-in-out infinite; }
.dsp-sprite { display: block; overflow: visible; }
.dsp-eyes { transition: transform 220ms ease-out; }
.dsp-shadow {
  position: absolute;
  left: 50%;
  bottom: -3px;
  width: ${W * SCALE * 0.56}px;
  height: 9px;
  margin-left: -${(W * SCALE * 0.56) / 2}px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--dsh-color-text, #1a1a1a) 16%, transparent);
  filter: blur(1.5px);
  transition: transform 160ms ease, opacity 160ms ease;
}
.dsp-root.is-happy .dsp-shadow, .dsp-root.is-zoomies .dsp-shadow { transform: scale(.82); opacity: .65; }
.dsp-bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 4px);
  transform: translateX(-50%) translateY(5px);
  padding: 6px 10px;
  border-radius: 12px;
  border: 2px solid #3a2a22;
  background: #fffdf7;
  color: #3a2a22;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 2px 0 #3a2a22;
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms ease, transform 150ms ease;
}
.dsp-bubble.is-on { opacity: 1; transform: translateX(-50%) translateY(0); }
.dsp-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 6px;
  height: 6px;
  margin-left: -3px;
  background: #fffdf7;
  border-right: 2px solid #3a2a22;
  border-bottom: 2px solid #3a2a22;
  transform: translateY(-4px) rotate(45deg);
}
.dsp-heart {
  position: absolute;
  left: 50%;
  bottom: 72%;
  width: 9px;
  height: 9px;
  margin-left: -4.5px;
  background: #ff6b8b;
  clip-path: polygon(50% 100%, 0 42%, 0 20%, 22% 4%, 50% 22%, 78% 4%, 100% 20%, 100% 42%);
  opacity: 0;
  animation: dsp-float 1000ms ease-out forwards;
  pointer-events: none;
}
.dsp-zzz {
  position: absolute;
  left: 62%;
  bottom: 62%;
  font-size: 11px;
  font-weight: 700;
  color: color-mix(in srgb, var(--dsh-color-text, #1a1a1a) 55%, transparent);
  animation: dsp-zzz 2.4s ease-out infinite;
  pointer-events: none;
}
.dsp-dock {
  position: absolute;
  right: -4px;
  bottom: 4px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 140ms ease, transform 140ms ease;
}
.dsp-root:hover .dsp-dock, .dsp-root:focus-within .dsp-dock, .dsp-root.is-picking .dsp-dock { opacity: 1; transform: translateY(0); }
.dsp-swap {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 7px;
  border: 2px solid #3a2a22;
  background: #fffdf7;
  color: #3a2a22;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 2px 0 #3a2a22;
}
.dsp-swap:hover { transform: translateY(-1px); }
.dsp-swap:active { transform: translateY(1px); box-shadow: none; }
.dsp-picker {
  position: absolute;
  bottom: calc(100% + 10px);
  display: grid;
  grid-template-columns: repeat(4, auto);
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  border: 2px solid #3a2a22;
  background: #fffdf7;
  box-shadow: 0 3px 0 #3a2a22;
  pointer-events: auto;
}
.dsp-picker.is-below { bottom: auto; top: calc(100% + 10px); }
.dsp-picker.is-left { left: -6px; }
.dsp-picker.is-right { right: -6px; }
.dsp-pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 46px;
  padding: 3px 0 2px;
  border-radius: 8px;
  border: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  color: #5a4a3c;
}
.dsp-pick:hover { background: #f7efe2; }
.dsp-pick.is-on { border-color: #3a2a22; background: #ffe9c9; }
.dsp-pick-name { font-size: 10px; line-height: 1.1; white-space: nowrap; }
.dsp-hint {
  position: absolute;
  left: 50%;
  top: calc(100% + 2px);
  transform: translateX(-50%);
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsh-color-text, #1a1a1a) 82%, transparent);
  color: #fff;
  font-size: 11px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 240ms ease;
  pointer-events: none;
}
.dsp-hint.is-on { opacity: .92; }
@keyframes dsp-hop {
  0% { transform: translateY(0) scale(1, 1); }
  22% { transform: translateY(0) scale(1.06, .94); }
  45% { transform: translateY(calc(-13px * var(--dsp-bounce, 1))) scale(.95, 1.06); }
  68% { transform: translateY(0) scale(1.05, .95); }
  85% { transform: translateY(calc(-3px * var(--dsp-bounce, 1))) scale(1, 1); }
  100% { transform: translateY(0) scale(1, 1); }
}
@keyframes dsp-zoom {
  0%, 100% { transform: translate(0, 0) rotate(-2deg); }
  25% { transform: translate(-5px, -4px) rotate(3deg); }
  50% { transform: translate(0, -7px) rotate(-1deg); }
  75% { transform: translate(5px, -4px) rotate(3deg); }
}
@keyframes dsp-float {
  0% { opacity: 0; transform: translate(0, 0) scale(.5); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--dsp-dx, 0), -34px) scale(1); }
}
@keyframes dsp-zzz {
  0% { opacity: 0; transform: translate(0, 0) scale(.8); }
  30% { opacity: .9; }
  100% { opacity: 0; transform: translate(9px, -18px) scale(1.1); }
}
@media (prefers-reduced-motion: reduce) {
  .dsp-figure, .dsp-heart, .dsp-zzz { animation: none !important; }
}
`;

    function PixelPet({ breed, frame, look }) {
      const palette = PALETTES[breed] || PALETTES.tabby;
      const sprite = React.useMemo(
        () => buildSprite(breed, frame),
        [breed, frame.breath, frame.tail, frame.eyes, frame.happy, frame.tongue, frame.ear],
      );
      const body = React.useMemo(() => spritePaths(sprite.body), [sprite]);
      const tail = React.useMemo(() => spritePaths(sprite.tail), [sprite]);
      const eyes = React.useMemo(() => spritePaths(eyeGrid(frame)), [frame.breath, frame.eyes]);

      const paint = (paths, keyPrefix) =>
        paths.map(({ ch, d }) => h('path', { key: keyPrefix + ch, d, fill: palette[ch] || '#000000' }));

      return h(
        'svg',
        {
          className: 'dsp-sprite',
          width: W * SCALE,
          height: H * SCALE,
          viewBox: `0 0 ${W} ${H}`,
          shapeRendering: 'crispEdges',
          'aria-hidden': true,
        },
        h('g', null, paint(tail, 'tail-')),
        h('g', null, paint(body, 'body-')),
        h(
          'g',
          { className: 'dsp-eyes', style: { transform: `translate(${look.x}px, ${look.y}px)` } },
          paint(eyes, 'eye-'),
        ),
      );
    }

    function Portrait({ breed }) {
      const palette = PALETTES[breed] || PALETTES.tabby;
      const head = React.useMemo(() => {
        const sprite = buildSprite(breed, { breath: 0, tail: 0, eyes: 'open' });
        return [...spritePaths(sprite.body), ...spritePaths(eyeGrid({ breath: 0, eyes: 'open' }))];
      }, [breed]);
      return h(
        'svg',
        { viewBox: '3 0 26 19', width: 34, height: 25, shapeRendering: 'crispEdges', 'aria-hidden': true },
        head.map(({ ch, d }) => h('path', { key: ch, d, fill: palette[ch] || '#000000' })),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locale = ctx.locale;
        const t = locale.bind(NS);

        ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'dsh-pet: dictionaries');

        function Pet() {
          const [initial] = React.useState(readStore);
          const [breed, setBreed] = React.useState(() => pickBreed(initial.breed || initial.species));
          const [pats, setPats] = React.useState(Number(initial.pats) || 0);
          const [tick, setTick] = React.useState(0);
          const [eyes, setEyes] = React.useState('open');
          const [twitch, setTwitch] = React.useState(false);
          const [dozing, setDozing] = React.useState(false);
          const [zooming, setZooming] = React.useState(false);
          const [happy, setHappy] = React.useState(false);
          const [bubble, setBubble] = React.useState(null);
          const [hearts, setHearts] = React.useState([]);
          const [hint, setHint] = React.useState(false);
          const [picking, setPicking] = React.useState(false);
          const [dragging, setDragging] = React.useState(false);
          const [pointerLook, setPointerLook] = React.useState({ x: 0, y: 0 });
          const [glance, setGlance] = React.useState(null);
          const [pos, setPos] = React.useState(() => {
            const saved = initial.pos;
            if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
              return { left: saved.left, top: saved.top };
            }
            return null;
          });

          const traits = TRAITS[breed] || TRAITS.tabby;
          const rootRef = React.useRef(null);
          const dragRef = React.useRef(null);
          const posRef = React.useRef(null);
          const patsRef = React.useRef(Number(initial.pats) || 0);
          const draggingRef = React.useRef(false);
          const happyTimer = React.useRef(null);
          const bubbleTimer = React.useRef(null);
          const hintTimer = React.useRef(null);

          const size = { w: W * SCALE, h: H * SCALE };

          const clamp = React.useCallback((left, top) => {
            const maxLeft = Math.max(6, window.innerWidth - size.w - 6);
            const maxTop = Math.max(6, window.innerHeight - size.h - 6);
            return {
              left: Math.min(Math.max(6, left), maxLeft),
              top: Math.min(Math.max(6, top), maxTop),
            };
          }, [size.w, size.h]);

          const initialPos = React.useMemo(() => {
            if (pos) return clamp(pos.left, pos.top);
            return clamp(window.innerWidth - size.w - 32, window.innerHeight - size.h - 96);
          }, []); // eslint-disable-line react-hooks/exhaustive-deps

          // 用一个固定节拍推进帧号；性格参数决定怎么读这个节拍
          React.useEffect(() => {
            const reduce = window.matchMedia
              ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
              : false;
            if (reduce) return undefined;
            const id = window.setInterval(() => {
              if (!draggingRef.current) setTick((prev) => (prev + 1) % 100000);
            }, TICK_MS);
            return () => window.clearInterval(id);
          }, []);

          // 眨眼：每个品种的频率和闭眼时长都不一样
          React.useEffect(() => {
            let alive = true;
            const timers = [];
            const at = (fn, ms) => {
              const id = window.setTimeout(() => {
                if (alive) fn();
              }, ms);
              timers.push(id);
            };
            const loop = () => {
              at(() => {
                setEyes('half');
                at(() => {
                  setEyes('closed');
                  at(() => {
                    setEyes('half');
                    at(() => {
                      setEyes('open');
                      loop();
                    }, 70);
                  }, traits.blinkHold);
                }, 70);
              }, rand(traits.blink));
            };
            loop();
            return () => {
              alive = false;
              timers.forEach((id) => window.clearTimeout(id));
            };
          }, [breed]);

          // 抖耳朵
          React.useEffect(() => {
            if (!traits.twitch) return undefined;
            let alive = true;
            const timers = [];
            const at = (fn, ms) => {
              const id = window.setTimeout(() => {
                if (alive) fn();
              }, ms);
              timers.push(id);
            };
            const loop = () => {
              at(() => {
                setTwitch(true);
                at(() => {
                  setTwitch(false);
                  loop();
                }, 190);
              }, rand(traits.twitch));
            };
            loop();
            return () => {
              alive = false;
              timers.forEach((id) => window.clearTimeout(id));
            };
          }, [breed]);

          // 东张西望
          React.useEffect(() => {
            let alive = true;
            const timers = [];
            const at = (fn, ms) => {
              const id = window.setTimeout(() => {
                if (alive) fn();
              }, ms);
              timers.push(id);
            };
            const dirs = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: 0, y: 0 }];
            const loop = () => {
              at(() => {
                setGlance(dirs[Math.floor(Math.random() * dirs.length)]);
                at(() => {
                  setGlance(null);
                  loop();
                }, traits.glanceHold || 1000);
              }, rand(traits.glance));
            };
            loop();
            return () => {
              alive = false;
              timers.forEach((id) => window.clearTimeout(id));
            };
          }, [breed]);

          // 打盹（金渐层）
          React.useEffect(() => {
            if (!traits.doze) return undefined;
            const [min, max, length] = traits.doze;
            let alive = true;
            const timers = [];
            const at = (fn, ms) => {
              const id = window.setTimeout(() => {
                if (alive) fn();
              }, ms);
              timers.push(id);
            };
            const loop = () => {
              at(() => {
                setDozing(true);
                at(() => {
                  setDozing(false);
                  loop();
                }, length);
              }, rand([min, max]));
            };
            loop();
            return () => {
              alive = false;
              timers.forEach((id) => window.clearTimeout(id));
              setDozing(false);
            };
          }, [breed]);

          // 突然发疯（哈士奇）
          React.useEffect(() => {
            if (!traits.zoomies) return undefined;
            const [min, max, length] = traits.zoomies;
            let alive = true;
            const timers = [];
            const at = (fn, ms) => {
              const id = window.setTimeout(() => {
                if (alive) fn();
              }, ms);
              timers.push(id);
            };
            const loop = () => {
              at(() => {
                const lines = t('lines.' + breed);
                const pool = Array.isArray(lines) && lines.length ? lines : [''];
                setZooming(true);
                setBubble(pool[Math.floor(Math.random() * pool.length)]);
                at(() => {
                  setZooming(false);
                  setBubble(null);
                  loop();
                }, length);
              }, rand([min, max]));
            };
            loop();
            return () => {
              alive = false;
              timers.forEach((id) => window.clearTimeout(id));
              setZooming(false);
            };
          }, [breed]);

          // 眼睛跟着鼠标转（附近才生效，免得整页乱瞟）
          React.useEffect(() => {
            const onMove = (event) => {
              const node = rootRef.current;
              if (!node || draggingRef.current) return;
              const rect = node.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              const limit = Math.max(rect.width, rect.height) * 1.8;
              const dx = event.clientX - cx;
              const dy = event.clientY - cy;
              if (Math.abs(dx) > limit || Math.abs(dy) > limit) return;
              const next = {
                x: Math.max(-1, Math.min(1, Math.round(dx / 42))),
                y: Math.max(-1, Math.min(1, Math.round(dy / 42))),
              };
              setPointerLook((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
            };
            window.addEventListener('pointermove', onMove, { passive: true });
            return () => window.removeEventListener('pointermove', onMove);
          }, []);

          React.useEffect(() => {
            const onResize = () => setPos((prev) => (prev ? clamp(prev.left, prev.top) : prev));
            window.addEventListener('resize', onResize);
            return () => window.removeEventListener('resize', onResize);
          }, [clamp]);

          React.useEffect(() => {
            if (!picking) return undefined;
            const close = () => setPicking(false);
            window.addEventListener('pointerdown', close);
            return () => window.removeEventListener('pointerdown', close);
          }, [picking]);

          React.useEffect(() => () => {
            window.clearTimeout(happyTimer.current);
            window.clearTimeout(bubbleTimer.current);
            window.clearTimeout(hintTimer.current);
          }, []);

          React.useEffect(() => {
            if (initial.seenHint) return undefined;
            setHint(true);
            hintTimer.current = window.setTimeout(() => setHint(false), 3800);
            writeStore({ ...initial, seenHint: true, breed, pats });
            return undefined;
          }, []); // eslint-disable-line react-hooks/exhaustive-deps

          const persist = (patch) => {
            writeStore({ ...readStore(), breed, pats, ...patch });
          };

          const cheer = () => {
            const lines = t('lines.' + breed);
            const pool = Array.isArray(lines) && lines.length ? lines : [''];
            patsRef.current += 1;
            setPats(patsRef.current);
            persist({ pats: patsRef.current });
            setHappy(true);
            setDozing(false);
            setEyes('happy');
            setBubble(pool[Math.floor(Math.random() * pool.length)]);
            const count = Math.min(5, Math.max(1, traits.hearts || 2));
            setHearts((prev) => [
              ...prev.slice(-4),
              ...Array.from({ length: count }, () => ({
                id: Date.now() + Math.random(),
                dx: Math.round((Math.random() - 0.5) * 34),
              })),
            ]);
            window.clearTimeout(happyTimer.current);
            window.clearTimeout(bubbleTimer.current);
            happyTimer.current = window.setTimeout(() => {
              setHappy(false);
              setEyes('open');
            }, HAPPY_MS);
            bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_MS);
            window.setTimeout(() => {
              setHearts((prev) => prev.slice(-5));
            }, 1100);
          };

          const onPointerDown = (event) => {
            if (event.button !== undefined && event.button !== 0) return;
            const rect = rootRef.current ? rootRef.current.getBoundingClientRect() : null;
            if (!rect) return;
            dragRef.current = {
              pointerId: event.pointerId,
              offsetX: event.clientX - rect.left,
              offsetY: event.clientY - rect.top,
              moved: false,
              startX: event.clientX,
              startY: event.clientY,
            };
            if (rootRef.current && rootRef.current.setPointerCapture) {
              rootRef.current.setPointerCapture(event.pointerId);
            }
          };

          const onPointerMove = (event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (!drag.moved) {
              const dx = event.clientX - drag.startX;
              const dy = event.clientY - drag.startY;
              if (dx * dx + dy * dy < 25) return;
              drag.moved = true;
              draggingRef.current = true;
              setDragging(true);
              setPicking(false);
            }
            event.preventDefault();
            const next = clamp(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
            posRef.current = next;
            setPos(next);
          };

          const endDrag = (event) => {
            const drag = dragRef.current;
            if (!drag || (event && drag.pointerId !== event.pointerId)) return;
            dragRef.current = null;
            draggingRef.current = false;
            setDragging(false);
            if (rootRef.current && rootRef.current.releasePointerCapture && event) {
              try {
                rootRef.current.releasePointerCapture(event.pointerId);
              } catch {
                /* 已经释放过就算了 */
              }
            }
            if (!drag.moved) {
              cheer();
            } else if (posRef.current) {
              persist({ pos: posRef.current });
            }
          };

          const choose = (next) => {
            setBreed(next);
            setPicking(false);
            setBubble(null);
            setHearts([]);
            setEyes('open');
            setDozing(false);
            writeStore({ ...readStore(), breed: next, pats });
          };

          const onKeyDown = (event) => {
            const step = 12;
            const map = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
              Enter: null,
              ' ': null,
            };
            if (!(event.key in map)) return;
            event.preventDefault();
            const delta = map[event.key];
            if (!delta) {
              cheer();
              return;
            }
            const base = pos || initialPos;
            const next = clamp(base.left + delta[0], base.top + delta[1]);
            posRef.current = next;
            setPos(next);
            persist({ pos: next });
          };

          const frame = {
            breath: Math.floor(tick / Math.max(2, traits.breathTicks)) % 2,
            tail: happy || zooming ? tick % 4 : Math.floor(tick / Math.max(1, traits.tailTicks)) % 4,
            eyes: happy ? 'happy' : dozing ? 'closed' : eyes,
            happy: happy || zooming,
            tongue: Boolean(traits.tongue) && !dozing,
            ear: twitch && !dragging,
          };
          const look = dozing ? { x: 0, y: 0 } : glance || pointerLook;
          const place = pos || initialPos;
          const below = place.top < 240;
          const toRight = place.left + size.w / 2 > (window.innerWidth || 1024) / 2;

          return h(
            React.Fragment,
            null,
            h('style', { key: 'css' }, CSS),
            h(
              'div',
              {
                key: 'root',
                ref: rootRef,
                className:
                  'dsp-root' +
                  (dragging ? ' is-dragging' : '') +
                  (happy ? ' is-happy' : '') +
                  (zooming ? ' is-zoomies' : '') +
                  (picking ? ' is-picking' : ''),
                style: {
                  left: place.left + 'px',
                  top: place.top + 'px',
                  '--dsp-bounce': String(traits.bounce || 1),
                },
                role: 'button',
                tabIndex: 0,
                'aria-label': t('aria'),
                title: t('pats', { n: pats }),
                onPointerDown,
                onPointerMove,
                onPointerUp: endDrag,
                onPointerCancel: endDrag,
                onKeyDown,
              },
              h(
                'div',
                { className: 'dsp-figure' },
                h('div', { className: 'dsp-shadow' }),
                h(PixelPet, { breed, frame, look }),
                dozing ? h('span', { className: 'dsp-zzz' }, 'z Z') : null,
                hearts.map((heart) =>
                  h('span', {
                    key: heart.id,
                    className: 'dsp-heart',
                    style: { '--dsp-dx': heart.dx + 'px' },
                  }),
                ),
                bubble
                  ? h('div', { className: 'dsp-bubble is-on' }, bubble)
                  : h('div', { className: 'dsp-bubble' }, ''),
                h('div', { className: 'dsp-hint' + (hint ? ' is-on' : '') }, t('hint')),
              ),
              h(
                'div',
                { className: 'dsp-dock' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsp-swap',
                    'aria-label': t('picker'),
                    'aria-expanded': picking ? 'true' : 'false',
                    title: t('picker'),
                    onPointerDown: (event) => event.stopPropagation(),
                    onClick: (event) => {
                      event.stopPropagation();
                      setPicking((prev) => !prev);
                    },
                  },
                  '\u{1F43E}',
                ),
              ),
              picking
                ? h(
                    'div',
                    {
                      className:
                        'dsp-picker' +
                        (below ? ' is-below' : '') +
                        (toRight ? ' is-right' : ' is-left'),
                      onPointerDown: (event) => event.stopPropagation(),
                    },
                    BREED_ORDER.map((id) =>
                      h(
                        'button',
                        {
                          key: id,
                          type: 'button',
                          className: 'dsp-pick' + (id === breed ? ' is-on' : ''),
                          title: t('breed.' + id),
                          onClick: (event) => {
                            event.stopPropagation();
                            choose(id);
                          },
                        },
                        h(Portrait, { breed: id }),
                        h('span', { className: 'dsp-pick-name' }, t('breed.' + id)),
                      ),
                    ),
                  )
                : null,
            ),
          );
        }

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'dsh-pet', order: 140 }, Pet),
        );
      },
    };
  },
});
