import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expandGraph,
  findCycle,
  graphReferenceErrors,
  hydrateGraphPorts,
  normalizeEnvironment,
  normalizeEnvironments,
  normalizeGraph,
  normalizeModule,
  slugify,
  topoLayers,
  topoOrderOf,
  validateGraph,
  validateModule,
} from '../dag.js';

const command = (id, extra = {}) =>
  normalizeModule({ id, name: id.toUpperCase(), kind: 'command', command: 'echo hi', ...extra });

const node = (id, moduleId, extra = {}) => ({ id, moduleId, label: '', params: {}, ...extra });
const edge = (from, to) => ({ id: `${from}->${to}`, from, to });

test('slugify produces stable ids', () => {
  assert.equal(slugify('Nightly Training Run'), 'nightly-training-run');
  assert.equal(slugify('  中文  '), 'item');
  assert.equal(slugify('a_b.c'), 'a-b-c');
});

test('topoOrderOf and topoLayers follow the DAG', () => {
  const nodes = [node('a', 'm'), node('b', 'm'), node('c', 'm'), node('d', 'm')];
  const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];
  const order = topoOrderOf(nodes, edges);
  assert.deepEqual(order, ['a', 'b', 'c', 'd']);
  assert.deepEqual(topoLayers(nodes, edges), [['a'], ['b', 'c'], ['d']]);
  assert.equal(findCycle(nodes, edges), null);
});

test('cycles are detected with their node path', () => {
  const nodes = [node('a', 'm'), node('b', 'm'), node('c', 'm')];
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
  assert.equal(topoOrderOf(nodes, edges), null);
  assert.deepEqual(findCycle(nodes, edges), ['a', 'b', 'c', 'a']);
});

test('validateGraph reports missing modules, self edges and cycles', () => {
  const modules = [command('m')];
  const graph = normalizeGraph({
    name: 'Broken',
    nodes: [node('a', 'missing'), node('b', 'm')],
    edges: [edge('b', 'b')],
  });
  const errors = validateGraph(graph, modules, []).join('\n');
  assert.match(errors, /模块不存在/);
  assert.match(errors, /依赖自身/);

  const loop = normalizeGraph({
    name: 'Loop',
    nodes: [node('a', 'm'), node('b', 'm')],
    edges: [edge('a', 'b'), edge('b', 'a')],
  });
  assert.match(validateGraph(loop, modules, []).join('\n'), /存在环/);
});

test('modules expose input/output ports and normalize duplicates', () => {
  const legacy = normalizeModule({ id: 'legacy', name: 'Legacy', kind: 'command', command: 'echo' });
  assert.deepEqual(legacy.inputs, ['input']);
  assert.deepEqual(legacy.outputs, ['output']);

  const explicit = normalizeModule({
    id: 'explicit',
    name: 'Explicit',
    kind: 'command',
    command: 'echo',
    inputs: [],
    outputs: ['a', 'a', ' b ', ''],
  });
  assert.deepEqual(explicit.inputs, []);
  assert.deepEqual(explicit.outputs, ['a', 'b']);
});

test('hydrateGraphPorts fills legacy edges from module ports', () => {
  const modules = [
    normalizeModule({ id: 'src', name: 'Src', kind: 'command', command: 'echo', inputs: [], outputs: ['out'] }),
    normalizeModule({ id: 'dst', name: 'Dst', kind: 'command', command: 'echo', inputs: ['in'], outputs: [] }),
  ];
  const graph = normalizeGraph({
    name: 'Ports',
    nodes: [node('s', 'src'), node('d', 'dst')],
    edges: [edge('s', 'd')],
  });
  hydrateGraphPorts(graph, modules);
  assert.equal(graph.edges[0].fromPort, 'out');
  assert.equal(graph.edges[0].toPort, 'in');
  assert.deepEqual(validateGraph(graph, modules, []), []);
});

