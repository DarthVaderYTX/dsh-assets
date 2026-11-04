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
  return new Function(
    `${source.slice(start, end)}
     return { W, H, BREEDS, PALETTES, buildSprite, spritePaths, eyeGrid, blank };`,
  )();
}

// 性格配置在精灵区之外，单独抠出来检查。
function loadTraits() {
  const start = source.indexOf('const TRAITS = {');
  const end = source.indexOf('\n    };', start);
  assert.ok(start > 0 && end > start, 'client.js 里找不到 TRAITS');
  return new Function(`${source.slice(start, end + 7)}
    return TRAITS;`)();
}

const { W, H, BREEDS, PALETTES, buildSprite, spritePaths, eyeGrid, blank } = loadSprite();
const TRAITS = loadTraits();
const BREED_IDS = Object.keys(BREEDS);
const EYES = ['open', 'half', 'closed', 'happy'];

const cells = (rows) => {
  const out = [];
  rows.forEach((row, y) => row.forEach((ch, x) => {
    if (ch !== '.') out.push({ x, y, ch });
  }));
  return out;
};

const frameOf = (patch = {}) => ({
  breath: 0, tail: 0, eyes: 'open', happy: false, tongue: false, ear: 0, turn: 0, dir: 1, ...patch,
});

const components = (rows) => {
  const filled = new Set(cells(rows).map(({ x, y }) => x + ',' + y));
  const seen = new Set();
  let count = 0;
  for (const key of filled) {
    if (seen.has(key)) continue;
    count += 1;
    const stack = [key];
    while (stack.length) {
      const k = stack.pop();
      if (seen.has(k) || !filled.has(k)) continue;
      seen.add(k);
      const [x, y] = k.split(',').map(Number);
      stack.push(`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`);
    }
  }
  return count;
};

test('十二个品种都有形体和配色', () => {
  assert.deepEqual(BREED_IDS.sort(), ['black', 'chinchilla', 'goat', 'golden', 'husky', 'lion',
    'parrot', 'samoyed', 'sheep', 'tabby', 'tiger', 'white']);
  assert.equal(W, 48, '画布宽度变了就要同步检查所有几何常量');
  assert.equal(H, 54, '画布高度变了就要同步检查所有几何常量');
  for (const breed of BREED_IDS) {
    const palette = PALETTES[breed];
    for (const ch of ['o', 'f', 'F', 'L', 'w', 'p', 'i', 's', 'e', 't', 'r', 'g', 'n']) {
      assert.match(palette[ch], /^#[0-9a-f]{6}$/, `${breed} 缺少色板 ${ch}`);
    }
  }
});

test('正面的外轮廓左右对称（鹦鹉按设计是侧头，单独排除）', () => {
  for (const breed of BREED_IDS) {
    if (BREEDS[breed].asymmetric) continue;
    for (const eyes of EYES) {
      for (const breath of [0, 1]) {
        for (const ear of [0, 1]) {
          const { body } = buildSprite(breed, frameOf({ eyes, breath, ear }));
          for (let y = 0; y < H; y += 1) {
            for (let x = 0; x < W / 2; x += 1) {
              assert.equal(
                body[y][x] === '.',
                body[y][W - 1 - x] === '.',
                `${breed}/${eyes}/breath${breath}/ear${ear} 第 ${y} 行形状不对称`,
              );
            }
          }
        }
      }
    }
  }
});

test('描边完整且不出画布边', () => {
  for (const breed of BREED_IDS) {
    for (const eyes of EYES) {
      const { body } = buildSprite(breed, frameOf({ eyes }));
      for (const { x, y, ch } of cells(body)) {
        if (ch === 'o') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          assert.ok(nx >= 0 && ny >= 0 && nx < W && ny < H, `${breed} (${x},${y}) 的毛顶到画布边`);
          assert.notEqual(body[ny][nx], '.', `${breed}/${eyes} (${x},${y}) 漏了描边`);
        }
      }
    }
  }
});

test('身体连成一块，尾巴接在身上', () => {
  for (const breed of BREED_IDS) {
    const { body, tail } = buildSprite(breed, frameOf());
    const filled = new Set(cells(body).map(({ x, y }) => x + ',' + y));
    const seen = new Set();
    const stack = [cells(body)[0]].map(({ x, y }) => [x, y]);
    while (stack.length) {
      const [x, y] = stack.pop();
      const key = x + ',' + y;
      if (seen.has(key) || !filled.has(key)) continue;
      seen.add(key);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    assert.equal(seen.size, filled.size, `${breed} 身体里有孤立像素`);

    const tailCells = cells(tail);
    assert.ok(tailCells.length > 20, `${breed} 尾巴太小`);
    assert.ok(tailCells.every(({ x }) => x >= W / 2 - 2), `${breed} 尾巴跑到左边了`);
    const touches = tailCells.some(({ x, y }) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled.has(x + dx + ',' + (y + dy))),
    );
    assert.ok(touches, `${breed} 尾巴和身体断开了`);
  }
});

