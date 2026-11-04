window.__ModuleLoader__.load({
  id: 'dsh-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-pet';
    const STORE_KEY = 'dsh.pet.v1';
    const SCALE = 2; // 48×54 的像素格 → 96×108
    const TICK_MS = 110;
    const HAPPY_MS = 950;
    const BUBBLE_MS = 1700;
    const BREED_ORDER = [
      'tabby', 'white', 'black', 'chinchilla', 'tiger', 'lion',
      'golden', 'samoyed', 'husky', 'parrot', 'sheep', 'goat',
    ];

    // ------------------------------------------------------------ 精灵开始
    // #region sprite

// 像素宠物精灵：48×54 网格。几何铺色 + 自动描边 + 体积明暗 + 品种花纹 + 转向。
// 纯函数、不依赖 React。
//
// frame = { breath, tail, eyes, happy, tongue, ear, turn, dir }
//   turn: 0 = 正面，0.5 = 侧转一半，1 = 侧面
//   dir : 1 = 朝右，-1 = 朝左（整体水平翻转）

const W = 48;
const H = 54;
const MAX_TURN = 1;

const BREEDS = {
  tabby: { species: 'cat', ear: 'pointy', pattern: 'tabby' },
  white: { species: 'cat', ear: 'pointy', pattern: 'none' },
  black: { species: 'cat', ear: 'pointy', pattern: 'sheen' },
  chinchilla: { species: 'cat', ear: 'pointy', pattern: 'gold' },
  tiger: { species: 'cat', ear: 'round', pattern: 'tiger' },
  lion: { species: 'cat', ear: 'round', pattern: 'none', mane: true },
  golden: { species: 'dog', ear: 'floppy', pattern: 'none' },
  samoyed: { species: 'dog', ear: 'prick', pattern: 'fluff' },
  husky: { species: 'dog', ear: 'prick', pattern: 'mask' },
  parrot: { species: 'bird', ear: 'none', pattern: 'none', asymmetric: true },
  sheep: { species: 'sheep', ear: 'droop', pattern: 'none' },
  goat: { species: 'goat', ear: 'pointy', pattern: 'none', beard: true },
};

const PALETTES = {
  tabby: {
    o: '#3a2c22', f: '#b09a7c', F: '#6f5c47', L: '#d3c2a6', w: '#f4ead6',
    p: '#f0a0b4', i: '#8fbf5e', s: '#ffffff', e: '#2a1d17', t: '#ff8fa8', r: '#e0563f', g: '#e8c05a', n: '#8a7358',
  },
  white: {
    o: '#8c7f74', f: '#fdfaf4', F: '#e6dcd0', L: '#ffffff', w: '#ffffff',
    p: '#ffb3c6', i: '#79b9e6', s: '#ffffff', e: '#3a3230', t: '#ff8fa8', r: '#e0563f', g: '#e8c05a', n: '#e8ded2',
  },
  black: {
    o: '#141115', f: '#443b49', F: '#302a35', L: '#6f6679', w: '#574f5e',
    p: '#c98a9c', i: '#f2c14e', s: '#fff6c9', e: '#0f0d0c', t: '#e08aa0', r: '#e0563f', g: '#e8c05a', n: '#3b333f',
  },
  chinchilla: {
    o: '#584636', f: '#f0e0c0', F: '#d8c49c', L: '#fff8e6', w: '#fffaf0',
    p: '#ffb3c6', i: '#86b96b', s: '#ffffff', e: '#3a2f26', t: '#ff8fa8', r: '#e0563f', g: '#d9a94e', n: '#d9c8a6',
  },
  tiger: {
    o: '#3a2415', f: '#e8a13c', F: '#c47c22', L: '#f7cf86', w: '#fff6e6',
    p: '#e08a9a', i: '#f2d24e', s: '#ffffff', e: '#241610', t: '#ff8fa8', r: '#d94f3d', g: '#e8c05a', n: '#a8672a',
  },
  lion: {
    o: '#5a3618', f: '#dda85c', F: '#b8813a', L: '#f2cd90', w: '#f6e3c4',
    p: '#e0a0a8', i: '#e8c24a', s: '#ffffff', e: '#2b1d14', t: '#ff9db0', r: '#d94f3d', g: '#e8c05a', n: '#a9762f',
  },
  golden: {
    o: '#4a2f18', f: '#e6a955', F: '#c1843a', L: '#f8d191', w: '#fff1d9',
    p: '#f0a0b4', i: '#5a3a1e', s: '#ffffff', e: '#2b1d14', t: '#ff7f9c', r: '#d94f3d', g: '#e8c05a', n: '#c1843a',
  },
  samoyed: {
    o: '#6f6862', f: '#fdfbf6', F: '#e4ded4', L: '#ffffff', w: '#ffffff',
    p: '#ffb3c6', i: '#3c3029', s: '#ffffff', e: '#2b211d', t: '#ff8fa8', r: '#5aa0e0', g: '#e8c05a', n: '#e4ded4',
  },
  husky: {
    o: '#33383d', f: '#98a0a7', F: '#4c5259', L: '#cdd4da', w: '#fdfbf7',
    p: '#ffb3c6', i: '#7ec8e3', s: '#ffffff', e: '#201c1a', t: '#ff8fa8', r: '#d94f3d', g: '#e8c05a', n: '#6f767c',
  },
  parrot: {
    o: '#1b3a2a', f: '#4fa84a', F: '#2f7a33', L: '#8ed47f', w: '#f2e7c9',
    p: '#ff9dbb', i: '#f2c14e', s: '#ffffff', e: '#16240f', t: '#ff8fa8', r: '#e0563f', g: '#f0b429', n: '#c8d8b0',
  },
  sheep: {
    o: '#6b6259', f: '#f6f0e4', F: '#ded4c2', L: '#ffffff', w: '#ffffff',
    p: '#f0b0bc', i: '#3a3029', s: '#ffffff', e: '#2b211d', t: '#ff9db0', r: '#e0563f', g: '#e8c05a', n: '#59524a',
  },
  goat: {
    o: '#5f5648', f: '#f2ece0', F: '#dcd3c2', L: '#ffffff', w: '#fffdf7',
    p: '#e8b0b8', i: '#4a3f2e', s: '#ffffff', e: '#2b211d', t: '#ff9db0', r: '#e0563f', g: '#e8c05a', n: '#b8ae9c',
  },
};

function blank() {
  return Array.from({ length: H }, () => new Array(W).fill('.'));
}

function put(g, x, y, ch) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
  g[iy][ix] = ch;
}

function rect(g, x, y, w, h, ch) {
  for (let iy = Math.round(y); iy < Math.round(y + h); iy += 1) {
    for (let ix = Math.round(x); ix < Math.round(x + w); ix += 1) {
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      g[iy][ix] = ch;
    }
  }
}

function ellipse(g, cx, cy, rx, ry, ch) {
  for (let iy = 0; iy < H; iy += 1) {
    for (let ix = 0; ix < W; ix += 1) {
      const dx = (ix + 0.5 - cx) / Math.max(0.1, rx);
      const dy = (iy + 0.5 - cy) / Math.max(0.1, ry);
      if (dx * dx + dy * dy <= 1) g[iy][ix] = ch;
    }
  }
}

function triangle(g, a, b, c, ch) {
  const cross = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  for (let iy = 0; iy < H; iy += 1) {
    for (let ix = 0; ix < W; ix += 1) {
      const p = [ix + 0.5, iy + 0.5];
      const d1 = cross(p, a, b);
      const d2 = cross(p, b, c);
      const d3 = cross(p, c, a);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) g[iy][ix] = ch;
    }
  }
}

