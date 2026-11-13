// Aether 的图核心：校验、拓扑排序、子图展开。
//
// 这一层是纯函数，宿主运行时和 test/ 都直接调用；客户端只做轻量的本地预检，
// 真正的判定以这里为准。

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PARAM_KEY = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const MAX_PORTS = 16;
const MAX_PORT_LABEL = 40;

/** 所有资源与实验的 id 都是 UUID（v4），保证全局唯一、与名称无关。 */
export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

export const DEFAULT_TIMEOUT_SEC = 300;
export const MAX_TIMEOUT_SEC = 86400;
export const MODULE_KINDS = ['command', 'graph', 'dataset'];
export const DEFAULT_INPUT_PORTS = ['input'];
export const DEFAULT_OUTPUT_PORTS = ['output'];
export const VALUE_TYPES = ['string', 'number', 'boolean', 'json', 'file', 'directory'];
export const PARAM_TYPES = ['string', 'number', 'boolean', 'json'];
export const LAYOUT_DIRECTIONS = ['vertical', 'horizontal'];

const VALUE_TYPE_LABELS = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  json: 'JSON',
  file: '文件',
  directory: '目录',
};

export function portTypesCompatible(fromType, toType) {
  if (fromType === toType) return true;
  return toType === 'string' && ['number', 'boolean', 'json'].includes(fromType);
}

/**
 * 内置执行环境。执行环境是「模块在哪里跑」的声明，由执行器解析：
 * `executor` 指向一个执行后端（当前只有 `local`），后续可以由服务器调度器
 * 增补远程环境，模块只保存 `environmentId`。
 */
export const BUILTIN_ENVIRONMENTS = [
  {
    id: 'local',
    name: '本机',
    description: '在 dsh 宿主进程所在的机器上执行。',
    executor: 'local',
    builtin: true,
  },
];

export function normalizeEnvironment(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    id: String(source.id == null ? '' : source.id).trim(),
    name: String(source.name == null ? '' : source.name).trim() || String(source.id || ''),
    description: String(source.description == null ? '' : source.description).trim(),
    executor: String(source.executor == null ? '' : source.executor).trim() || 'local',
    builtin: Boolean(source.builtin),
  };
}

/** 环境目录：始终保留内置的 local，按 id 去重。 */
export function normalizeEnvironments(raw) {
  const list = (Array.isArray(raw) ? raw : []).map(normalizeEnvironment).filter((item) => item.id);
  if (!list.some((item) => item.id === 'local')) list.unshift(normalizeEnvironment(BUILTIN_ENVIRONMENTS[0]));
  else list.forEach((item) => {
    if (item.id === 'local') item.builtin = true;
  });
  const seen = new Set();
  return list.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function scalar(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizePorts(raw, fallback) {
  if (!Array.isArray(raw)) return fallback.slice();
  const ports = [];
  const seen = new Set();
  for (const item of raw) {
    const label = String(item == null ? '' : item).trim().slice(0, MAX_PORT_LABEL);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    ports.push(label);
    if (ports.length >= MAX_PORTS) break;
  }
  return ports;
}

function normalizeTypeMap(raw, names, allowed, fallback = 'string') {
  const source = isPlainObject(raw) ? raw : {};
  const types = {};
  for (const name of names) {
    types[name] = allowed.includes(source[name]) ? source[name] : fallback;
  }
  return types;
}

function normalizeCommandTemplate(raw) {
  return String(raw == null ? '' : raw).replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g,
    '@@$1@@',
  );
}

function coerceParam(value, type) {
  if (type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    return !['', '0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase());
  }
  return scalar(value);
}

/** 参数既支持 `{ key: value }`，也支持 `[{ key, value }]` 的编辑态。 */
export function normalizeParams(raw) {  const params = {};
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      const key = String(row.key == null ? '' : row.key).trim();
      if (!key) continue;
      params[key] = scalar(row.value);
    }
    return params;
  }
  if (!isPlainObject(raw)) return params;
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    params[key] = scalar(value);
  }
  return params;
}

