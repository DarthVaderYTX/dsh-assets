import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(new URL(import.meta.url).pathname);
const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

// client.js 是浏览器脚本，但精灵那一段是纯函数，抽出来就能在 Node 里跑。
function loadSprite() {
  const start = source.indexOf('// #region sprite');
  const end = source.indexOf('// #endregion sprite');
  assert.ok(start > 0 && end > start, 'client.js 里找不到精灵代码区');
  const body = source.slice(start, end);
  return new Function(
    `${body}\nreturn { W, H, PALETTES, buildSprite, spritePaths, spriteSpans, eyeTemplate, eyeAnchors, blank, put };`,
  )();
}

const { W, H, PALETTES, buildSprite, spritePaths, eyeTemplate, eyeAnchors, blank, put } = loadSprite();
const SPECIES = ['cat', 'dog'];
const EYES = ['open', 'half', 'closed', 'happy'];

const cells = (rows) => {
  const out = [];
  rows.forEach((row, y) => row.forEach((ch, x) => {
    if (ch !== '.') out.push({ x, y, ch });
  }));
  return out;
};

const frameOf = (patch = {}) => ({ breath: 0, tail: 0, eyes: 'open', happy: false, ...patch });

test('画布与色板', () => {
  assert.equal(W, 32);
  assert.equal(H, 36);
  for (const species of SPECIES) {
    const palette = PALETTES[species];
    for (const ch of ['o', 'f', 'F', 'L', 'w', 'p', 'e', 's', 'i', 't', 'r']) {
      assert.match(palette[ch], /^#[0-9a-f]{6}$/, `${species} 缺少色板 ${ch}`);
    }
  }
});

test('外轮廓左右对称（颜色可以不对称，形状必须对称）', () => {
  for (const species of SPECIES) {
    for (const eyes of EYES) {
      for (const breath of [0, 1]) {
        // 尾巴是单独一层、只挂在右边，所以只检查本体。
        const { body } = buildSprite(species, frameOf({ eyes, breath }));
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W / 2; x += 1) {
            const left = body[y][x] === '.';
            const right = body[y][W - 1 - x] === '.';
            assert.equal(left, right, `${species}/${eyes}/breath${breath} 第 ${y} 行形状不对称`);
          }
        }
      }
    }
  }
});

test('描边完整：有色格子旁边不会直接露透明', () => {
  for (const species of SPECIES) {
    for (const eyes of EYES) {
      const { body } = buildSprite(species, frameOf({ eyes }));
      for (const { x, y, ch } of cells(body)) {
        if (ch === 'o') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          assert.ok(nx >= 0 && ny >= 0 && nx < W && ny < H, `${species} (${x},${y}) 的毛顶到画布边，描边画不出来`);
          assert.notEqual(body[ny][nx], '.', `${species}/${eyes} (${x},${y}) 漏了描边`);
        }
      }
    }
  }
});

test('身体像素连成一块', () => {
  for (const species of SPECIES) {
    for (const eyes of EYES) {
      const { body } = buildSprite(species, frameOf({ eyes }));
      const filled = new Set(cells(body).map(({ x, y }) => x + ',' + y));
      const seen = new Set();
      const stack = [[...filled][0].split(',').map(Number)];
      while (stack.length) {
        const [x, y] = stack.pop();
        const key = x + ',' + y;
        if (seen.has(key) || !filled.has(key)) continue;
        seen.add(key);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      assert.equal(seen.size, filled.size, `${species}/${eyes} 身体里有孤立像素`);
    }
  }
});

test('尾巴接在身体右边，且和身体相连', () => {
  for (const species of SPECIES) {
    const { body, tail } = buildSprite(species, frameOf());
    const tailCells = cells(tail);
    assert.ok(tailCells.length > 20, `${species} 尾巴太小`);
    assert.ok(tailCells.every(({ x }) => x >= W / 2 - 2), `${species} 尾巴跑到左边了`);
    const bodySet = new Set(cells(body).map(({ x, y }) => x + ',' + y));
    const touches = tailCells.some(({ x, y }) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => bodySet.has(x + dx + ',' + (y + dy))),
    );
    assert.ok(touches, `${species} 尾巴和身体断开了`);
  }
});

test('眼睛成对、落在脸上、四种状态各不相同', () => {
  const grids = new Map();
  for (const eyes of EYES) {
    const g = blank();
    for (const { x, y } of eyeAnchors(frameOf({ eyes }))) {
      for (const [dx, dy, ch] of eyeTemplate(eyes)) put(g, x + dx, y + dy, ch);
    }
    const px = cells(g);
    assert.ok(px.length > 0, `${eyes} 没有像素`);
    assert.ok(px.every(({ x }) => x >= 8 && x <= 23), `${eyes} 眼睛跑出脸了`);
    assert.ok(px.every(({ y }) => y >= 9 && y <= 16), `${eyes} 眼睛纵向位置异常`);
    grids.set(eyes, g.map((row) => row.join('')).join('|'));
  }
  assert.equal(new Set(grids.values()).size, 4, '四种眼睛状态应该互不相同');
});

test('动画帧确实在变：呼吸、尾巴、眨眼各自产生不同画面', () => {
  for (const species of SPECIES) {
    const base = buildSprite(species, frameOf()).body.map((r) => r.join('')).join('|');
    const breath = buildSprite(species, frameOf({ breath: 1 })).body.map((r) => r.join('')).join('|');
    assert.notEqual(base, breath, `${species} 呼吸帧没有变化`);

    const t0 = buildSprite(species, frameOf({ tail: 0 })).tail.map((r) => r.join('')).join('|');
    const t2 = buildSprite(species, frameOf({ tail: 2 })).tail.map((r) => r.join('')).join('|');
    assert.notEqual(t0, t2, `${species} 尾巴摆动帧没有变化`);

    const idle = buildSprite(species, frameOf()).body.map((r) => r.join('')).join('|');
    const happy = buildSprite(species, frameOf({ happy: true })).body.map((r) => r.join('')).join('|');
    assert.notEqual(idle, happy, `${species} 开心表情没有变化`);
  }
});

test('两种形象明显不同', () => {
  const cat = buildSprite('cat', frameOf()).body.map((r) => r.join('')).join('|');
  const dog = buildSprite('dog', frameOf()).body.map((r) => r.join('')).join('|');
  assert.notEqual(cat, dog);
  // 狗有项圈，猫没有
  assert.ok(cells(buildSprite('dog', frameOf()).body).some(({ ch }) => ch === 'r'), '狗应该有项圈');
  assert.ok(!cells(buildSprite('cat', frameOf()).body).some(({ ch }) => ch === 'r'), '猫不该有项圈');
});

test('路径数据只包含合法指令，颜色都在色板里', () => {
  for (const species of SPECIES) {
    const palette = PALETTES[species];
    const allowed = new Set(Object.values(palette));
    const { body, tail } = buildSprite(species, frameOf());
    for (const { ch, d } of [...spritePaths(body), ...spritePaths(tail)]) {
      assert.ok(allowed.has(palette[ch]), `${species} 出现了色板外的颜色 ${ch}`);
      assert.match(d, /^(M-?\d+ -?\d+h-?\d+v1h-?\d+z)+$/, `${species} 路径指令不合法: ${d.slice(0, 40)}`);
    }
  }
});