function round(g, x, y, w, h, r, ch) {
  for (let iy = 0; iy < H; iy += 1) {
    for (let ix = 0; ix < W; ix += 1) {
      const px = ix + 0.5;
      const py = iy + 0.5;
      if (px < x || px > x + w || py < y || py > y + h) continue;
      const cx = Math.min(Math.max(px, x + r), x + w - r);
      const cy = Math.min(Math.max(py, y + r), y + h - r);
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > r * r) continue;
      g[iy][ix] = ch;
    }
  }
}

function line(g, x0, y0, x1, y1, ch) {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 400; guard += 1) {
    if (ax >= 0 && ay >= 0 && ax < W && ay < H) g[ay][ax] = ch;
    if (ax === bx && ay === by) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      ax += sx;
    }
    if (e2 < dx) {
      err += dx;
      ay += sy;
    }
  }
}

function closeGaps(g) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < H - 1; y += 1) {
      for (let x = 1; x < W - 1; x += 1) {
        if (g[y][x] !== '.') continue;
        const n = (g[y][x - 1] !== '.' ? 1 : 0) + (g[y][x + 1] !== '.' ? 1 : 0) +
          (g[y - 1][x] !== '.' ? 1 : 0) + (g[y + 1][x] !== '.' ? 1 : 0);
        if (n >= 3) {
          g[y][x] = 'f';
          changed = true;
        }
      }
    }
  }
  return g;
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

function flip(rows) {
  return rows.map((row) => row.slice().reverse());
}

/** 转向的几何偏移：所有五官、耳朵、爪子按这个量往朝向一侧挪。 */
// 脑袋小的物种（鸟、羊、山羊）转身幅度要收着，不然五官会滑出脸
const TURN_FACTOR = { cat: 1, dog: 1, bird: 0.9, sheep: 0.9, goat: 0.9 };

function turnShift(turn, factor = 1) {
  const t = Math.max(0, Math.min(1, turn)) * factor;
  return {
    t,
    face: t * 4.2, // 口鼻中心
    eyeFar: t * 6.2, // 远侧那只眼睛往中间挪
    eyeNear: t * 2.0, // 近侧那只眼睛往边上挪
    farScale: 1 - 0.5 * t, // 远眼缩小
    nearEar: -t * 5.0,
    farEar: t * 6.0,
    body: t * 1.2,
  };
}

// ---------------------------------------------------------------- 版式
// 每个物种五官的位置；转向时按 turnShift 往朝向一侧挪。
const LAYOUT = {
  cat: { eyeY: 23, near: 30.5, far: 17.5, scale: 1 },
  dog: { eyeY: 23, near: 30.5, far: 17.5, scale: 1 },
  bird: { eyeY: 17.2, near: 26.4, far: 21.6, scale: 0.88 },
  // 羊和山羊脑袋窄，眼睛得铺开一点、转身时少挪一点，才不会挤成斗鸡眼
  sheep: { eyeY: 21.0, near: 28.0, far: 20.0, scale: 0.76, eyeNear: 1.4 },
  goat: { eyeY: 20.0, near: 28.2, far: 19.8, scale: 0.78, eyeNear: 1.4 },
};

const layoutOf = (breed) => LAYOUT[BREEDS[breed].species] || LAYOUT.cat;

// ---------------------------------------------------------------- 耳朵