export function normalizeModule(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const kind = source.kind === 'graph' ? 'graph' : source.kind === 'dataset' ? 'dataset' : 'command';
  const timeout = Number(source.timeoutSec);
  const inputs = kind === 'dataset' ? [] : normalizePorts(source.inputs, DEFAULT_INPUT_PORTS);
  const outputs = normalizePorts(source.outputs, DEFAULT_OUTPUT_PORTS);
  const params = normalizeParams(source.params);
  const inputTypes = normalizeTypeMap(source.inputTypes, inputs, VALUE_TYPES);
  const outputTypes = normalizeTypeMap(source.outputTypes, outputs, VALUE_TYPES);
  const paramTypes = normalizeTypeMap(source.paramTypes, Object.keys(params), PARAM_TYPES);
  for (const name of Object.keys(params)) {
    params[name] = coerceParam(params[name], paramTypes[name]);
  }
  const requiredInputs = Array.isArray(source.requiredInputs)
    ? unique(source.requiredInputs.map((name) => String(name == null ? '' : name).trim())).filter((name) =>
        inputs.includes(name),
      )
    : [];
  return {
    id: String(source.id == null ? '' : source.id).trim(),
    name: String(source.name == null ? '' : source.name).trim(),
    description: String(source.description == null ? '' : source.description).trim(),
    kind,
    command: normalizeCommandTemplate(source.command),
    cwd: String(source.cwd == null ? '' : source.cwd).trim(),
    timeoutSec:
      Number.isFinite(timeout) && timeout > 0
        ? Math.min(MAX_TIMEOUT_SEC, Math.max(1, Math.round(timeout)))
        : DEFAULT_TIMEOUT_SEC,
    params,
    paramTypes,
    inputs,
    inputTypes,
    outputs,
    outputTypes,
    requiredInputs,
    graphId: kind === 'graph' ? String(source.graphId == null ? '' : source.graphId).trim() : '',
    datasetUri: kind === 'dataset' ? String(source.datasetUri == null ? '' : source.datasetUri).trim() : '',
    datasetFormat: kind === 'dataset' ? String(source.datasetFormat == null ? '' : source.datasetFormat).trim() : '',
    assetId: String(source.assetId == null ? '' : source.assetId).trim(),
    assetKind: source.assetKind === 'directory' ? 'directory' : source.assetKind === 'file' ? 'file' : '',
    assetName: String(source.assetName == null ? '' : source.assetName).trim(),
    assetPath: String(source.assetPath == null ? '' : source.assetPath).trim(),
    assetFileCount:
      Number.isFinite(Number(source.assetFileCount)) && Number(source.assetFileCount) >= 0
        ? Math.floor(Number(source.assetFileCount))
        : 0,
    environmentId: String(source.environmentId == null ? '' : source.environmentId).trim() || 'local',
    version:
      Number.isFinite(Number(source.version)) && Number(source.version) > 0
        ? Math.floor(Number(source.version))
        : 1,
    versions: Array.isArray(source.versions)
      ? source.versions.filter((item) => item && typeof item === 'object').slice(-20)
      : [],
    createdAt: Number(source.createdAt) || 0,
    updatedAt: Number(source.updatedAt) || 0,
  };
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeNodeSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(2400, Math.round(number));
}

