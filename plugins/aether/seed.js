// 首次启动时写入的示例模块与实验，保持为纯函数，便于重置/测试。
import { DATA_VERSION } from './constants.js';
import { normalizeEnvironments, normalizeGraph, normalizeModule } from './dag.js';

export function seedState() {
  const now = Date.now();
  const modules = [
    normalizeModule({
      id: 'prepare',
      name: '准备数据',
      description: '输出一份示例数据集信息。',
      kind: 'command',
      command: 'node -e "console.log(JSON.stringify({dataset:\'demo\', rows: 128}))"',
      timeoutSec: 60,
      inputs: [],
      outputs: ['dataset'],
    }),
    normalizeModule({
      id: 'train',
      name: '训练模型',
      description: '按学习率训练一段时间，输出准确率。',
      kind: 'command',
      command:
        'node -e "const lr={{lr}}; const ms={{seconds}}*1000; console.log(\'training lr=\' + lr + \' for \' + ms + \'ms\'); setTimeout(() => console.log(JSON.stringify({lr, accuracy: Number((0.9 + Math.random()*0.08).toFixed(4))})), ms)"',
      timeoutSec: 120,
      params: { lr: 0.01, seconds: 2 },
      inputs: ['dataset'],
      outputs: ['model'],
    }),
    normalizeModule({
      id: 'evaluate',
      name: '评估结果',
      description: '读取上游节点，汇总评估信息。',
      kind: 'command',
      command:
        'node -e "const fs=require(\'fs\'); const j=JSON.parse(fs.readFileSync(process.env.AETHER_INPUT_FILE,\'utf8\')); const names=Object.keys(j.inputs); console.log(\'evaluated upstream: \' + names.join(\', \'))"',
      timeoutSec: 60,
      inputs: ['model'],
      outputs: ['metrics'],
    }),
    normalizeModule({
      id: 'report',
      name: '生成报告',
      description: '在实验目录写一份 Markdown 报告。',
      kind: 'command',
      command:
        'node -e "const fs=require(\'fs\'); const path=require(\'path\'); const file=path.join(process.env.AETHER_NODE_DIR,\'report.md\'); fs.writeFileSync(file, \'# Aether demo report\\n\'); console.log(\'report -> \' + file)"',
      timeoutSec: 60,
      inputs: ['metrics'],
      outputs: [],
    }),
    normalizeModule({
      id: 'demo-dataset',
      name: '示例数据集',
      description: '一个数据集节点：执行时把 URI 与格式写给下游，不启动命令。',
      kind: 'dataset',
      datasetUri: 'datasets/demo.jsonl',
      datasetFormat: 'jsonl',
      inputs: [],
      outputs: ['rows'],
    }),
    normalizeModule({
      id: 'demo-pipeline',
      name: '演示流水线（子图）',
      description: '把“准备 → 训练 → 评估”打包成一个可复用的子图模块。',
      kind: 'graph',
      graphId: 'demo-pipeline',
      inputs: ['dataset'],
      outputs: ['metrics'],
    }),
  ];
  const graphs = [
    normalizeGraph({
      id: 'demo-pipeline',
      name: '演示流水线',
      description: '准备数据、训练模型、评估结果三个节点串行执行。',
      nodes: [
        { id: 'prepare', moduleId: 'prepare', label: '准备数据', x: 40, y: 80 },
        { id: 'train', moduleId: 'train', label: '训练', params: { lr: 0.02 }, x: 330, y: 80 },
        { id: 'evaluate', moduleId: 'evaluate', label: '评估', x: 620, y: 80 },
      ],
      edges: [
        { id: 'e1', from: 'prepare', to: 'train', fromPort: 'dataset', toPort: 'dataset' },
        { id: 'e2', from: 'train', to: 'evaluate', fromPort: 'model', toPort: 'model' },
      ],
    }),
    normalizeGraph({
      id: 'nightly-experiment',
      name: '夜间实验',
      description: '把一个子图模块和一个报告节点拼成实验图。',
      nodes: [
        { id: 'pipeline', moduleId: 'demo-pipeline', label: '流水线', x: 40, y: 80 },
        { id: 'report', moduleId: 'report', label: '生成报告', x: 330, y: 80 },
      ],
      edges: [{ id: 'e1', from: 'pipeline', to: 'report', fromPort: 'metrics', toPort: 'metrics' }],
    }),
  ];
  return {
    version: DATA_VERSION,
    modules: modules.map((module) => ({ ...module, createdAt: now, updatedAt: now })),
    graphs: graphs.map((graph) => ({ ...graph, createdAt: now, updatedAt: now })),
    environments: normalizeEnvironments([]),
    createdAt: now,
    updatedAt: now,
    seeded: true,
  };
}