/** 一只耳朵：cx/cy 是耳根，dir=-1 时往另一侧翻。 */
function ear(g, style, cx, cyIn, dir, scale, t) {
  const s = scale;
  const cy = cyIn - (t ? 1.1 : 0);
  const px = (x) => cx + dir * x * s;
  const py = (y) => cy + y * s;

  if (style === 'pointy') {
    ellipse(g, cx, py(0.4), 4.8 * s, 4.6 * s, 'f');
    triangle(g, [px(-2.8), py(-12.6)], [px(-6.3), py(1.4)], [px(8.2), py(-4.1)], 'f');
    triangle(g, [px(-2.2 + t * 0.6), py(-7.4)], [px(-4.2), py(-1.2)], [px(3.6), py(-3.6)], 'p');
    return;
  }
  if (style === 'prick') {
    ellipse(g, cx, py(0.6), 4.2 * s, 4.0 * s, 'f');
    triangle(g, [px(-1.0), py(-12.4)], [px(-4.6), py(1.2)], [px(6.8), py(-3.6)], 'f');
    triangle(g, [px(-0.6), py(-7.2)], [px(-3.0), py(-1.0)], [px(3.0), py(-3.2)], 'p');
    return;
  }
  if (style === 'round') {
    // 老虎 / 狮子：圆耳，压在头顶两侧
    ellipse(g, cx, py(-3.2), 4.4 * s, 4.2 * s, 'f');
    ellipse(g, cx, py(-3.0), 2.6 * s, 2.4 * s, 'p');
    return;
  }
  if (style === 'droop') {
    // 绵羊：软趴趴的小耳朵
    ellipse(g, cx + dir * 0.6, py(1.4), 2.4 * s, 3.8 * s, 'n');
    return;
  }
  if (style === 'floppy') {
    ellipse(g, cx, py(6.0), 3.2 * s, 7.0 * s, 'F');
    ellipse(g, cx - dir * 0.6, py(12.2), 2.9 * s, 2.8 * s, 'F');
  }
}

function drawEars(g, breed, frame) {
  const art = BREEDS[breed];
  if (art.ear === 'none') return;
  const raw = Math.max(0, Math.min(1, frame.turn || 0));
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const small = art.species === 'sheep' || art.species === 'goat';
  const cy = small ? 17.4 : 14.6;
  const base = small ? 32.6 : 35.2;
  const nearCx = base + T.nearEar;
  const farCx = 48 - base + T.farEar;
  const flick = frame.ear ? 1 : 0;
  if (raw < 0.95) ear(g, art.ear, farCx, cy, -1, T.farScale, flick);
  ear(g, art.ear, nearCx, cy, 1, 1, flick);
}

// ---------------------------------------------------------------- 身体

function drawTorso(g, breed, frame) {
  const art = BREEDS[breed];
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const cx = 24 + T.body;
  const slim = T.t * 1.4;
  const bob = frame.breath ? -1 : 0;

  if (art.species === 'bird') {
    // 鹦鹉：蛋形身体 + 浅色肚子 + 两只脚
    ellipse(g, cx - 1, 36, 10.5, 12.5, 'f');
    ellipse(g, cx - 3, 39, 6.5, 8.5, 'w');
    // 翅膀
    ellipse(g, cx + 6.5, 36, 4.6, 8.6, 'F');
    ellipse(g, cx + 5.6, 35, 2.6, 6.6, 'f');
    // 脚
    for (const dx of [-4.5, 3.5]) {
      rect(g, cx + dx - 1.4, 48.5, 2.8, 2.2, 'g');
      rect(g, cx + dx - 2.2, 50.4, 4.4, 1.6, 'g');
    }
    return;
  }

  if (art.species === 'sheep') {
    // 绵羊：一大团羊毛，四条短腿
    for (const [dx, dy, r] of [[-8, -3, 6], [8, -3, 6], [-9, 4, 5.5], [9, 4, 5.5], [0, -9, 6],
      [0, 6, 5.5], [-6, 9, 4.5], [6, 9, 4.5], [0, 0, 8]]) {
      ellipse(g, cx + dx * (1 - slim * 0.05), 37 + dy, r, r, 'f');
    }
    const legW = 4;
    const legX = Math.round(24 - 7.3 - legW / 2);
    rect(g, legX, 45, legW, 6.4, 'n');
    rect(g, 48 - legX - legW, 45, legW, 6.4, 'n');
    return;
  }

  if (art.species === 'goat') {
    // 山羊：瘦长身体 + 四条细腿 + 深色蹄子
    round(g, cx - 7, 33, 14 - slim, 15.5, 5.5, 'f');
    ellipse(g, cx, 38.5, 7.4 - slim * 0.5, 7.6, 'f');
    ellipse(g, cx - 1, 40, 4.4, 5.4, 'w');
    const legW = 3;
    const legX = Math.round(24 - 6.5 - legW / 2);
    rect(g, legX, 45.5, legW, 5.4, 'f');
    rect(g, 48 - legX - legW, 45.5, legW, 5.4, 'f');
    rect(g, legX - 1, 50.2, legW + 2, 2.0, 'n');
    rect(g, 48 - legX - legW - 1, 50.2, legW + 2, 2.0, 'n');
    return;
  }

  round(g, cx - 7.5 + slim * 0.5, 33, 15 - slim, 18.5, 6, 'f');
  ellipse(g, cx, 40, 8 - slim * 0.5, 7.2, 'f');
}

