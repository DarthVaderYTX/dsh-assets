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
  const factory = new Function(
    `${body}\nreturn { GRID, PALETTES, buildSprite, spriteRects };`,
  );
  return factory();
}

const { GRID, PALETTES, buildSprite, spriteRects } = loadSprite();
const STATES = ['idle', 'blink', 'happy'];
const SPECIES = ['cat', 'dog'];

function cells(rows) {
  const out = [];
  rows.forEach((row, y) => row.forEach((ch, x) => {
    if (ch !== '.') out.push({ x, y, ch });
  }));
  return out;
}

test('网格尺寸和调色板齐备', () => {
  assert.equal(GRID, 20);
  for (const species of SPECIES) {
    const palette = PALETTES[species];
    for (const ch of ['o', 'f', 'F', 'w', 'p', 'e', 'n', 't']) {
      assert.match(palette[ch], /^#[0-9a-f]{6}$/, `${species} 缺少色板 ${ch}`);
    }
  }
});

test('每个状态都是左右对称的', () => {
  for (const species of SPECIES) {
    for (const state of STATES) {
      const { body } = buildSprite(species, state);
      for (let y = 0; y < GRID; y += 1) {
        for (let x = 0; x < GRID / 2; x += 1) {
          assert.equal(body[y][x], body[y][GRID - 1 - x], `${species}/${state} 第 ${y} 行不对称`);
        }
      }
    }
  }
});

test('描边完整：有颜色的格子旁边不会直接露透明', () => {
  for (const species of SPECIES) {
    for (const state of STATES) {
      const { body } = buildSprite(species, state);
      for (const { x, y, ch } of cells(body)) {
        if (ch === 'o') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          assert.ok(nx >= 0 && ny >= 0 && nx < GRID && ny < GRID, `${species}/${state} 顶到画布边`);
          assert.notEqual(body[ny][nx], '.', `${species}/${state} (${x},${y}) 漏了描边`);
        }
      }
    }
  }
});

test('不透明像素连成一块，没有孤零零的点', () => {
  for (const species of SPECIES) {
    for (const state of STATES) {
      const { body } = buildSprite(species, state);
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
      assert.equal(seen.size, filled.size, `${species}/${state} 有孤立像素`);
    }
  }
});

test('五官位置：眼睛成对在上半部，鼻子在嘴上方', () => {
  for (const species of SPECIES) {
    for (const state of STATES) {
      const { body } = buildSprite(species, state);
      const eyes = cells(body).filter(({ ch }) => ch === 'e');
      assert.equal(eyes.length, state === 'idle' ? 8 : 4, `${species}/${state} 眼睛像素数`);
      const xs = [...new Set(eyes.map(({ x }) => x))].sort((a, b) => a - b);
      assert.equal(xs.length, 4, `${species}/${state} 两只眼睛应该各占两列`);
      assert.ok(eyes.every(({ y }) => y <= 6), `${species}/${state} 眼睛太靠下`);
      // 鼻子是脸上的 p/n；嘴是脸部窗口里被描边色点出来的几格。
      const face = cells(body).filter(({ x, y }) => x >= 7 && x <= 12 && y >= 4 && y <= 13);
      const noseTop = Math.min(...face.filter(({ ch }) => ch === 'p' || ch === 'n').map(({ y }) => y));
      const mouthTop = Math.min(...face.filter(({ ch }) => ch === 'o').map(({ y }) => y));
      assert.ok(Number.isFinite(noseTop), `${species}/${state} 找不到鼻子`);
      assert.ok(mouthTop > noseTop, `${species}/${state} 嘴(${mouthTop})应该在鼻子(${noseTop})下方`);
    }
  }
});

test('两种形象看起来不一样', () => {
  const cat = buildSprite('cat', 'idle').body.join('');
  const dog = buildSprite('dog', 'idle').body.join('');
  assert.notEqual(cat, dog);
});

test('渲染成矩形：每格一个 rect，颜色都来自色板', () => {
  for (const species of SPECIES) {
    const palette = PALETTES[species];
    const { body, tail } = buildSprite(species, 'idle');
    const allowed = new Set(Object.values(palette));
    for (const rect of [...spriteRects(body, palette), ...spriteRects(tail, palette)]) {
      assert.ok(Number.isInteger(rect.x) && rect.x >= 0 && rect.x < GRID);
      assert.ok(Number.isInteger(rect.y) && rect.y >= 0 && rect.y < GRID);
      assert.ok(allowed.has(rect.fill), `${species} 出现了色板外的颜色 ${rect.fill}`);
    }
  }
});

test('尾巴贴着身体的右下角，能看出在摆动', () => {
  for (const species of SPECIES) {
    const { tail } = buildSprite(species, 'idle');
    const px = cells(tail);
    assert.ok(px.length > 8, `${species} 尾巴太小`);
    assert.ok(px.every(({ x }) => x >= 11), `${species} 尾巴跑到左边了`);
    assert.ok(px.some(({ y }) => y >= 15), `${species} 尾巴应该从身体下缘伸出来`);
  }
});