export function normalizeGraph(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const nodes = (Array.isArray(source.nodes) ? source.nodes : [])
    .filter((node) => node && typeof node === 'object')
    .map((node, index) => ({
      id: String(node.id || `node-${index + 1}`).trim().slice(0, 64),
      moduleId: String(node.moduleId == null ? '' : node.moduleId).trim(),
      label: String(node.label == null ? '' : node.label).trim().slice(0, 120),
      params: normalizeParams(node.params),
      x: normalizeCoordinate(node.x),
      y: normalizeCoordinate(node.y),
      width: normalizeNodeSize(node.width),
      height: normalizeNodeSize(node.height),
    }));
  const edges = (Array.isArray(source.edges) ? source.edges : [])
    .filter((edge) => edge && typeof edge === 'object')
    .map((edge, index) => ({
      id: String(edge.id || `edge-${index + 1}`).trim().slice(0, 96),
      from: String(edge.from == null ? '' : edge.from).trim(),
      to: String(edge.to == null ? '' : edge.to).trim(),
      fromPort: String(edge.fromPort == null ? '' : edge.fromPort).trim().slice(0, MAX_PORT_LABEL),
      toPort: String(edge.toPort == null ? '' : edge.toPort).trim().slice(0, MAX_PORT_LABEL),
    }));
  return {
    id: String(source.id == null ? '' : source.id).trim(),
    name: String(source.name == null ? '' : source.name).trim(),
    description: String(source.description == null ? '' : source.description).trim(),
    nodes,
    edges,
    layout: source.layout === 'horizontal' ? 'horizontal' : 'vertical',
    createdAt: Number(source.createdAt) || 0,
    updatedAt: Number(source.updatedAt) || 0,
  };
}

/** 给旧连线补上默认端口（第一条输出 / 输入），不改动已有端口。 */
export function hydrateGraphPorts(graph, modules = []) {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    const source = nodeById.get(edge.from);
    const target = nodeById.get(edge.to);
    if (!source || !target) continue;
    const sourceModule = moduleById.get(source.moduleId);
    const targetModule = moduleById.get(target.moduleId);
    if (!edge.fromPort && sourceModule?.outputs?.length) edge.fromPort = sourceModule.outputs[0];
    if (!edge.toPort && targetModule?.inputs?.length) edge.toPort = targetModule.inputs[0];
  }
  return graph;
}

function unique(values) {
  return [...new Set(values)];
}

function nodeName(node) {
  return node.label || node.id;
}