function drawHead(g, breed, frame) {
  const art = BREEDS[breed];
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const bob = frame.breath ? -1 : 0;
  const cx = 24 + T.t * 1.2;

  if (art.species === 'bird') {
    ellipse(g, cx + T.t * 1.2, 19 + bob, 9.2, 8.6, 'f');
    return;
  }
  if (art.species === 'sheep') {
    ellipse(g, cx, 21.0 + bob, 9.0, 6.9, 'n');
    // 头顶一撮羊毛
    for (const [dx, dy, r] of [[-3, -4, 3.2], [3, -4, 3.2], [0, -6, 3.4]]) {
      ellipse(g, cx + dx, 21.0 + dy + bob, r, r, 'f');
    }
    return;
  }
  if (art.species === 'goat') {
    ellipse(g, cx, 20.0 + bob, 8.8, 7.4, 'f');
    return;
  }
  ellipse(g, cx, 22 + bob, 13.5 - T.t * 2.6, 12.4, 'f');
}

/** 口鼻、胸腹、爪子这些浅色块。 */
function drawMuzzle(g, breed, frame) {
  const art = BREEDS[breed];
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const bob = frame.breath ? -1 : 0;
  const cx = 24 + T.face;

  if (art.species === 'bird') {
    // 钩状喙：上喙大、下喙小，往右伸出脑袋
    const bx = 32.6 + T.t * 2 + T.face * 0.4;
    // 上喙：从额头下方斜伸出去，末端带钩
    triangle(g, [bx - 3.0, 15.4 + bob], [bx - 2.0, 21.0 + bob], [bx + 7.4, 19.2 + bob], 'g');
    ellipse(g, bx + 6.6, 19.6 + bob, 1.9, 1.7, 'g');
    // 下喙
    triangle(g, [bx - 2.4, 20.2 + bob], [bx - 1.2, 23.2 + bob], [bx + 4.2, 21.2 + bob], 'n');
    // 腮红
    ellipse(g, bx - 6.4, 21.6 + bob, 2.6, 1.8, 'p');
    return;
  }

  if (art.species === 'sheep') {
    ellipse(g, cx, 25.2 + bob, 4.2, 3.2, 'w');
    ellipse(g, 24 + T.body, 38, 5.0, 6.0, 'w');
    return;
  }

  if (art.species === 'goat') {
    ellipse(g, cx, 23.6 + bob, 4.6, 3.4, 'w');
    ellipse(g, 24 + T.body, 38, 4.0, 4.6, 'w');
    // 山羊胡：用一串椭圆，左右严格对称
    for (const [dy, rx, ry] of [[0, 2.0, 1.1], [1.4, 1.7, 1.1], [2.6, 1.3, 1.1], [3.6, 0.9, 1.0]]) {
      ellipse(g, cx, 27.0 + dy + bob, rx, ry, 'n');
    }
    return;
  }

  if (art.species === 'cat') ellipse(g, cx, 30.4 + bob, 6.8, 4.2, 'w');
  else ellipse(g, cx, 30.2 + bob, 6.6, 4.6, 'w');

  if (T.t >= 0.4) {
    ellipse(g, cx + 5.4, 29.8 + bob, 4.2 * Math.min(1, T.t), 3.2 * Math.min(1, T.t) + 0.6, 'w');
  }

  ellipse(g, 24 + T.body, 43.6, 4.8, 5.0, 'w');
  const nearPaw = 28.0 + T.t * 0.6;
  const farPaw = 20.0 + T.t * 2.6;
  ellipse(g, farPaw, 51.0, 3.0 - T.t * 0.6, 2.0, 'w');
  ellipse(g, nearPaw, 51.0, 3.0, 2.0, 'w');
}

// ---------------------------------------------------------------- 鬃毛 / 角

function drawMane(g, breed, frame) {
  if (!BREEDS[breed].mane) return;
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const cx = 24 + T.t * 1.2;
  const bob = frame.breath ? -1 : 0;
  for (let a = 0; a < 20; a += 1) {
    const ang = (a / 20) * Math.PI * 2;
    // 顶部留空，耳朵和头顶才露得出来
    if (Math.sin(ang) < -0.62) continue;
    const r = 13.4;
    ellipse(g, cx + Math.cos(ang) * r * 0.96, 22 + bob + Math.sin(ang) * r * 1.02, 4.4, 4.4, 'F');
  }
}

function drawHorns(g, breed, frame) {
  if (BREEDS[breed].species !== 'goat') return;
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const cx = 24 + T.t * 1.2;
  const bob = frame.breath ? -1 : 0;
  // 两只向后上方弯的角
  for (const dir of [-1, 1]) {
    for (let i = 0; i <= 8; i += 1) {
      const k = i / 8;
      const x = cx + dir * (5.2 + k * 2.2);
      const y = 14.4 + bob - k * 8.2 + k * k * 2.4;
      ellipse(g, x, y, 1.9 - k * 1.0, 1.9 - k * 1.0, 'n');
    }
  }
}

// ---------------------------------------------------------------- 五官

function drawEyeShape(g, cx, cy, kind, s) {
  const k = (v) => v * s;
  if (kind === 'happy') {
    line(g, cx - k(3.2), cy + k(1.2), cx - k(1.4), cy - k(1.8), 'o');
    line(g, cx - k(1.4), cy - k(1.8), cx + k(1.4), cy + k(1.2), 'o');
    line(g, cx + k(1.4), cy + k(1.2), cx + k(3.2), cy - k(1.2), 'o');
    return;
  }
  if (kind === 'closed') {
    line(g, cx - k(3.2), cy + k(0.4), cx - k(1.4), cy + k(1.8), 'o');
    line(g, cx - k(1.4), cy + k(1.8), cx + k(1.4), cy + k(1.8), 'o');
    line(g, cx + k(1.4), cy + k(1.8), cx + k(3.2), cy + k(0.4), 'o');
    return;
  }
  if (kind === 'half') {
    ellipse(g, cx, cy + k(1), k(3.0), k(1.5), 'e');
    ellipse(g, cx, cy + k(1.2), k(3.0), k(0.9), 'i');
    for (const x of [-3.2, 3.2]) ellipse(g, cx + k(x), cy + k(0.4), k(0.9), k(1.1), 'o');
    return;
  }
  ellipse(g, cx, cy, k(4.0), k(4.7), 'o');
  ellipse(g, cx, cy + k(0.3), k(3.2), k(3.9), 'i');
  ellipse(g, cx, cy + k(0.5), k(1.3), k(2.6), 'e');
  rect(g, cx - k(2.6), cy - k(2.9), k(2.0), k(1.8), 's');
  rect(g, cx + k(1.2), cy + k(2.2), k(1.2), k(1.2), 's');
}