test('graph validation rejects unknown or missing ports', () => {
  const modules = [
    normalizeModule({ id: 'src', name: 'Src', kind: 'command', command: 'echo', inputs: [], outputs: ['out'] }),
    normalizeModule({ id: 'dst', name: 'Dst', kind: 'command', command: 'echo', inputs: ['in'], outputs: [] }),
  ];
  const badPort = normalizeGraph({
    name: 'Bad port',
    nodes: [node('s', 'src'), node('d', 'dst')],
    edges: [{ id: 'e1', from: 's', to: 'd', fromPort: 'out', toPort: 'nope' }],
  });
  assert.match(validateGraph(badPort, modules, []).join('\n'), /没有输入端口「nope」/);

  const noInput = normalizeGraph({
    name: 'No input',
    nodes: [node('a', 'src'), node('b', 'src')],
    edges: [{ id: 'e1', from: 'a', to: 'b', fromPort: 'out', toPort: 'out' }],
  });
  assert.match(validateGraph(noInput, modules, []).join('\n'), /没有输入端口/);
});

test('dataset modules require a URI and graphs default to vertical layout', () => {
  const empty = normalizeModule({ id: 'ds', name: 'Dataset', kind: 'dataset' });
  assert.match(validateModule(empty, [], []).join('\n'), /URI/);
  assert.deepEqual(
    validateModule(normalizeModule({ id: 'ds', name: 'Dataset', kind: 'dataset', datasetUri: 'data/x.jsonl' }), [], []),
    [],
  );

  const noInputs = normalizeModule({
    id: 'ds2',
    name: 'Dataset 2',
    kind: 'dataset',
    datasetUri: 'data/x.jsonl',
    inputs: ['unexpected'],
    outputs: [],
  });
  assert.deepEqual(noInputs.inputs, []);
  assert.match(validateModule(noInputs, [], []).join('\n'), /至少需要一个输出端口/);

  assert.equal(normalizeGraph({ name: 'G' }).layout, 'vertical');
  assert.equal(normalizeGraph({ name: 'G', layout: 'horizontal' }).layout, 'horizontal');
});

test('nodes keep canvas coordinates through normalization', () => {
  const graph = normalizeGraph({
    name: 'Positioned',
    nodes: [
      { id: 'a', moduleId: 'm', x: 12.5, y: 30 },
      { id: 'b', moduleId: 'm', x: 'bad', y: null },
    ],
    edges: [],
  });
  assert.equal(graph.nodes[0].x, 12.5);
  assert.equal(graph.nodes[0].y, 30);
  assert.equal(graph.nodes[1].x, null);
  assert.equal(graph.nodes[1].y, null);
});

test('validateModule validates subgraph requirements and allows an empty command', () => {
  const graphs = [{ id: 'g1', name: 'G1', nodes: [], edges: [] }];
  const empty = normalizeModule({ id: 'x', name: 'X', kind: 'command', command: '' });
  assert.deepEqual(validateModule(empty, [], graphs), []);

  const sub = normalizeModule({ id: 'sub', name: 'Sub', kind: 'graph', graphId: 'nope' });
  assert.match(validateModule(sub, [], graphs).join('\n'), /不存在/);
  assert.deepEqual(validateModule(normalizeModule({ ...sub, graphId: 'g1' }), [], graphs), []);
});

test('modules default to the local environment and reject unknown ones', () => {
  const module = normalizeModule({ id: 'm', name: 'M', kind: 'command', command: 'echo' });
  assert.equal(module.environmentId, 'local');
  assert.deepEqual(validateModule(module, [], [], []), []);

  const environments = normalizeEnvironments([
    { id: 'gpu', name: 'GPU', executor: 'remote' },
    normalizeEnvironment({ id: 'local', name: '本机', executor: 'local', builtin: true }),
  ]);
  const onGpu = { ...module, environmentId: 'gpu' };
  assert.deepEqual(validateModule(onGpu, [], [], environments), []);

  const unknown = { ...module, environmentId: 'nope' };
  assert.match(validateModule(unknown, [], [], environments).join('\n'), /执行环境「nope」不存在/);
});