/** 找出一个环（返回节点 id 序列），没有环时返回 null。 */
export function findCycle(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const out = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (out.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to) out.get(edge.from).push(edge.to);
  }
  const color = new Map();
  const stack = [];
  const walk = (id) => {
    color.set(id, 1);
    stack.push(id);
    for (const next of out.get(id) || []) {
      const mark = color.get(next) || 0;
      if (mark === 1) {
        const start = stack.indexOf(next);
        return [...stack.slice(start), next];
      }
      if (mark === 0) {
        const cycle = walk(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    color.set(id, 2);
    return null;
  };
  for (const node of nodes) {
    if ((color.get(node.id) || 0) === 0) {
      const cycle = walk(node.id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/** Kahn 拓扑序；有环时返回 null。 */
export function topoOrderOf(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const out = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    out.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of out.get(id) || []) {
      const left = indegree.get(next) - 1;
      indegree.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  return order.length === nodes.length ? order : null;
}

/** 按最长路径分层，用于画布自动布局和提交前预览。 */
export function topoLayers(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.id));
  const deps = new Map(nodes.map((node) => [node.id, []]));
  const out = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    deps.get(edge.to).push(edge.from);
    out.get(edge.from).push(edge.to);
  }
  const order = topoOrderOf(nodes, edges);
  if (!order) return null;
  const depth = new Map();
  for (const id of order) {
    const parents = deps.get(id) || [];
    depth.set(id, parents.length ? Math.max(...parents.map((parent) => (depth.get(parent) || 0) + 1)) : 0);
  }
  const layers = [];
  for (const id of order) {
    const index = depth.get(id) || 0;
    if (!layers[index]) layers[index] = [];
    layers[index].push(id);
  }
  return layers;
}

const TEMPLATE_BUILTINS = new Set([
  'run_id',
  'run_dir',
  'node_id',
  'node_path',
  'node_dir',
  'graph_id',
  'input_file',
]);

function validateCommandTemplate(command, definedNames) {
  const errors = [];
  const text = String(command || '');
  if (!text.includes('@@')) return errors;
  const parts = text.split('@@');
  if (parts.length % 2 === 0) {
    errors.push('命令模板中的 @@ 占位符未闭合');
    return errors;
  }
  const seen = new Set();
  for (let index = 1; index < parts.length; index += 2) {
    const name = parts[index].trim();
    if (!name) {
      errors.push('命令模板存在空的 @@占位符@@');
      continue;
    }
    if (/[\r\n]/.test(name)) {
      errors.push(`命令模板占位符「${name.replace(/[\r\n]+/g, ' ')}」不能跨行`);
      continue;
    }
    if (seen.has(name)) continue;
    seen.add(name);
    if (!definedNames.has(name) && !TEMPLATE_BUILTINS.has(name)) {
      errors.push(`命令模板引用了未定义的名称「${name}」，请先在输入、输出或参数中定义`);
    }
  }
  return errors;
}

export function validateModule(module, modules = [], graphs = [], environments = []) {
  const errors = [];
  if (!module.id) errors.push('模块 id 不能为空');
  else if (!isUuid(module.id)) errors.push('模块 id 必须是 UUID');
  if (!module.name) errors.push('模块需要名称');
  if (!MODULE_KINDS.includes(module.kind)) errors.push('模块类型无效');
  if (modules.some((item) => item.id !== module.id && item.name.toLowerCase() === module.name.toLowerCase())) {
    errors.push(`模块名称「${module.name}」已被使用`);
  }
  const catalog = environments.length ? environments : BUILTIN_ENVIRONMENTS;
  if (!catalog.some((item) => item.id === module.environmentId)) {
    errors.push(`执行环境「${module.environmentId}」不存在`);
  }
  for (const [side, ports] of [
    ['输入', module.inputs],
    ['输出', module.outputs],
  ]) {
    if (!Array.isArray(ports)) {
      errors.push(`模块的${side}端口无效`);
      continue;
    }
    if (ports.length > MAX_PORTS) errors.push(`${side}端口最多 ${MAX_PORTS} 个`);
    const seen = new Set();
    for (const port of ports) {
      if (!port) errors.push(`模块存在空的${side}端口`);
      else if (port.length > MAX_PORT_LABEL) errors.push(`${side}端口名「${port}」过长`);
      else if (seen.has(port)) errors.push(`${side}端口「${port}」重复`);
      seen.add(port);
    }
  }
  for (const [key, value] of Object.entries(module.params || {})) {
    if (!PARAM_KEY.test(key)) errors.push(`参数名「${key}」无效（字母或下划线开头，可含数字、点、横线）`);
    if (value !== null && typeof value === 'object') errors.push(`参数「${key}」的值必须是字符串、数字或布尔值`);
    if (!PARAM_TYPES.includes(module.paramTypes && module.paramTypes[key])) {
      errors.push(`参数「${key}」的类型无效`);
    }
  }
  const ownerByName = new Map();
  for (const [category, names] of [
    ['输入', module.inputs || []],
    ['输出', module.outputs || []],
    ['参数', Object.keys(module.params || {})],
  ]) {
    for (const name of names) {
      if (ownerByName.has(name)) {
        errors.push(`名称「${name}」同时出现在${ownerByName.get(name)}和${category}中，命令模板无法区分`);
      } else {
        ownerByName.set(name, category);
      }
    }
  }
  for (const [side, names, types] of [
    ['输入', module.inputs || [], module.inputTypes || {}],
    ['输出', module.outputs || [], module.outputTypes || {}],
  ]) {
    for (const name of names) {
      if (!VALUE_TYPES.includes(types[name])) errors.push(`${side}端口「${name}」的类型无效`);
    }
  }
  if (module.kind === 'command') {
    errors.push(...validateCommandTemplate(module.command, new Set(ownerByName.keys())));
  }
  for (const port of module.requiredInputs || []) {
    if (!(module.inputs || []).includes(port)) errors.push(`必填输入端口「${port}」不在输入端口列表中`);
  }
  if (module.kind === 'command') {
    if (!(module.timeoutSec >= 1 && module.timeoutSec <= MAX_TIMEOUT_SEC)) {
      errors.push(`超时需在 1–${MAX_TIMEOUT_SEC} 秒之间`);
    }
  } else if (module.kind === 'graph') {
    if (!module.graphId) errors.push('子图模块需要选择一个实验');
    else if (!graphs.some((graph) => graph.id === module.graphId)) errors.push(`实验「${module.graphId}」不存在`);
  } else if (module.kind === 'dataset') {
    if (!module.datasetUri) errors.push('数据集模块需要填写 URI / 路径');
    else if (module.datasetUri.length > 500) errors.push('数据集 URI 过长');
    if ((module.datasetFormat || '').length > 40) errors.push('数据集格式名过长');
    if (module.inputs && module.inputs.length) errors.push('数据集模块不能有输入端口');
    if (!module.outputs || !module.outputs.length) errors.push('数据集模块至少需要一个输出端口');
  }
  return errors;
}

export function validateGraph(graph, modules = [], graphs = []) {
  const errors = [];
  if (graph.id && !isUuid(graph.id)) errors.push('实验 id 必须是 UUID');
  if (!graph.name) errors.push('实验需要名称');
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeIds = new Set();
  for (const node of graph.nodes) {
    if (!node.id) errors.push('节点缺少 id');
    if (nodeIds.has(node.id)) errors.push(`节点 id 重复：${node.id}`);
    nodeIds.add(node.id);
    const module = moduleById.get(node.moduleId);
    if (!module) errors.push(`节点「${nodeName(node)}」引用的模块不存在：${node.moduleId || '（空）'}`);
    else if (module.kind === 'graph' && !graphs.some((item) => item.id === module.graphId)) {
      errors.push(`节点「${nodeName(node)}」的子图模块「${module.name}」指向不存在的实验`);
    }
    for (const key of Object.keys(node.params || {})) {
      if (!PARAM_KEY.test(key)) errors.push(`节点「${nodeName(node)}」的参数名「${key}」无效`);
    }
  }
  const pairs = new Set();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      errors.push('连线指向不存在的节点');
      continue;
    }
    if (edge.from === edge.to) {
      errors.push('节点不能依赖自身');
      continue;
    }
    const sourceNode = nodeById.get(edge.from);
    const targetNode = nodeById.get(edge.to);
    const sourceModule = moduleById.get(sourceNode.moduleId);
    const targetModule = moduleById.get(targetNode.moduleId);
    if (sourceModule) {
      const outputs = sourceModule.outputs || [];
      if (!outputs.length) {
        errors.push(`节点「${nodeName(sourceNode)}」的模块没有输出端口，不能作为连线起点`);
      } else if (edge.fromPort && !outputs.includes(edge.fromPort)) {
        errors.push(`节点「${nodeName(sourceNode)}」没有输出端口「${edge.fromPort}」`);
      }
    }
    if (targetModule) {
      const inputs = targetModule.inputs || [];
      if (!inputs.length) {
        errors.push(`节点「${nodeName(targetNode)}」的模块没有输入端口，不能作为连线终点`);
      } else if (edge.toPort && !inputs.includes(edge.toPort)) {
        errors.push(`节点「${nodeName(targetNode)}」没有输入端口「${edge.toPort}」`);
      }
    }
    if (sourceModule && targetModule) {
      const fromPort = edge.fromPort || (sourceModule.outputs || [])[0] || '';
      const toPort = edge.toPort || (targetModule.inputs || [])[0] || '';
      const fromType = (sourceModule.outputTypes && sourceModule.outputTypes[fromPort]) || 'string';
      const toType = (targetModule.inputTypes && targetModule.inputTypes[toPort]) || 'string';
      if (
        fromPort &&
        toPort &&
        (sourceModule.outputs || []).includes(fromPort) &&
        (targetModule.inputs || []).includes(toPort) &&
        !portTypesCompatible(fromType, toType)
      ) {
        errors.push(
          `端口类型不匹配：${nodeName(sourceNode)}「${fromPort}」是${VALUE_TYPE_LABELS[fromType] || fromType}，` +
            `${nodeName(targetNode)}「${toPort}」需要${VALUE_TYPE_LABELS[toType] || toType}`,
        );
      }
    }
    const pair = `${edge.from}>${edge.to}>${edge.fromPort || ''}>${edge.toPort || ''}`;
    if (pairs.has(pair)) errors.push('存在重复连线');
    pairs.add(pair);
  }
  if (!errors.length) {
    for (const node of graph.nodes) {
      const module = moduleById.get(node.moduleId);
      if (!module || !Array.isArray(module.requiredInputs) || !module.requiredInputs.length) continue;
      const connected = new Set(
        graph.edges.filter((edge) => edge.to === node.id).map((edge) => edge.toPort).filter(Boolean),
      );
      for (const port of module.requiredInputs) {
        if (!connected.has(port)) {
          errors.push(`节点「${nodeName(node)}」的必填输入端口「${port}」尚未连线`);
        }
      }
    }
  }
  if (!errors.length) {
    const cycle = findCycle(graph.nodes, graph.edges);
    if (cycle) errors.push(`图中存在环：${cycle.map((id) => nodeName(graph.nodes.find((n) => n.id === id) || { id })).join(' → ')}`);
  }
  return errors;
}

/**
 * 图之间通过「子图模块」互相引用，也可能成环：A 的节点用模块 M，M 指向 B，
 * B 的节点又指回 A。这里对整张引用图做环检测。
 */
export function graphReferenceErrors(graphList = [], moduleList = []) {
  const graphs = new Map(graphList.map((graph) => [graph.id, graph]));
  const modules = new Map(moduleList.map((module) => [module.id, module]));
  const refs = new Map();
  for (const graph of graphs.values()) {
    const childGraphs = new Set();
    for (const node of graph.nodes) {
      const module = modules.get(node.moduleId);
      if (module && module.kind === 'graph' && module.graphId) childGraphs.add(module.graphId);
    }
    refs.set(graph.id, childGraphs);
  }
  const mark = new Map();
  const errors = [];
  const label = (id) => graphs.get(id)?.name || id;
  const walk = (id, trail) => {
    const state = mark.get(id) || 0;
    if (state === 2) return;
    if (state === 1) {
      const start = trail.indexOf(id);
      const cycle = [...trail.slice(start === -1 ? 0 : start), id];
      errors.push(`子图循环引用：${cycle.map(label).join(' → ')}`);
      return;
    }
    mark.set(id, 1);
    for (const child of refs.get(id) || []) {
      if (graphs.has(child)) walk(child, [...trail, id]);
    }
    mark.set(id, 2);
  };
  for (const id of graphs.keys()) walk(id, []);
  return errors;
}

/**
 * 把图展开成可执行计划：子图模块递归内联，节点的依赖换成上游节点的实际路径。
 * `entries` / `exits` 是本次展开的入口与出口节点路径，父图用它接上下游。
 */
export function expandGraph(graph, moduleList = [], graphList = [], options = {}) {
  const prefix = options.prefix || '';
  const inheritedParams = options.inheritedParams || {};
  const stack = options.stack || [];
  const modules = new Map(moduleList.map((module) => [module.id, module]));
  const graphs = new Map(graphList.map((item) => [item.id, item]));

  if (stack.includes(graph.id)) {
    return {
      nodes: [],
      edges: [],
      entries: [],
      exits: [],
      entryNodes: [],
      exitNodes: [],
      error: `子图循环引用：${[...stack, graph.id].join(' → ')}`,
    };
  }

  const order = topoOrderOf(graph.nodes, graph.edges);
  if (!order) {
    return {
      nodes: [],
      edges: [],
      entries: [],
      exits: [],
      entryNodes: [],
      exitNodes: [],
      error: `实验「${graph.name}」中存在环，无法执行`,
    };
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const deps = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    if (deps.has(edge.to) && nodeById.has(edge.from)) deps.get(edge.to).push(edge.from);
  }

  const plan = new Map();
  const nodes = [];
  const edges = [];
  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    const module = modules.get(node.moduleId);
    const parentDeps = unique(
      (deps.get(nodeId) || []).flatMap((dep) => (plan.get(dep)?.exits || []).map((item) => item.path)),
    );
    const pathId = prefix + node.id;
    if (module && module.kind === 'graph' && graphs.has(module.graphId)) {
      const child = expandGraph(graphs.get(module.graphId), moduleList, graphList, {
        prefix: `${pathId}/`,
        inheritedParams: {
          ...inheritedParams,
          ...(module.params || {}),
          ...(node.params || {}),
        },
        stack: [...stack, graph.id],
      });
      if (child.error) {
        return { nodes: [], edges: [], entries: [], exits: [], entryNodes: [], exitNodes: [], error: child.error };
      }
      for (const entry of child.entryNodes) entry.deps = unique([...parentDeps, ...entry.deps]);
      plan.set(nodeId, { entries: child.entryNodes, exits: child.exitNodes });
      nodes.push(...child.nodes);
      edges.push(...child.edges);
    } else {
      const entry = {
        path: pathId,
        nodeId: node.id,
        moduleId: node.moduleId,
        moduleName: module ? module.name : node.moduleId,
        kind: module ? module.kind : 'missing',
        label: node.label || (module ? module.name : node.id),
        params: { ...inheritedParams, ...(module?.params || {}), ...(node.params || {}) },
        paramTypes: module?.paramTypes || {},
        deps: parentDeps,
        command: module?.command || '',
        cwd: module?.cwd || '',
        timeoutSec: module?.timeoutSec || DEFAULT_TIMEOUT_SEC,
        environmentId: module?.environmentId || 'local',
        inputs: module?.inputs || [],
        inputTypes: module?.inputTypes || {},
        outputs: module?.outputs || [],
        outputTypes: module?.outputTypes || {},
        requiredInputs: module?.requiredInputs || [],
        datasetUri: module?.datasetUri || '',
        datasetFormat: module?.datasetFormat || '',
        width: node.width || 0,
        height: node.height || 0,
        assetPath: module?.assetPath || '',
        assetKind: module?.assetKind || '',
        assetName: module?.assetName || '',
        moduleVersion: module?.version || 1,
      };
      plan.set(nodeId, { entries: [entry], exits: [entry] });
      nodes.push(entry);
    }
  }

  const sources = graph.nodes.filter((node) => (deps.get(node.id) || []).length === 0);
  const targets = new Set(graph.edges.map((edge) => edge.from));
  const sinks = graph.nodes.filter((node) => !targets.has(node.id));
  const entryNodes = unique(sources.flatMap((node) => plan.get(node.id)?.entries || []));
  const exitNodes = unique(sinks.flatMap((node) => plan.get(node.id)?.exits || []));
  for (const edge of graph.edges) {
    const from = plan.get(edge.from);
    const to = plan.get(edge.to);
    if (!from || !to) continue;
    for (const source of from.exits) {
      for (const target of to.entries) {
        edges.push({
          id: `${edge.id}:${source.path}->${target.path}`,
          from: source.path,
          to: target.path,
          fromPort: edge.fromPort,
          toPort: edge.toPort,
        });
      }
    }
  }
  return {
    nodes,
    edges,
    entries: entryNodes.map((item) => item.path),
    exits: exitNodes.map((item) => item.path),
    entryNodes,
    exitNodes,
    error: null,
  };
}
