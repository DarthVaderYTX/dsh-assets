window.__ModuleLoader__.load({
  id: 'dsh-pet',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-pet';
    const STORE_KEY = 'dsh.pet.v1';
    const SCALE = 4; // 20×20 的像素格 → 80px
    const HAPPY_MS = 900;
    const BUBBLE_MS = 1600;

    // ------------------------------------------------------------ 精灵开始
    // #region sprite
// 像素宠物精灵：纯函数，无 React 依赖。20×20 网格。
// 流程：先铺色块（毛发/肚皮/口鼻）→ 自动描边 → 最后点五官。

const GRID = 20;

const PALETTES = {
  cat: {
    o: '#3a2a22', f: '#f2a25a', F: '#d9863f', w: '#fff6e9',
    p: '#ff9dbb', e: '#2f2119', n: '#ff9dbb', t: '#ff8fa8',
  },
  dog: {
    o: '#3a2a22', f: '#cf9259', F: '#a86b3c', w: '#fff4e3',
    p: '#ff9dbb', e: '#2f2119', n: '#2b1d17', t: '#ff7f9c',
  },
};

const blank = () => Array.from({ length: GRID }, () => new Array(GRID).fill('.'));

function put(g, x, y, ch) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return;
  g[iy][ix] = ch;
}

function ellipse(g, cx, cy, rx, ry, ch) {
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
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
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
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

/** 左右镜像（列 x ↔ GRID-1-x），保证对称。 */
function mirror(g) {
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID / 2; x += 1) g[y][GRID - 1 - x] = g[y][x];
  }
}

function outlined(g) {
  const out = g.map((row) => row.slice());
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (g[y][x] !== '.') continue;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < GRID && ny < GRID && g[ny][nx] !== '.';
      });
      if (touches) out[y][x] = 'o';
    }
  }
  return out;
}

/** 五官：两只眼睛按同一朝向画，不做镜像，省得高光翻面。 */
function stampFace(g, species, state) {
  const cat = species === 'cat';
  const eyeY = 5;

  // 左眼 6..7，右眼 12..13。开心时弯成 ^，右眼左右翻一下才对称。
  for (const [ex, flipped] of [[6, false], [12, true]]) {
    if (state === 'blink') {
      put(g, ex, eyeY + 1, 'e');
      put(g, ex + 1, eyeY + 1, 'e');
    } else if (state === 'happy') {
      put(g, ex + (flipped ? 0 : 0), flipped ? eyeY : eyeY + 1, 'e');
      put(g, ex + 1, flipped ? eyeY + 1 : eyeY, 'e');
    } else {
      put(g, ex, eyeY, 'e');
      put(g, ex + 1, eyeY, 'e');
      put(g, ex, eyeY + 1, 'e');
      put(g, ex + 1, eyeY + 1, 'e');
    }
  }

  // 鼻子：猫是小粉鼻，狗是方一点的黑鼻头
  put(g, 9, 8, cat ? 'p' : 'n');
  put(g, 10, 8, cat ? 'p' : 'n');
  if (!cat) {
    put(g, 9, 9, 'n');
    put(g, 10, 9, 'n');
  }

  // 嘴
  if (state === 'happy' && !cat) {
    put(g, 9, 11, 't');
    put(g, 10, 11, 't');
    put(g, 9, 12, 't');
    put(g, 10, 12, 't');
  } else if (state === 'happy') {
    put(g, 9, 10, 'o');
    put(g, 10, 10, 'o');
    put(g, 9, 11, 'o');
    put(g, 10, 11, 'o');
  } else if (cat) {
    put(g, 9, 9, 'o');
    put(g, 10, 9, 'o');
    put(g, 8, 10, 'o');
    put(g, 11, 10, 'o');
  } else {
    put(g, 9, 10, 'o');
    put(g, 10, 10, 'o');
  }
}

function drawBody(species, state) {
  let g = blank();
  const cat = species === 'cat';

  if (cat) {
    // 尖耳朵：圆底 + 尖顶，圆底和头自然融合，不留缝
    ellipse(g, 4.6, 4.0, 2.2, 2.2, 'f');
    triangle(g, [3.8, 0.2], [2.8, 4.6], [7.0, 3.8], 'f');
    mirror(g);
  } else {
    // 垂耳朵：从头顶垂到脸颊
    ellipse(g, 3.4, 6.0, 2.2, 3.6, 'F');
    mirror(g);
  }

  // 头 + 身体
  ellipse(g, 10, 7.2, 5.2, 4.2, 'f');
  rounded(g, 6, 10, 8, 9, 'f', 3);

  // 肚皮、口鼻、爪子（同一副身上的浅色块）
  ellipse(g, 10, 15.2, 2.2, 2.2, 'w');
  ellipse(g, 10, 8.7, cat ? 2.4 : 2.9, cat ? 1.6 : 1.8, 'w');
  ellipse(g, 7.4, 17.4, 1.4, 1.0, 'w');
  mirror(g);

  return g;
}