function eyeGrid(breed, frame) {
  const g = blank();
  const raw = Math.max(0, Math.min(1, frame.turn || 0));
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const L = layoutOf(breed);
  const bob = frame.breath ? -1 : 0;
  const kind = frame.eyes || 'open';
  const y = L.eyeY + bob;
  // 转过身后脑袋收窄，近侧眼睛也略微缩一点，免得顶出轮廓
  drawEyeShape(g, L.near + T.t * (L.eyeNear ?? 1.8), y, kind, L.scale * (1 - 0.12 * T.t));
  if (raw < 0.95) {
    if (raw === 0) {
      // 正面：把近侧那只眼睛整体镜像过去，左右严格对称
      const snapshot = [];
      for (let iy = 0; iy < H; iy += 1) for (let ix = 0; ix < W; ix += 1) {
        if (g[iy][ix] !== '.') snapshot.push([ix, iy, g[iy][ix]]);
      }
      for (const [ix, iy, ch] of snapshot) {
        const mx = W - 1 - ix;
        if (g[iy][mx] === '.') g[iy][mx] = ch;
      }
    } else {
      drawEyeShape(g, L.far + T.eyeFar, y, kind, L.scale * T.farScale);
    }
  }
  return g;
}

function drawFaceOn(rows, breed, frame) {
  const art = BREEDS[breed];
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const bob = frame.breath ? -1 : 0;
  const cx = 24 + T.face;
  const tongue = frame.happy || frame.tongue;
  const smile = frame.happy;

  if (art.species === 'bird') {
    // 开心时张嘴吐小舌头
    if (tongue) {
      triangle(rows, [cx + 1.6, 20.4 + bob], [cx + 4.6, 21.0 + bob], [cx + 2.4, 23.6 + bob], 't');
      line(rows, cx + 1.8, 21.0 + bob, cx + 4.4, 21.6 + bob, 'e');
    }
    return;
  }

  if (art.species === 'sheep' || art.species === 'goat') {
    triangle(rows, [cx - 2.0, 24.6 + bob], [cx + 2.0, 24.6 + bob], [cx, 27.0 + bob], 'e');
    line(rows, cx, 26.6 + bob, cx, 28.0 + bob, 'o');
    line(rows, cx, 28.0 + bob, cx - 2.0, 28.6 + bob, 'o');
    line(rows, cx, 28.0 + bob, cx + 2.0, 28.6 + bob, 'o');
    if (smile) {
      line(rows, cx - 2.0, 28.6 + bob, cx - 3.6, 29.2 + bob, 'o');
      line(rows, cx + 2.0, 28.6 + bob, cx + 3.6, 29.2 + bob, 'o');
    }
    if (tongue) {
      rect(rows, cx - 1.2, 29.4 + bob, 2.4, 2.0, 't');
      line(rows, cx, 30.2 + bob, cx, 31.4 + bob, 'e');
    }
    return;
  }

  if (art.species === 'cat') {
    triangle(rows, [cx - 2.5, 26.6 + bob], [cx + 2.5, 26.6 + bob], [cx, 29.4 + bob], 'p');
    line(rows, cx, 28.6 + bob, cx, 30.2 + bob, 'o');
  } else {
    ellipse(rows, cx, 27.0 + bob, 2.8, 2.2, 'e');
    rect(rows, cx - 1.8, 25.8 + bob, 1.4, 1.0, 's');
    line(rows, cx, 28.8 + bob, cx, 30.4 + bob, 'o');
    for (const [dx, dy] of [[-9.5, 17], [-7.5, 16], [9.5, 17], [7.5, 16]]) {
      const bx = Math.round(cx + dx);
      const by = Math.round(dy + bob);
      if (rows[by] && (rows[by][bx] === 'f' || rows[by][bx] === 'F')) rows[by][bx] = 'F';
    }
  }

  const my = 31 + bob;
  line(rows, cx, 30.2 + bob, cx, my, 'o');
  line(rows, cx, my, cx - 2.5, my + (smile ? 1.4 : 0.8), 'o');
  line(rows, cx, my, cx + 2.5, my + (smile ? 1.4 : 0.8), 'o');

  if (tongue) {
    rect(rows, cx - 1.4, my + 1.2, 2.8, art.species === 'cat' ? 1.8 : 2.6, 't');
    line(rows, cx, my + 2.0, cx, my + (art.species === 'cat' ? 3.0 : 3.8), 'e');
  }
}

/** 五官只画在已有的身体像素上，不能把轮廓顶出去。 */
function drawFace(rows, breed, frame) {
  const g = blank();
  drawFaceOn(g, breed, frame);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (g[y][x] !== '.' && rows[y][x] !== '.') rows[y][x] = g[y][x];
    }
  }
}

// ---------------------------------------------------------------- 花纹