test('expandGraph inlines subgraphs and rewires dependencies', () => {
  const modules = [
    command('a'),
    command('b'),
    normalizeModule({ id: 'sub', name: 'Sub', kind: 'graph', graphId: 'g2', params: { y: 2 } }),
  ];
  const graphs = [
    normalizeGraph({
      id: 'g2',
      name: 'Inner',
      nodes: [node('s1', 'a', { params: { z: 3 } }), node('s2', 'b')],
      edges: [edge('s1', 's2')],
    }),
    normalizeGraph({
      id: 'g1',
      name: 'Outer',
      nodes: [node('n1', 'a'), node('n2', 'sub', { params: { x: 1 } }), node('n3', 'b')],
      edges: [edge('n1', 'n2'), edge('n2', 'n3')],
    }),
  ];
  const plan = expandGraph(graphs[1], modules, graphs);
  assert.equal(plan.error, null);
  assert.deepEqual(
    plan.nodes.map((item) => item.path),
    ['n1', 'n2/s1', 'n2/s2', 'n3'],
  );
  const byPath = new Map(plan.nodes.map((item) => [item.path, item]));
  assert.deepEqual(byPath.get('n2/s1').deps, ['n1']);
  assert.deepEqual(byPath.get('n2/s2').deps, ['n2/s1']);
  assert.deepEqual(byPath.get('n3').deps, ['n2/s2']);
  assert.deepEqual(byPath.get('n2/s1').params, { y: 2, x: 1, z: 3 });
  assert.deepEqual(plan.entries, ['n1']);
  assert.deepEqual(plan.exits, ['n3']);
});

test('expandGraph supports nested subgraphs', () => {
  const modules = [
    command('a'),
    normalizeModule({ id: 'sub-inner', name: 'Inner sub', kind: 'graph', graphId: 'g3' }),
    normalizeModule({ id: 'sub-outer', name: 'Outer sub', kind: 'graph', graphId: 'g2' }),
  ];
  const graphs = [
    normalizeGraph({ id: 'g3', name: 'Leaf', nodes: [node('leaf', 'a')], edges: [] }),
    normalizeGraph({ id: 'g2', name: 'Middle', nodes: [node('inner', 'sub-inner')], edges: [] }),
    normalizeGraph({ id: 'g1', name: 'Top', nodes: [node('outer', 'sub-outer')], edges: [] }),
  ];
  const plan = expandGraph(graphs[2], modules, graphs);
  assert.equal(plan.error, null);
  assert.deepEqual(plan.nodes.map((item) => item.path), ['outer/inner/leaf']);
});

test('expandGraph preserves parallel port edges', () => {
  const modules = [
    normalizeModule({
      id: 'a', name: 'A', kind: 'command', command: 'echo', inputs: [], outputs: ['x', 'y'],
    }),
    normalizeModule({
      id: 'b', name: 'B', kind: 'command', command: 'echo', inputs: ['i', 'j'], outputs: [],
    }),
  ];
  const graph = normalizeGraph({
    id: 'g',
    name: 'Parallel ports',
    nodes: [node('a', 'a'), node('b', 'b')],
    edges: [
      { id: 'e1', from: 'a', to: 'b', fromPort: 'x', toPort: 'i' },
      { id: 'e2', from: 'a', to: 'b', fromPort: 'y', toPort: 'j' },
    ],
  });
  const plan = expandGraph(graph, modules, [graph]);
  assert.equal(plan.error, null);
  assert.deepEqual(
    plan.edges.map((edge) => [edge.fromPort, edge.toPort]),
    [['x', 'i'], ['y', 'j']],
  );
});

test('subgraph reference cycles are rejected', () => {
  const modules = [
    command('a'),
    normalizeModule({ id: 'to-g1', name: 'To G1', kind: 'graph', graphId: 'g1' }),
  ];
  const graphs = [
    normalizeGraph({ id: 'g1', name: 'G1', nodes: [node('n', 'to-g1')], edges: [] }),
  ];
  const errors = graphReferenceErrors(graphs, modules).join('\n');
  assert.match(errors, /子图循环引用/);
  assert.match(expandGraph(graphs[0], modules, graphs).error || '', /子图循环引用/);
});