function finish(species, state, g) {
  const cat = species === 'cat';
  const rows = outlined(g);

  // 内耳（画在描边之后，仍在耳朵内部）
  if (cat) {
    put(rows, 4, 2, 'p');
    put(rows, 4, 3, 'p');
    mirror(rows);
  } else {
    put(rows, 3, 5, 'p');
    put(rows, 3, 6, 'p');
    mirror(rows);
  }

  stampFace(rows, species, state);
  return rows;
}

function tailOf(species) {
  const g = blank();
  if (species === 'cat') {
    for (const [x, y] of [[13.3, 16.4], [15.0, 15.6], [16.4, 14.0], [17.0, 12.0], [16.6, 10.0]]) {
      ellipse(g, x, y, 1.4, 1.4, 'f');
    }
  } else {
    for (const [x, y] of [[13.3, 15.8], [14.9, 14.8], [16.0, 13.2]]) {
      ellipse(g, x, y, 1.7, 1.7, 'F');
    }
  }
  return outlined(g);
}

function buildSprite(species, state = 'idle') {
  const key = species === 'dog' ? 'dog' : 'cat';
  return { body: finish(key, state, drawBody(key, state)), tail: tailOf(key) };
}

function spriteRects(rows, palette) {
  const rects = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      rects.push({ x, y, fill: palette[ch] || palette.o });
    }
  }
  return rects;
}

    // #endregion sprite

    // ------------------------------------------------------------------ 文案
    const ZH = {
      aria: '电子宠物，点一下摸摸它',
      hint: '按住我，拖到哪儿都行',
      swapToDog: '换成小狗',
      swapToCat: '换成小猫',
      pats: '摸过 {n} 次',
      lines: {
        cat: ['喵～', '呼噜呼噜…', '摸摸头', '再来一下嘛'],
        dog: ['汪！', '尾巴要甩断啦', '再摸摸～', '汪汪汪汪！'],
      },
    };
    const EN = {
      aria: 'Pixel pet, click to pet it',
      hint: 'Hold me and drag me anywhere',
      swapToDog: 'Switch to dog',
      swapToCat: 'Switch to cat',
      pats: 'petted {n} times',
      lines: {
        cat: ['Meow~', 'Purr purr…', 'Head pats!', 'Again, please'],
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
  transition: filter 160ms ease;
}
.dsp-root.is-dragging { cursor: grabbing; }
.dsp-root:focus-visible { outline: 2px solid var(--dsh-color-accent, #247bbf); outline-offset: 4px; border-radius: 12px; }
.dsp-figure {
  position: relative;
  width: ${GRID * SCALE}px;
  height: ${GRID * SCALE}px;
  transition: transform 180ms cubic-bezier(.34, 1.56, .64, 1);
  animation: dsp-bob 2.8s ease-in-out infinite;
}
.dsp-root.is-happy .dsp-figure { animation: dsp-hop 620ms ease-in-out; }
.dsp-sprite { display: block; overflow: visible; }
.dsp-tail {
  transform-box: view-box;
  transform-origin: 13px 17px;
  animation: dsp-wag 1.6s ease-in-out infinite;
}
.dsp-root.is-happy .dsp-tail { animation: dsp-wag-fast 260ms ease-in-out infinite; }
.dsp-shadow {
  position: absolute;
  left: 50%;
  bottom: -2px;
  width: ${GRID * SCALE * 0.62}px;
  height: 8px;
  margin-left: -${GRID * SCALE * 0.31}px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--dsh-color-text, #1a1a1a) 18%, transparent);
  filter: blur(1px);
  transition: transform 180ms ease, opacity 180ms ease;
}
.dsp-root.is-happy .dsp-shadow { transform: scale(.82); opacity: .7; }
.dsp-bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%) translateY(4px);
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
  transition: opacity 160ms ease, transform 160ms ease;
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
  bottom: 70%;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  background: #ff6b8b;
  clip-path: polygon(50% 100%, 0 45%, 0 22%, 22% 6%, 50% 22%, 78% 6%, 100% 22%, 100% 45%);
  opacity: 0;
  animation: dsp-float 900ms ease-out forwards;
  pointer-events: none;
}
.dsp-dock {
  position: absolute;
  right: -6px;
  bottom: -6px;
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
  top: calc(100% + 4px);
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
.dsp-hint.is-on { opacity: .9; }
@keyframes dsp-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes dsp-hop {
  0% { transform: translateY(0) scale(1); }
  30% { transform: translateY(-9px) scale(1.04, .96); }
  55% { transform: translateY(0) scale(.96, 1.04); }
  75% { transform: translateY(-3px) scale(1.01, .99); }
  100% { transform: translateY(0) scale(1); }
}
@keyframes dsp-wag {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(7deg); }
}
@keyframes dsp-wag-fast {
  0%, 100% { transform: rotate(-12deg); }
  50% { transform: rotate(14deg); }
}
@keyframes dsp-float {
  0% { opacity: 0; transform: translate(0, 0) scale(.6); }
  25% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--dsp-dx, 0), -28px) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .dsp-figure, .dsp-tail, .dsp-heart { animation: none !important; }
}
`;

    function PixelPet({ species, state }) {
      const palette = PALETTES[species] || PALETTES.cat;
      const sprite = React.useMemo(() => buildSprite(species, state), [species, state]);
      const body = React.useMemo(() => spriteRects(sprite.body, palette), [sprite, palette]);
      const tail = React.useMemo(() => spriteRects(sprite.tail, palette), [sprite, palette]);
      const cell = (rect, key) =>
        h('rect', { key, x: rect.x, y: rect.y, width: 1, height: 1, fill: rect.fill });

      return h(
        'svg',
        {
          className: 'dsp-sprite',
          width: GRID * SCALE,
          height: GRID * SCALE,
          viewBox: `0 0 ${GRID} ${GRID}`,
          shapeRendering: 'crispEdges',
          'aria-hidden': true,
        },
        h('g', { className: 'dsp-tail' }, tail.map((rect, i) => cell(rect, 'tail' + i))),
        h('g', null, body.map((rect, i) => cell(rect, 'body' + i))),
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
          const [pos, setPos] = React.useState(() => {
            const saved = initial.pos;
            if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
              return { left: saved.left, top: saved.top };
            }
            return null;
          });
          const [happy, setHappy] = React.useState(false);
          const [blink, setBlink] = React.useState(false);
          const [bubble, setBubble] = React.useState(null);
          const [hearts, setHearts] = React.useState([]);
          const [hint, setHint] = React.useState(false);
          const [dragging, setDragging] = React.useState(false);
          const rootRef = React.useRef(null);
          const dragRef = React.useRef(null);
          const posRef = React.useRef(null);
          const happyTimer = React.useRef(null);
          const bubbleTimer = React.useRef(null);
          const hintTimer = React.useRef(null);
          const patsRef = React.useRef(Number(initial.pats) || 0);

          const size = GRID * SCALE;

          const clamp = React.useCallback((left, top) => {
            const maxLeft = Math.max(8, window.innerWidth - size - 8);
            const maxTop = Math.max(8, window.innerHeight - size - 8);
            return {
              left: Math.min(Math.max(8, left), maxLeft),
              top: Math.min(Math.max(8, top), maxTop),
            };
          }, [size]);

          // 没存过位置就落在右下角
          const initialPos = React.useMemo(() => {
            if (pos) return clamp(pos.left, pos.top);
            return clamp(window.innerWidth - size - 40, window.innerHeight - size - 120);
          }, []); // eslint-disable-line react-hooks/exhaustive-deps

          React.useEffect(() => {
            const onResize = () => setPos((prev) => (prev ? clamp(prev.left, prev.top) : prev));
            window.addEventListener('resize', onResize);
            return () => window.removeEventListener('resize', onResize);
          }, [clamp]);

          // 眨眼
          React.useEffect(() => {
            let closeTimer = null;
            let openTimer = null;
            let alive = true;
            const schedule = () => {
              closeTimer = window.setTimeout(() => {
                if (!alive) return;
                setBlink(true);
                openTimer = window.setTimeout(() => {
                  if (!alive) return;
                  setBlink(false);
                  schedule();
                }, 130);
              }, 2600 + Math.random() * 3600);
            };
            schedule();
            return () => {
              alive = false;
              window.clearTimeout(closeTimer);
              window.clearTimeout(openTimer);
            };
          }, []);

          React.useEffect(() => () => {
            window.clearTimeout(happyTimer.current);
            window.clearTimeout(bubbleTimer.current);
            window.clearTimeout(hintTimer.current);
          }, []);

          // 第一次出现给一句提示
          React.useEffect(() => {
            if (initial.seenHint) return undefined;
            setHint(true);
            hintTimer.current = window.setTimeout(() => setHint(false), 3600);
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
            setBubble(pool[Math.floor(Math.random() * pool.length)]);
            setHearts((prev) => [
              ...prev.slice(-4),
              { id: Date.now() + Math.random(), dx: Math.round((Math.random() - 0.5) * 26) },
            ]);
            window.clearTimeout(happyTimer.current);
            window.clearTimeout(bubbleTimer.current);
            happyTimer.current = window.setTimeout(() => setHappy(false), HAPPY_MS);
            bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_MS);
            window.setTimeout(() => {
              setHearts((prev) => prev.slice(1));
            }, 950);
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
            setPos((prev) => {
              const base = prev || initialPos;
              const next = clamp(base.left + delta[0], base.top + delta[1]);
              persist({ pos: next });
              return next;
            });
          };

          const figureState = happy ? 'happy' : blink ? 'blink' : 'idle';
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
                h(PixelPet, { species, state: figureState }),
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