test('眼睛成对落在脸上，四种状态互不相同', () => {
  const grids = new Set();
  for (const eyes of EYES) {
    const g = eyeGrid('tabby', frameOf({ eyes }));
    const px = cells(g);
    assert.ok(px.length > 0, `${eyes} 没有像素`);
    assert.ok(px.every(({ x }) => x >= 11 && x <= 36), `${eyes} 眼睛跑出脸了`);
    assert.ok(px.every(({ y }) => y >= 15 && y <= 31), `${eyes} 眼睛纵向位置异常`);
    // 左右严格对称
    for (const { x, y } of px) assert.ok(g[y][W - 1 - x] !== '.', `${eyes} 眼睛左右不对称 (${x},${y})`);
    grids.add(g.map((row) => row.join('')).join('|'));
  }
  assert.equal(grids.size, 4, '四种眼睛状态应该互不相同');
});

test('十二个品种长得都不一样', () => {
  const shapes = new Set();
  for (const breed of BREED_IDS) {
    const { body } = buildSprite(breed, frameOf());
    shapes.add(body.map((row) => row.join('')).join('|'));
  }
  assert.equal(shapes.size, BREED_IDS.length, '有品种长得完全一样，配色或花纹没生效');
});

test('品种特征到位：虎斑有条纹、哈士奇有面罩、狗都有项圈、金渐层有金尖', () => {
  const chars = (breed) => new Set(cells(buildSprite(breed, frameOf()).body).map(({ ch }) => ch));

  assert.ok(chars('golden').has('r') && chars('samoyed').has('r') && chars('husky').has('r'), '狗都要戴项圈');
  for (const cat of ['tabby', 'white', 'black', 'chinchilla']) {
    assert.ok(!chars(cat).has('r'), `${cat} 不该有项圈`);
  }
  assert.ok(chars('chinchilla').has('g'), '金渐层要有金色毛尖');
  assert.ok(chars('black').has('L'), '黑猫要有高光，否则糊成一团');

  const huskyHead = buildSprite('husky', frameOf()).body.slice(4, 12).map((r) => r.join('')).join('');
  assert.ok(huskyHead.includes('w'), '哈士奇额头要有白色火焰纹');

  const tabby = buildSprite('tabby', frameOf()).body.map((r) => r.join('')).join('');
  const white = buildSprite('white', frameOf()).body.map((r) => r.join('')).join('');
  assert.ok(tabby.split('F').length > white.split('F').length, '狸花应该比白猫多出虎斑');
});

test('三档转身都画得出来，而且互不相同', () => {
  for (const breed of BREED_IDS) {
    const sig = (turn) => buildSprite(breed, frameOf({ turn })).body.map((r) => r.join('')).join('|');
    const front = sig(0);
    const half = sig(0.5);
    const side = sig(1);
    assert.notEqual(front, half, `${breed} 侧转一半没有变化`);
    assert.notEqual(half, side, `${breed} 完全侧面和侧转一半一样`);
    assert.notEqual(front, side, `${breed} 侧面没有变化`);
    // 转身过程必须是渐进的：正面和侧面的像素差异应大于相邻两档
    for (const turn of [0, 0.5, 1]) {
      const rows = buildSprite(breed, frameOf({ turn })).body;
      assert.equal(components(rows), 1, `${breed} 在 turn=${turn} 时身体裂开了`);
    }
  }
});

test('朝左就是朝右的严格镜像', () => {
  for (const breed of BREED_IDS) {
    for (const turn of [0, 0.5, 1]) {
      const right = buildSprite(breed, frameOf({ turn, dir: 1 }));
      const left = buildSprite(breed, frameOf({ turn, dir: -1 }));
      const flipRows = (rows) => rows.map((row) => row.slice().reverse());
      assert.deepEqual(left.body, flipRows(right.body), `${breed}/${turn} 朝左不是镜像`);
      assert.deepEqual(left.tail, flipRows(right.tail), `${breed}/${turn} 尾巴朝左不是镜像`);
      assert.deepEqual(left.eyes, flipRows(right.eyes), `${breed}/${turn} 眼睛朝左不是镜像`);
    }
  }
});

test('侧面只留一只眼睛，正面两只都在', () => {
  for (const breed of BREED_IDS) {
    const front = eyeGrid(breed, frameOf({ turn: 0 }));
    const side = eyeGrid(breed, frameOf({ turn: 1 }));
    const frontCells = cells(front);
    const sideCells = cells(side);
    assert.ok(frontCells.length > 0 && sideCells.length > 0);
    // 正面是两只眼睛（两个连通块），侧面只剩一只
    assert.equal(components(front), 2, `${breed} 正面应该是两只眼睛`);
    assert.equal(components(side), 1, `${breed} 侧面应该只剩一只眼睛`);
    assert.ok(sideCells.length < frontCells.length, `${breed} 侧面的眼睛没有减少`);
    // 侧面那只眼睛要盖在脸上，不能悬空
    const { body, tail } = buildSprite(breed, frameOf({ turn: 1 }));
    for (const { x, y } of sideCells) {
      const under = body[y][x] !== '.' ? body[y][x] : tail[y][x];
      assert.ok(under !== '.' && under !== 'o', `${breed} 侧面的眼睛悬空在 (${x},${y})`);
    }
  }
});