function applyPattern(rows, breed, frame) {
  const art = BREEDS[breed];
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const bob = frame.breath ? -1 : 0;
  const on = (x, y, ch, allowed) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    if (allowed.includes(rows[iy][ix])) rows[iy][ix] = ch;
  };
  const fur = ['f', 'F', 'L'];
  const face = 24 + T.face;

  if (art.pattern === 'tabby') {
    for (const dx of [-4, 0, 4]) {
      for (let y = 12 + bob; y < 18 + bob; y += 1) on(face + dx, y, 'F', fur);
    }
    for (let x = face - 6; x < face + 7; x += 1) on(x, 12 + bob, 'F', fur);
    for (const [dx, dy] of [[-12, 24], [-11, 25], [-12, 27], [-11, 28], [12, 24], [11, 25], [12, 27], [11, 28]]) {
      on(24 + dx, dy + bob, 'F', fur);
    }
    for (const [dx, dy] of [[-7, 40], [-6, 41], [7, 40], [6, 41], [-7, 44], [7, 44]]) on(24 + dx, dy, 'F', fur);
  }

  if (art.pattern === 'tiger') {
    for (const dx of [-6, -2, 2, 6]) {
      for (let y = 11 + bob; y < 19 + bob; y += 1) on(face + dx, y, 'e', fur);
    }
    for (const [dx, dy] of [[-13, 23], [-12, 24], [-13, 26], [-12, 27], [13, 23], [12, 24], [13, 26], [12, 27]]) {
      on(24 + dx, dy + bob, 'e', fur);
    }
    for (const [dx, dy] of [[-8, 38], [-8, 41], [8, 38], [8, 41], [-9, 44], [9, 44]]) {
      on(24 + dx, dy, 'e', fur);
    }
  }

  if (art.pattern === 'gold') {
    for (const [dx, dy] of [[-5, 11], [-4, 11], [4, 11], [5, 11], [-2, 10], [2, 10], [-7, 12], [7, 12], [-9, 14], [9, 14]]) {
      on(face - 1 + dx, dy + bob, 'g', fur);
    }
    for (const [dx, dy] of [[-7, 37], [-6, 38], [7, 37], [-8, 40], [8, 40]]) on(24 + dx, dy, 'g', fur);
  }

  if (art.pattern === 'sheen') {
    line(rows, face - 8, 11, face - 11, 16, 'L');
    line(rows, face - 7, 12, face - 10, 16, 'L');
  }

  if (art.pattern === 'mask') {
    for (let y = 11 + bob; y < 25 + bob; y += 1) {
      on(face - 1, y, 'w', fur);
      on(face, y, 'w', fur);
      on(face + 1, y, 'w', fur);
    }
    ellipse(rows, face - 9, 15.5 + bob, 4.8, 3.4, 'F');
    ellipse(rows, face + 9, 15.5 + bob, 4.8, 3.4, 'F');
    for (const [dx, dy] of [[-14, 4], [-13, 6], [14, 4], [13, 6]]) on(24 + dx, dy + bob, 'F', fur);
  }

  if (art.pattern === 'fluff') {
    for (const [dx, dy] of [[-14, 8], [-13, 10], [-13, 12], [14, 8], [13, 10], [13, 12]]) on(24 + dx, dy + bob, 'F', fur);
  }

  return rows;
}

// ---------------------------------------------------------------- 尾巴

