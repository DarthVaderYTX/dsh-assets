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

    // ------------------------------------------------------------ 精灵开始
    // #region sprite

// 像素宠物精灵：32×36 网格（宽 32、高 36），几何铺色 + 自动描边 + 体积明暗。
// 纯函数、不依赖 React；按帧参数生成（呼吸 / 眨眼 / 尾巴 / 表情）。

const W = 32;
const H = 36;
const PALETTES = {
  cat: {
    o: '#33241d', f: '#f2ab5e', F: '#cd8340', L: '#ffd39a', w: '#fff6e8',
    p: '#ff9dbb', e: '#2a1d17', s: '#ffffff', i: '#ffb84d', t: '#ff8fa8', r: '#e0563f',
  },
  dog: {
    o: '#2e211a', f: '#cd8f5c', F: '#9b6034', L: '#eab989', w: '#fff4e3',
    p: '#ff9dbb', e: '#2a1d17', s: '#ffffff', i: '#8a5a2b', t: '#ff7f9c', r: '#e0563f',
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

/** 只在形体外面补 1px 描边。 */
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

/** 右侧贴边的毛压暗，形成圆润的体积感。 */
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

function bodyShape(species, frame) {
  const g = blank();
  const cat = species === 'cat';
  const bob = frame.breath ? -1 : 0;

  // 坐着的身体：上窄下宽的圆角块
  rounded(g, 9, 20, 15, 14, 'f', 5);

  if (cat) {
    // 尖耳：圆底压进头顶，尖顶朝上外
    const twitch = frame.ear ? 1 : 0;
    ellipse(g, 9.4, 9.0 - twitch * 0.6, 3.4, 3.4, 'f');
    triangle(g, [6.6 - twitch * 0.9, 1.2 + twitch * 0.5], [4.6, 10.0], [12.8, 7.4], 'f');
    mirror(g);
  } else {
  }

  // 头
  ellipse(g, 16, 13.4 + bob, 8.4, 7.6, 'f');

  if (!cat) {
    // 狗耳压在头两侧：上面宽、下面收，像垂下来的耳片
    ellipse(g, 8.2, 12.0 + bob + (frame.ear ? 0.8 : 0), 2.0, 5.0, 'F');
    ellipse(g, 7.8, 16.0 + bob + (frame.ear ? 0.8 : 0), 1.9, 1.9, 'F');
    mirror(g);
  }

  // 口鼻、胸腹、前爪（浅色块）
  if (cat) ellipse(g, 16, 17.6 + bob, 4.8, 3.0, 'w');
  else ellipse(g, 16, 17.8 + bob, 5.6, 3.8, 'w');
  ellipse(g, 16, 29.6, 4.6, 4.2, 'w');
  ellipse(g, 13.0, 33.4, 2.6, 1.5, 'w');
  mirror(g);

  return g;
}

// --------------------------------------------------------------- 五官

function drawFace(rows, species, frame) {
  const cat = species === 'cat';
  const bob = frame.breath ? -1 : 0;
  const noseY = 16 + bob;

  if (cat) {
    // 三角鼻
    for (const x of [14, 15, 16, 17]) put(rows, x, noseY, 'p');
    for (const x of [15, 16]) put(rows, x, noseY + 1, 'p');
    // ω 嘴；开心时张开露出舌头
    put(rows, 14, noseY + 2, 'o');
    put(rows, 17, noseY + 2, 'o');
    if (frame.happy) {
      for (const x of [15, 16]) {
        put(rows, x, noseY + 3, 'o');
        put(rows, x, noseY + 4, 't');
      }
    } else {
      put(rows, 15, noseY + 3, 'o');
      put(rows, 16, noseY + 3, 'o');
    }
  } else {
    // 大鼻头
    ellipse(rows, 16, noseY + 0.6, 2.2, 1.6, 'e');
    put(rows, 15, noseY - 0.2, 'i');
    put(rows, 16, noseY - 0.2, 'i');
    // 嘴
    put(rows, 14, noseY + 2, 'o');
    put(rows, 17, noseY + 2, 'o');
    put(rows, 15, noseY + 3, 'o');
    put(rows, 16, noseY + 3, 'o');
    if (frame.happy) {
      for (const y of [noseY + 3, noseY + 4]) {
        put(rows, 15, y, 't');
        put(rows, 16, y, 't');
      }
    }
    // 眉毛点：狗最像狗的地方
    for (const x of [11, 12, 19, 20]) put(rows, x, 9 + bob, 'F');
  }

  return rows;
}

/** 眼睛模板：5×5 睁眼 / 半闭 / 闭眼。 */
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
            [0, 2, 'o'], [4, 2, 'o'], [1, 2, 'e'], [2, 2, 'e'], [3, 2, 'e']];
  }
  return [
    [1, 0, 'o'], [2, 0, 'o'], [3, 0, 'o'],
    [0, 1, 'o'], [1, 1, 's'], [2, 1, 's'], [3, 1, 'e'], [4, 1, 'o'],
    [0, 2, 'o'], [1, 2, 'e'], [2, 2, 'e'], [3, 2, 'e'], [4, 2, 'o'],
    [0, 3, 'o'], [1, 3, 'e'], [2, 3, 'e'], [3, 3, 'e'], [4, 3, 'o'],
    [1, 4, 'o'], [2, 4, 'o'], [3, 4, 'o'],
  ];
}