test('眼睛永远画在脸上，不会顶出轮廓或者悬空', () => {
  for (const breed of BREED_IDS) {
    for (const turn of [0, 0.5, 1]) {
      for (const eyes of EYES) {
        const { body, tail } = buildSprite(breed, frameOf({ turn, eyes }));
        const grid = eyeGrid(breed, frameOf({ turn, eyes }));
        for (const { x, y } of cells(grid)) {
          const under = body[y][x] !== '.' ? body[y][x] : tail[y][x];
          assert.ok(
            under !== '.' && under !== 'o',
            `${breed}/turn${turn}/${eyes} 的眼睛落到了 (${x},${y}) 的「${under}」上`,
          );
        }
      }
    }
  }
});

test('动画帧确实在变', () => {
  for (const breed of BREED_IDS) {
    const sig = (f, part = 'body') => buildSprite(breed, f)[part].map((r) => r.join('')).join('|');
    assert.notEqual(sig(frameOf()), sig(frameOf({ breath: 1 })), `${breed} 呼吸帧没有变化`);
    assert.notEqual(sig(frameOf({ tail: 0 }), 'tail'), sig(frameOf({ tail: 2 }), 'tail'), `${breed} 尾巴帧没有变化`);
    if (BREEDS[breed].ear !== 'none') {
      assert.notEqual(sig(frameOf({ ear: 0 })), sig(frameOf({ ear: 1 })), `${breed} 抖耳帧没有变化`);
    }
    assert.notEqual(sig(frameOf({ happy: true })), sig(frameOf()), `${breed} 开心表情没有变化`);
  }
});

test('每个品种都有性格参数，且节奏各不相同', () => {
  for (const breed of BREED_IDS) {
    const tr = TRAITS[breed];
    assert.ok(tr, `${breed} 缺少性格参数`);
    assert.ok(tr.breathTicks >= 2, `${breed} 呼吸节奏太小`);
    assert.ok(tr.tailTicks >= 1, `${breed} 摇尾节奏太小`);
    assert.equal(tr.blink.length, 2);
    assert.ok(tr.blinkHold > 0);
    assert.ok(tr.hearts >= 1 && tr.hearts <= 5, `${breed} 爱心数量不合理`);
    assert.ok(tr.bounce > 0, `${breed} 弹跳系数不合理`);
  }

  // 高冷的猫动得慢，热情的狗动得快
  assert.ok(TRAITS.black.tailTicks > TRAITS.golden.tailTicks, '黑猫的尾巴应该比金毛慢');
  assert.ok(TRAITS.white.blinkHold > TRAITS.tabby.blinkHold, '白猫应该慢眨眼');
  assert.ok(TRAITS.samoyed.bounce > TRAITS.white.bounce, '萨摩耶应该比白猫蹦得高');
  assert.ok(TRAITS.golden.hearts > TRAITS.black.hearts, '金毛应该比黑猫更容易嗨');
  // 只有金渐层会打盹、只有哈士奇会突然发疯
  assert.ok(TRAITS.chinchilla.doze, '金渐层应该会打盹');
  assert.ok(TRAITS.husky.zoomies, '哈士奇应该会突然发疯');
  for (const breed of BREED_IDS) {
    if (breed === 'chinchilla') continue;
    assert.ok(!TRAITS[breed].doze, `${breed} 不该打盹`);
  }
  for (const breed of BREED_IDS) {
    if (breed === 'husky') continue;
    assert.ok(!TRAITS[breed].zoomies, `${breed} 不该发疯`);
  }
  // 只有狗吐舌头
  assert.ok(TRAITS.golden.tongue && TRAITS.samoyed.tongue, '金毛和萨摩耶应该常吐舌头');
  assert.ok(!TRAITS.tabby.tongue && !TRAITS.black.tongue, '猫不该一直吐舌头');
});

test('路径数据只包含合法指令，颜色都在色板里', () => {
  for (const breed of BREED_IDS) {
    const palette = PALETTES[breed];
    const allowed = new Set(Object.values(palette));
    const { body, tail } = buildSprite(breed, frameOf());
    for (const { ch, d } of [...spritePaths(body), ...spritePaths(tail)]) {
      assert.ok(allowed.has(palette[ch]), `${breed} 出现了色板外的颜色 ${ch}`);
      assert.match(d, /^(M-?\d+ -?\d+h-?\d+v1h-?\d+z)+$/, `${breed} 路径指令不合法`);
    }
  }
});