function tailShape(breed, frame) {
  const art = BREEDS[breed];
  const T = turnShift(frame.turn, TURN_FACTOR[BREEDS[breed].species] ?? 1);
  const g = blank();
  const sway = [-3.0, 0, 3.0, 0][((frame.tail % 4) + 4) % 4];
  const bez = (p0, p1, p2, t) => [
    (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
    (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
  ];

  if (art.species === 'bird') {
    // 三根长尾羽
    for (const [dx, len, col] of [[1.6, 1.0, 'f'], [4.4, 1.18, 'F'], [7.0, 0.92, 'f']]) {
      const p0 = [24 + T.body + dx, 43];
      const p1 = [31 + T.body + dx, 50];
      const p2 = [34 + dx + sway * 0.5, 40 + 12 * len];
      for (let i = 0; i <= 20; i += 1) {
        const t = i / 20;
        const [x, y] = bez(p0, p1, p2, t);
        ellipse(g, x, y, 2.2 - t * 0.9, 2.2 - t * 0.9, col);
      }
    }
    return outlined(g);
  }

  if (art.species === 'sheep') {
    for (let i = 0; i <= 10; i += 1) {
      const t = i / 10;
      const [x, y] = bez([29, 32], [35, 33], [34 + sway * 0.4, 29], t);
      ellipse(g, x, y, 2.3, 2.3, 'f');
    }
    return outlined(g);
  }

  if (art.species === 'goat') {
    for (let i = 0; i <= 9; i += 1) {
      const t = i / 9;
      const [x, y] = bez([29, 33], [34, 31], [33 + sway * 0.4, 28], t);
      ellipse(g, x, y, 1.9, 1.9, 'f');
    }
    return outlined(g);
  }

  if (art.species === 'cat') {
    const p0 = [30 + T.body, 47];
    const p1 = [44, 47];
    const p2 = [37 + T.t * 2, 29];
    const ring = art.pattern === 'tabby';
    const stripe = art.pattern === 'tiger';
    for (let i = 0; i <= 30; i += 1) {
      const t = i / 30;
      const [x, y] = bez(p0, p1, p2, t);
      const band = (ring && Math.floor(t * 7) % 2 === 1) || (stripe && Math.floor(t * 8) % 2 === 1);
      ellipse(g, x + sway * t * 1.1, y, 2.1, 2.1, band ? (stripe ? 'e' : 'F') : 'f');
    }
    const [tx, ty] = bez(p0, p1, p2, 1);
    ellipse(g, tx + sway * 1.1, ty, 2.4, 2.4, ring ? 'F' : art.pattern === 'gold' ? 'g' : 'f');
    return outlined(g);
  }

  const p0 = [30 + T.body, 48];
  const p1 = [44, 49];
  const p2 = [41, 34];
  for (let i = 0; i <= 22; i += 1) {
    const t = i / 22;
    const [x, y] = bez(p0, p1, p2, t);
    ellipse(g, x + sway * t, y, 2.3, 2.3, t > 0.86 ? 'F' : 'f');
  }
  return outlined(g);
}

// ---------------------------------------------------------------- 组装

function buildSprite(breed, frame = {}) {
  const key = BREEDS[breed] ? breed : 'tabby';
  const art = BREEDS[key];
  const f = {
    breath: frame.breath ? 1 : 0,
    tail: Number.isFinite(frame.tail) ? frame.tail : 0,
    eyes: frame.eyes || 'open',
    happy: Boolean(frame.happy),
    tongue: Boolean(frame.tongue),
    ear: frame.ear ? 1 : 0,
    turn: Number.isFinite(frame.turn) ? Math.max(0, Math.min(1, frame.turn)) : 0,
    dir: frame.dir === -1 ? -1 : 1,
  };
  const T = turnShift(f.turn);

  const g = blank();
  drawTorso(g, key, f);
  drawMane(g, key, f);
  drawEars(g, key, f);
  drawHorns(g, key, f);
  drawHead(g, key, f);
  drawMuzzle(g, key, f);

  let rows = outlined(closeGaps(g));
  rows = rimShadow(rows);
  rows = applyPattern(rows, key, f);

  // 头顶高光
  const hb = f.breath ? -1 : 0;
  const hx = 24 + T.t * 1.2;
  for (const [dx, dy] of [[-8, 13], [-7, 12], [-6, 12], [-8, 14], [-7, 13], [-5, 13]]) {
    const x = hx + dx;
    const y = dy + hb;
    if (rows[y] && (rows[y][x] === 'f' || rows[y][x] === 'F')) rows[y][x] = 'L';
  }

  drawFace(rows, key, f);

  if (art.species === 'dog') {
    for (let y = 33; y < 37; y += 1) {
      for (let x = 15; x < 33; x += 1) {
        if (rows[y][x] !== '.' && rows[y][x] !== 'o') rows[y][x] = 'r';
      }
    }
    rect(rows, 22.6, 35.6, 2.8, 2.6, 'g');
  }

  const tail = tailShape(key, f);
  const eyes = eyeGrid(key, f);

  if (f.dir === -1) {
    return { body: flip(rows), tail: flip(tail), eyes: flip(eyes) };
  }
  return { body: rows, tail, eyes };
}

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
      // 老虎：动作沉稳、有分量，尾巴甩得慢但幅度大
      tiger: {
        breathTicks: 8,
        tailTicks: 2,
        blink: [3200, 5200],
        blinkHold: 120,
        twitch: [4200, 7200],
        glance: [3000, 5200],
        glanceHold: 1100,
        hopMs: 560,
        hearts: 3,
        bounce: 1.1,
      },
      // 狮子：威严、慢性子，动一下是一下
      lion: {
        breathTicks: 9,
        tailTicks: 3,
        blink: [3800, 6400],
        blinkHold: 180,
        twitch: [8000, 13000],
        glance: [4200, 7000],
        glanceHold: 1500,
        hopMs: 620,
        hearts: 3,
        bounce: 0.85,
      },
      // 鹦鹉：又快又爱动，眨眼、张望、抖头都频繁
      parrot: {
        breathTicks: 4,
        tailTicks: 1,
        blink: [1500, 2600],
        blinkHold: 50,
        twitch: [1600, 2800],
        glance: [1300, 2400],
        glanceHold: 700,
        hopMs: 380,
        hearts: 3,
        bounce: 1.3,
      },
      // 绵羊：胆小、软，动作慢半拍
      sheep: {
        breathTicks: 11,
        tailTicks: 3,
        blink: [3400, 5800],
        blinkHold: 160,
        twitch: [7000, 12000],
        glance: [4000, 7000],
        glanceHold: 1300,
        hopMs: 700,
        hearts: 3,
        bounce: 0.6,
      },
      // 山羊：好奇又犟，动作利落
      goat: {
        breathTicks: 7,
        tailTicks: 2,
        blink: [2800, 4400],
        blinkHold: 80,
        twitch: [3000, 5200],
        glance: [2200, 3600],
        glanceHold: 1000,
        hopMs: 520,
        hearts: 3,
        bounce: 1.15,
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
        tiger: '老虎',
        lion: '狮子',
        golden: '金毛',
        samoyed: '萨摩耶',
        husky: '哈士奇',
        parrot: '鹦鹉',
        sheep: '绵羊',
        goat: '山羊',
      },
      lines: {
        tabby: ['喵？', '有事说事', '别碰尾巴', '这地盘我的'],
        white: ['……', '嗯。', '轻一点', '知道了'],
        black: ['……', '我看见你了', '别开灯', '嗯'],
        chinchilla: ['困…', '再睡五分钟', '呼…', '摸摸～'],
        tiger: ['吼——', '别碰尾巴', '本大王在此', '嗯？'],
        lion: ['吼。', '让开点', '本狮在晒太阳', '摸头可以'],
        golden: ['一起玩！', '你回来啦！', '再扔一次球！', '好开心！'],
        samoyed: ['嘿嘿嘿', '开心！', '抱抱！', '今天也超棒'],
        husky: ['嗷呜——', '你听我解释', '拆家预备', '我要出去！'],
        parrot: ['你好！', '学你说话', '啾啾！', '要瓜子吗'],
        sheep: ['咩…', '我有点怕', '毛软吧？', '别吓我'],
        goat: ['咩！', '顶你一下？', '这个能吃吗', '我偏不走'],
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
        tiger: 'Tiger',
        lion: 'Lion',
        golden: 'Golden',
        samoyed: 'Samoyed',
        husky: 'Husky',
        parrot: 'Parrot',
        sheep: 'Sheep',
        goat: 'Goat',
      },
      lines: {
        tabby: ['Mrrp?', 'What do you want', 'Not the tail', 'This is my turf'],
        white: ['…', 'Mm.', 'Gently', 'Noted.'],
        black: ['…', 'I see you', 'Leave the light off', 'Mm.'],
        chinchilla: ['Sleepy…', 'Five more minutes', 'Mrr…', 'Mm, pets'],
        tiger: ['Rawr—', 'Not the tail', 'The king is here', 'Hm?'],
        lion: ['Roar.', 'Move a bit', 'Sunbathing here', 'Head pats ok'],
        golden: ['Let us play!', 'You are back!', 'Throw it again!', 'So happy!'],
        samoyed: ['Hehehe', 'Yay!', 'Hug me!', 'Best day!'],
        husky: ['Awooo—', 'Let me explain', 'Chaos incoming', 'Let me out!'],
        parrot: ['Hello!', 'I copy you', 'Tweet tweet!', 'Got seeds?'],
        sheep: ['Baa…', 'I get scared', 'Soft, right?', 'Do not scare me'],
        goat: ['Meh!', 'Headbutt?', 'Is this edible', 'I will not move'],
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
/* 转身时眼睛是跟着脑袋一格一格重画的，别再让它自己滑过去 */
.dsp-root.is-turned .dsp-eyes, .dsp-root.is-dragging .dsp-eyes { transition: none; }
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
        [breed, frame.breath, frame.tail, frame.eyes, frame.happy, frame.tongue, frame.ear, frame.turn, frame.dir],
      );
      const body = React.useMemo(() => spritePaths(sprite.body), [sprite]);
      const tail = React.useMemo(() => spritePaths(sprite.tail), [sprite]);
      const eyes = React.useMemo(() => spritePaths(eyeGrid(breed, frame)), [breed, frame.breath, frame.eyes]);

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
        return [...spritePaths(sprite.body), ...spritePaths(eyeGrid(breed, { breath: 0, eyes: 'open' }))];
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
          // 转身：0 正面 → 0.5 侧四十五度 → 1 侧面，中间每一档都真的画出来
          const [pose, setPose] = React.useState({ turn: 0, dir: 1 });
          const poseRef = React.useRef({ turn: 0, dir: 1 });
          const targetRef = React.useRef({ turn: 0, dir: 1 });
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
            const loop = () => {
              at(() => {
                // 侧过身去看一眼，再转回来
                targetRef.current = { turn: 0.5, dir: Math.random() < 0.5 ? -1 : 1 };
                at(() => {
                  targetRef.current = { turn: 0, dir: poseRef.current.dir };
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

          // 转身：每 90ms 逼近目标一档，保持一档一档地转，不会瞬间跳过去
          React.useEffect(() => {
            const id = window.setInterval(() => {
              setPose((prev) => {
                const target = targetRef.current;
                // 朝向要变时，先转回正面再翻面，避免「啪」地镜像
                if (prev.dir !== target.dir && prev.turn > 0) {
                  const next = { turn: Math.max(0, prev.turn - 0.5), dir: prev.dir };
                  poseRef.current = next;
                  return next;
                }
                const dir = prev.dir !== target.dir ? target.dir : prev.dir;
                let turn = prev.turn;
                if (turn < target.turn) turn = Math.min(target.turn, turn + 0.5);
                else if (turn > target.turn) turn = Math.max(target.turn, turn - 0.5);
                if (turn === prev.turn && dir === prev.dir) return prev;
                const next = { turn, dir };
                poseRef.current = next;
                return next;
              });
            }, 90);
            return () => window.clearInterval(id);
          }, []);

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
              if (Math.abs(dx) > limit || Math.abs(dy) > limit) {
                // 指针走远了就转回正面，别再一直扭着头
                if (targetRef.current.turn !== 0) {
                  targetRef.current = { turn: 0, dir: poseRef.current.dir };
                }
                return;
              }
              const next = {
                x: Math.max(-1, Math.min(1, Math.round(dx / 42))),
                y: Math.max(-1, Math.min(1, Math.round(dy / 42))),
              };
              setPointerLook((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
              // 指针靠近时：偏一点只转眼珠，偏得多一点侧转，偏到身侧才整个转过去
              const far = Math.abs(dx);
              targetRef.current = {
                turn: far > 118 && Math.abs(dy) < 96 ? 1 : far > 62 ? 0.5 : 0,
                dir: dx < 0 ? -1 : 1,
              };
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
            targetRef.current = { turn: 0, dir: poseRef.current.dir };
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
            const vx = event.clientX - (drag.lastX === undefined ? event.clientX : drag.lastX);
            drag.lastX = event.clientX;
            if (vx > 3) targetRef.current = { turn: 1, dir: 1 };
            else if (vx < -3) targetRef.current = { turn: 1, dir: -1 };
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
            turn: pose.turn,
            dir: pose.dir,
          };
          // 侧过身以后眼睛已经画在朝向上，就不用再额外偏移了
          const look = dozing || pose.turn > 0 ? { x: 0, y: 0 } : pointerLook;
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
                  (pose.turn > 0 ? ' is-turned' : '') +
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