function eyeAnchors(frame) {
  const bob = frame.breath ? -1 : 0;
  return [
    { x: 9, y: 11 + bob },
    { x: 18, y: 11 + bob },
  ];
}

// --------------------------------------------------------------- 尾巴

function tailShape(species, frame) {
  const g = blank();
  const cat = species === 'cat';
  const sway = [-2.2, 0, 2.2, 0][((frame.tail % 4) + 4) % 4];

  const bezier = (p0, p1, p2, t) => [
    (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
    (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
  ];

  if (cat) {
    const p0 = [20.6, 29.8];
    const p1 = [28.6, 33.6];
    const p2 = [28.8, 25.8];
    for (let i = 0; i <= 18; i += 1) {
      const t = i / 18;
      const [x, y] = bezier(p0, p1, p2, t);
      ellipse(g, x + sway * t * 1.2, y, 1.6, 1.6, 'f');
    }
    const [tx, ty] = bezier(p0, p1, p2, 1);
    ellipse(g, tx + sway * 1.2, ty, 1.7, 1.7, 'w');
  } else {
    const p0 = [20.8, 29.6];
    const p1 = [28.4, 33.2];
    const p2 = [28.2, 25.4];
    for (let i = 0; i <= 10; i += 1) {
      const t = i / 10;
      const [x, y] = bezier(p0, p1, p2, t);
      ellipse(g, x + sway * t, y, 2.0, 2.0, 'F');
    }
  }

  return outlined(g);
}

// --------------------------------------------------------------- 组装

function buildSprite(species, frame = {}) {
  const key = species === 'dog' ? 'dog' : 'cat';
  const f = {
    breath: frame.breath ? 1 : 0,
    tail: Number.isFinite(frame.tail) ? frame.tail : 0,
    eyes: frame.eyes || 'open',
    happy: Boolean(frame.happy),
    ear: frame.ear ? 1 : 0,
  };

  const body = bodyShape(key, f);
  let rows = outlined(body);
  rows = rimShadow(rows);

  // 头顶高光
  ellipse(rows, 11.8, 9.2 + f.breath * -1, 2.0, 1.0, 'L');

  // 内耳：猫是粉色耳窝，狗是更浅的内侧
  if (key === 'cat') {
    for (const [x, y] of [[7, 4], [7, 5], [8, 5], [8, 6]]) {
      put(rows, x, y, 'p');
      put(rows, W - 1 - x, y, 'p');
    }
  }

  drawFace(rows, key, f);

  // 狗的项圈
  if (key === 'dog') {
    const y0 = 20;
    for (let x = 10; x <= 21; x += 1) {
      for (const y of [y0, y0 + 1]) {
        if (rows[y][x] !== '.' && rows[y][x] !== 'o') rows[y][x] = 'r';
      }
    }
    for (const y of [y0 + 1, y0 + 2]) {
      put(rows, 15, y, 'i');
      put(rows, 16, y, 'i');
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

/** 同色的横向连续格子并成一个矩形，减少绘制元素。 */
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
      swapToDog: '换成小狗',
      swapToCat: '换成小猫',
      pats: '已经摸过 {n} 次',
      lines: {
        cat: ['喵～', '呼噜呼噜…', '再摸一下嘛', '尾巴都竖起来了'],
        dog: ['汪！', '尾巴要甩断啦', '再摸摸～', '汪汪汪汪！'],
      },
    };
    const EN = {
      aria: 'Pixel pet — click to pet it',
      hint: 'Drag me anywhere, click to pet',
      swapToDog: 'Switch to dog',
      swapToCat: 'Switch to cat',
      pats: 'petted {n} times',
      lines: {
        cat: ['Meow~', 'Purr purr…', 'One more pat?', 'Tail is up!'],
        dog: ['Woof!', 'My tail might fall off!', 'More pets~', 'Woof woof!'],
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
.dsp-sprite { display: block; overflow: visible; }
.dsp-tail { transform-box: view-box; transform-origin: 20px 30px; }
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
.dsp-root.is-happy .dsp-shadow { transform: scale(.8); opacity: .65; }
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
.dsp-root:hover .dsp-dock, .dsp-root:focus-within .dsp-dock { opacity: 1; transform: translateY(0); }
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
  45% { transform: translateY(-13px) scale(.95, 1.06); }
  68% { transform: translateY(0) scale(1.05, .95); }
  85% { transform: translateY(-3px) scale(1, 1); }
  100% { transform: translateY(0) scale(1, 1); }
}
@keyframes dsp-float {
  0% { opacity: 0; transform: translate(0, 0) scale(.5); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--dsp-dx, 0), -34px) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .dsp-figure, .dsp-heart { animation: none !important; }
}
`;

    function PixelPet({ species, frame, look }) {
      const palette = PALETTES[species] || PALETTES.cat;
      const sprite = React.useMemo(
        () => buildSprite(species, frame),
        [species, frame.breath, frame.tail, frame.eyes, frame.happy, frame.ear],
      );
      const body = React.useMemo(() => spritePaths(sprite.body), [sprite]);
      const tail = React.useMemo(() => spritePaths(sprite.tail), [sprite]);
      const eyes = React.useMemo(() => spritePaths(eyeGrid(frame)), [frame.breath, frame.eyes]);

      const paint = (paths, keyPrefix) =>
        paths.map(({ ch, d }) =>
          h('path', { key: keyPrefix + ch, d, fill: palette[ch] || '#000000' }),
        );

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
        h('g', { className: 'dsp-tail' }, paint(tail, 'tail-')),
        h('g', null, paint(body, 'body-')),
        h(
          'g',
          { className: 'dsp-eyes', style: { transform: `translate(${look.x}px, ${look.y}px)` } },
          paint(eyes, 'eye-'),
        ),
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
          const [species, setSpecies] = React.useState(initial.species === 'dog' ? 'dog' : 'cat');
          const [pats, setPats] = React.useState(Number(initial.pats) || 0);
          const [tick, setTick] = React.useState(0);
          const [eyes, setEyes] = React.useState('open');
          const [happy, setHappy] = React.useState(false);
          const [bubble, setBubble] = React.useState(null);
          const [hearts, setHearts] = React.useState([]);
          const [hint, setHint] = React.useState(false);
          const [dragging, setDragging] = React.useState(false);
          const [pointerLook, setPointerLook] = React.useState({ x: 0, y: 0 });
          const [glance, setGlance] = React.useState(null);
          const [twitch, setTwitch] = React.useState(false);
          const [pos, setPos] = React.useState(() => {
            const saved = initial.pos;
            if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
              return { left: saved.left, top: saved.top };
            }
            return null;
          });
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

          // 呼吸 / 尾巴 / 眨眼：一个 9fps 的节拍推进帧号。
          // 用户要求减少动态效果时不跑节拍，只留静态形象。
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

          React.useEffect(() => {
            let alive = true;
            let timer = null;
            const queue = (fn, ms) => {
              timer = window.setTimeout(() => {
                if (alive) fn();
              }, ms);
            };
            const blink = () => {
              if (!alive) return;
              setEyes('half');
              queue(() => {
                setEyes('closed');
                queue(() => {
                  setEyes('half');
                  queue(() => {
                    setEyes('open');
                    queue(blink, 2600 + Math.random() * 3600);
                  }, 60);
                }, 90);
              }, 60);
            };
            queue(blink, 2600 + Math.random() * 3400);
            return () => {
              alive = false;
              window.clearTimeout(timer);
            };
          }, []);

          // 偶尔自己东张西望
          React.useEffect(() => {
            let alive = true;
            let timer = null;
            const lookAround = () => {
              if (!alive) return;
              const dirs = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 1 }, { x: 0, y: 0 }];
              const pick = dirs[Math.floor(Math.random() * dirs.length)];
              setGlance(pick);
              timer = window.setTimeout(() => {
                if (!alive) return;
                setGlance(null);
                timer = window.setTimeout(lookAround, 3400 + Math.random() * 4200);
              }, 1000);
            };
            timer = window.setTimeout(lookAround, 4200);
            return () => {
              alive = false;
              window.clearTimeout(timer);
            };
          }, []);

          // 隔一阵抖一下耳朵
          React.useEffect(() => {
            let alive = true;
            let timer = null;
            const schedule = () => {
              timer = window.setTimeout(() => {
                if (!alive) return;
                setTwitch(true);
                timer = window.setTimeout(() => {
                  if (!alive) return;
                  setTwitch(false);
                  schedule();
                }, 190);
              }, 5200 + Math.random() * 4200);
            };
            schedule();
            return () => {
              alive = false;
              window.clearTimeout(timer);
            };
          }, []);

          // 眼睛跟着鼠标转（只在附近生效，免得整页乱瞟）
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

          React.useEffect(() => () => {
            window.clearTimeout(happyTimer.current);
            window.clearTimeout(bubbleTimer.current);
            window.clearTimeout(hintTimer.current);
          }, []);

          React.useEffect(() => {
            if (initial.seenHint) return undefined;
            setHint(true);
            hintTimer.current = window.setTimeout(() => setHint(false), 3800);
            writeStore({ ...initial, seenHint: true, species, pats });
            return undefined;
          }, []); // eslint-disable-line react-hooks/exhaustive-deps

          const persist = (patch) => {
            writeStore({ ...readStore(), species, pats, ...patch });
          };

          const cheer = () => {
            const lines = t('lines.' + species);
            const pool = Array.isArray(lines) && lines.length ? lines : [''];
            patsRef.current += 1;
            setPats(patsRef.current);
            persist({ pats: patsRef.current });
            setHappy(true);
            setEyes('happy');
            setBubble(pool[Math.floor(Math.random() * pool.length)]);
            setHearts((prev) => [
              ...prev.slice(-4),
              { id: Date.now() + Math.random(), dx: Math.round((Math.random() - 0.5) * 30) },
            ]);
            window.clearTimeout(happyTimer.current);
            window.clearTimeout(bubbleTimer.current);
            happyTimer.current = window.setTimeout(() => {
              setHappy(false);
              setEyes('open');
            }, HAPPY_MS);
            bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_MS);
            window.setTimeout(() => {
              setHearts((prev) => prev.slice(1));
            }, 1050);
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

          const swap = () => {
            const next = species === 'cat' ? 'dog' : 'cat';
            setSpecies(next);
            setBubble(null);
            setHearts([]);
            setEyes('open');
            writeStore({ ...readStore(), species: next, pats });
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
            breath: Math.floor(tick / 9) % 2,
            tail: happy ? tick % 4 : Math.floor(tick / 2) % 4,
            eyes: happy ? 'happy' : eyes,
            happy,
            ear: twitch && !dragging,
          };
          const look = glance || pointerLook;
          const place = pos || initialPos;

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
                  'dsp-root' + (dragging ? ' is-dragging' : '') + (happy ? ' is-happy' : ''),
                style: { left: place.left + 'px', top: place.top + 'px' },
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
                h(PixelPet, { species, frame, look }),
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
                    'aria-label': species === 'cat' ? t('swapToDog') : t('swapToCat'),
                    title: species === 'cat' ? t('swapToDog') : t('swapToCat'),
                    onPointerDown: (event) => event.stopPropagation(),
                    onClick: (event) => {
                      event.stopPropagation();
                      swap();
                    },
                  },
                  species === 'cat' ? '\u{1F436}' : '\u{1F431}',
                ),
              ),
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
