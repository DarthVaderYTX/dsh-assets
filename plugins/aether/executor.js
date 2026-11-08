// Aether 的执行后端边界。
//
// 一个 Executor 负责把一次「已提交的运行」推进到终态：它接收 run（含逐节点快照）
// 与展开后的 plan，更新 run.nodes 里的状态并调用 persist 让面板看到进度。
// 当前只有本机执行器；未来的远程执行器可以在这里实现同一组方法，把 { run, plan }
// 提交给服务器端调度器，再把节点状态与日志回写到同一形状的记录里。
//
// 契约（http 侧和存储侧不感知实现）：
//   describe() -> { id, label, kind, available, supports: { cancel, logs, streaming } }
//   start(run, plan) -> { id, run, done: Promise, cancel(): void }
//   cancel(handle) -> Promise<{ ok, id, cancelling }>
//   readLog(run, nodePath, stream) -> Promise<string>   // stream: 'out' | 'err'
//   dispose() -> void
//
// 服务端提交的扩展方向：
//   1. 提交：把 { run, plan }（其中每个节点带 environmentId / 模块命令快照）POST 给
//      调度器，调度器按执行环境选择执行位置，返回 placement 与远端 run id。
//   2. 对账：调度器回报节点 running/succeeded/failed、退出码、日志位置；本机只保存
//      外部 run id 与镜像状态，不要求节点在本机执行。
//   3. 取消：转发到远端 run id；日志通过 readLog 从远端拉取或跳到外部地址。
//   4. 跨执行器的图需要在执行器之间传递上游 stdout；当前 local 实现用共享的
//      run.dir/outputs 目录，远程实现需要对象存储或服务器中转。
import { promises as fsp, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const NODE_TAIL_LIMIT = 20000;
const LOG_TAIL_LIMIT = 400000;

/** 节点路径里的 `/` 会换成 `__`，避免在磁盘上建嵌套目录。 */
export function safeSegment(value) {
  return (
    String(value || 'node')
      .replace(/[\\/]+/g, '__')
      .replace(/[^A-Za-z0-9_.-]+/g, '_')
      .slice(0, 120) || 'node'
  );
}

/**
 * 把计划节点声明的执行环境解析成执行器。调度器接入后，这里会换成
 * 「服务器返回 placement」；本机版只检查环境存在、执行器可用。
 */
export function resolvePlacements(nodes, environments = [], availableExecutors = []) {
  const placements = {};
  const errors = [];
  const executors = new Set();
  for (const node of nodes) {
    const environmentId = node.environmentId || 'local';
    const environment = environments.find((item) => item.id === environmentId);
    if (!environment) {
      errors.push(`节点「${node.label}」的执行环境「${environmentId}」不存在`);
      continue;
    }
    if (!availableExecutors.includes(environment.executor)) {
      errors.push(
        `节点「${node.label}」需要执行器「${environment.executor}」（执行环境「${environment.name}」），当前不可用`,
      );
      continue;
    }
    placements[node.path] = {
      environmentId: environment.id,
      environmentName: environment.name,
      executor: environment.executor,
    };
    executors.add(environment.executor);
  }
  return { placements, executors: [...executors], errors };
}

function renderTemplate(text, params, builtins) {
  return String(text || '').replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) return String(params[key]);
    if (Object.prototype.hasOwnProperty.call(builtins, key)) return String(builtins[key]);
    return match;
  });
}

function resolveCwd(raw) {
  const text = String(raw || '').trim();
  if (!text) return process.cwd();
  let expanded = text;
  if (expanded === '~') expanded = os.homedir();
  else if (expanded.startsWith('~/') || expanded.startsWith('~\\')) expanded = path.join(os.homedir(), expanded.slice(2));
  return path.resolve(expanded);
}

function paramEnvKey(key) {
  return `AETHER_PARAM_${String(key).toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
}

function buildEnv(run, node, nodeDirectory, inputFile, inputs) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  env.AETHER_RUN_ID = run.id;
  env.AETHER_RUN_DIR = run.dir;
  env.AETHER_NODE_ID = node.nodeId;
  env.AETHER_NODE_PATH = node.path;
  env.AETHER_NODE_DIR = nodeDirectory;
  env.AETHER_GRAPH_ID = run.graphId;
  env.AETHER_GRAPH_NAME = run.graphName;
  env.AETHER_ENVIRONMENT_ID = node.environmentId || 'local';
  env.AETHER_ENVIRONMENT_NAME = node.environmentName || '';
  env.AETHER_EXECUTOR = node.executor || 'local';
  env.AETHER_INPUT_FILE = inputFile;
  env.AETHER_PARAMS = JSON.stringify(node.params || {});
  env.AETHER_INPUTS = JSON.stringify(
    Object.fromEntries(
      Object.entries(inputs).map(([key, value]) => [
        key,
        { label: value.label, exitCode: value.exitCode, stdoutFile: value.stdoutFile, text: value.text },
      ]),
    ),
  );
  for (const [key, value] of Object.entries(node.params || {})) {
    env[paramEnvKey(key)] = String(value);
  }
  return env;
}

function appendTail(store, chunk) {
  store.push(chunk);
  let length = 0;
  for (let index = store.length - 1; index >= 0; index -= 1) {
    length += store[index].length;
    if (length > NODE_TAIL_LIMIT * 2) {
      store.splice(0, index);
      break;
    }
  }
}

function joinTail(store) {
  const text = store.join('');
  return text.length > NODE_TAIL_LIMIT ? `…${text.slice(-NODE_TAIL_LIMIT)}` : text;
}

function killTree(child) {
  if (!child) return;
  if (process.platform === 'win32') {
    const pid = child.pid;
    if (!pid) return;
    const executable = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'taskkill.exe')
      : 'taskkill';
    let killer;
    try {
      killer = spawn(executable, ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {
      killer = null;
    }
    if (!killer) {
      try {
        child.kill();
      } catch {
        // 忽略：进程可能已经退出。
      }
      return;
    }
    // 只结束 shell 父进程会让命令行留下的孙进程继续跑，所以优先整棵树；
    // taskkill 失败时再退回单进程结束。
    killer.on('error', () => {
      try {
        child.kill();
      } catch {
        // 同上。
      }
    });
    killer.on('exit', (code) => {
      if (code !== 0) {
        try {
          child.kill();
        } catch {
          // 同上。
        }
      }
    });
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // 同上。
  }
  setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      // 同上。
    }
  }, 3000).unref?.();
}

async function readTextHead(file, limit = 4000) {
  let handle;
  try {
    handle = await fsp.open(file, 'r');
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } catch {
    return '';
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/** 本机执行器：用 shell 启动模块命令，按 DAG 依赖并发调度。 */
export class LocalExecutor {
  constructor(options = {}) {
    this.persist = typeof options.persist === 'function' ? options.persist : async () => {};
  }

  describe() {
    return {
      id: 'local',
      label: 'Local machine',
      kind: 'local',
      available: true,
      supports: { cancel: true, logs: true, streaming: false },
    };
  }

  start(run, plan) {
    const byPath = new Map(run.nodes.map((node) => [node.path, node]));
    let resolveDone;
    const done = new Promise((resolve) => {
      resolveDone = resolve;
    });
    let finished = false;

    const finish = (status, message) => {
      if (finished) return;
      finished = true;
      run.status = status;
      run.message = message;
      run.endedAt = Date.now();
      void this.persist(run).catch(() => {});
      resolveDone(run);
    };

    const handle = {
      id: run.id,
      executor: 'local',
      run,
      cancelRequested: false,
      children: new Set(),
      wake: null,
      done,
      cancel: () => {
        handle.cancelRequested = true;
        for (const child of handle.children) killTree(child);
        handle.wake?.();
      },
    };

    const pump = () => {
      if (finished) return;
      if (handle.cancelRequested) {
        for (const node of run.nodes) {
          if (node.status === 'pending') node.status = 'cancelled';
        }
        if (handle.children.size === 0) {
          finish('cancelled', '已取消');
          return;
        }
      }
      let running = 0;
      for (const node of run.nodes) if (node.status === 'running') running += 1;
      let launched = false;
      for (const node of run.nodes) {
        if (node.status !== 'pending') continue;
        if (handle.cancelRequested) {
          node.status = 'cancelled';
          continue;
        }
        const depStatuses = (node.deps || []).map((dep) => byPath.get(dep)?.status || 'failed');
        if (depStatuses.some((status) => status === 'failed' || status === 'skipped' || status === 'cancelled')) {
          node.status = 'skipped';
          node.error = '上游节点未成功';
          continue;
        }
        if (!depStatuses.every((status) => status === 'succeeded')) continue;
        if (running >= run.concurrency) continue;
        running += 1;
        launched = true;
        void this.executeNode(handle, node, byPath)
          .catch(async (error) => {
            node.status = 'failed';
            node.endedAt = Date.now();
            node.error = String(error && error.message ? error.message : error);
            await this.persist(run).catch(() => {});
          })
          .finally(() => pump());
      }
      if (finished) return;
      const settled = run.nodes.every((node) =>
        ['succeeded', 'failed', 'skipped', 'cancelled'].includes(node.status),
      );
      if (settled) {
        const succeeded = run.nodes.filter((node) => node.status === 'succeeded').length;
        const failed = run.nodes.some((node) => node.status === 'failed');
        const cancelled = run.nodes.some((node) => node.status === 'cancelled');
        finish(cancelled ? 'cancelled' : failed ? 'failed' : 'succeeded', `${succeeded}/${run.nodes.length} 个节点成功`);
        return;
      }
      if (!launched && running === 0) {
        for (const node of run.nodes) {
          if (node.status === 'pending') {
            node.status = 'skipped';
            node.error = '调度失败';
          }
        }
        finish('failed', '调度失败：没有可执行的节点');
      }
    };

    handle.wake = pump;
    void this.persist(run)
      .catch(() => {})
      .then(() => pump());
    return handle;
  }

  async cancel(handle) {
    if (handle) handle.cancel();
    return { ok: true, id: handle ? handle.id : '', cancelling: true };
  }

  async readLog(run, nodePath, stream) {
    const file = path.join(run.dir, 'nodes', safeSegment(nodePath), stream === 'err' ? 'stderr.log' : 'stdout.log');
    let text = '';
    try {
      text = await fsp.readFile(file, 'utf8');
    } catch {
      text = '';
    }
    return text.length > LOG_TAIL_LIMIT ? `…${text.slice(-LOG_TAIL_LIMIT)}` : text;
  }

  dispose() {
    // 运行中的句柄由宿主统一取消；执行器本身没有常驻资源。
  }

  async executeNode(handle, node, byPath) {
    const { run } = handle;
    if (node.status !== 'pending') return;
    node.status = 'running';
    node.startedAt = Date.now();
    node.endedAt = null;
    node.exitCode = null;
    node.error = '';
    await this.persist(run).catch(() => {});

    const directory = path.join(run.dir, 'nodes', safeSegment(node.path));
    await fsp.mkdir(directory, { recursive: true });
    const inputs = {};
    for (const depPath of node.deps || []) {
      const dep = byPath.get(depPath);
      const stdoutFile = path.join(run.dir, 'outputs', `${safeSegment(depPath)}.out`);
      const text = await readTextHead(stdoutFile);
      inputs[depPath] = {
        label: dep?.label || depPath,
        status: dep?.status || 'unknown',
        exitCode: dep?.exitCode ?? null,
        stdoutFile,
        text,
      };
    }
    const inputFile = path.join(directory, 'inputs.json');
    await fsp
      .writeFile(inputFile, JSON.stringify({ run: run.id, node: node.path, params: node.params, inputs }, null, 2), 'utf8')
      .catch(() => {});

    const builtins = {
      run_id: run.id,
      run_dir: run.dir,
      node_id: node.nodeId,
      node_path: node.path,
      node_dir: directory,
      graph_id: run.graphId,
      input_file: inputFile,
    };
    const command = renderTemplate(node.command, node.params || {}, builtins);
    const outLog = path.join(directory, 'stdout.log');
    const errLog = path.join(directory, 'stderr.log');
    const outStream = createWriteStream(outLog);
    const errStream = createWriteStream(errLog);
    const outTail = [];
    const errTail = [];

    let timedOut = false;
    const startedAt = Date.now();
    const timeoutMs = Math.max(1, Number(node.timeoutSec) || 300) * 1000;
    let child;
    let closeResult = { code: null, signal: null };
    let spawnError = null;

    try {
      child = spawn(command, {
        shell: true,
        cwd: resolveCwd(node.cwd),
        env: buildEnv(run, node, directory, inputFile, inputs),
        windowsHide: true,
      });
    } catch (error) {
      spawnError = error;
    }

    if (child) {
      handle.children.add(child);
      const timer = setTimeout(() => {
        timedOut = true;
        killTree(child);
      }, timeoutMs);
      timer.unref?.();
      await new Promise((resolve) => {
        child.stdout?.on('data', (chunk) => {
          outStream.write(chunk);
          appendTail(outTail, String(chunk));
        });
        child.stderr?.on('data', (chunk) => {
          errStream.write(chunk);
          appendTail(errTail, String(chunk));
        });
        child.on('error', (error) => {
          spawnError = error;
          resolve();
        });
        child.on('close', (code, signal) => {
          closeResult = { code, signal };
          resolve();
        });
      });
      clearTimeout(timer);
      handle.children.delete(child);
    }

    await Promise.all([
      new Promise((resolve) => outStream.end(resolve)),
      new Promise((resolve) => errStream.end(resolve)),
    ]);

    node.endedAt = Date.now();
    node.exitCode = closeResult.code;
    node.stdoutTail = joinTail(outTail);
    node.stderrTail = joinTail(errTail);
    node.durationMs = node.endedAt - startedAt;

    if (handle.cancelRequested) {
      node.status = 'cancelled';
      node.error = '已取消';
    } else if (timedOut) {
      node.status = 'failed';
      node.error = `超时（${Math.round(timeoutMs / 1000)} 秒）`;
    } else if (spawnError) {
      node.status = 'failed';
      node.error = String(spawnError.message || spawnError);
    } else if (closeResult.code === 0) {
      node.status = 'succeeded';
      node.error = '';
    } else if (closeResult.code === null) {
      node.status = 'failed';
      node.error = closeResult.signal ? `被信号 ${closeResult.signal} 终止` : '进程未能启动';
    } else {
      node.status = 'failed';
      node.error = `退出码 ${closeResult.code}`;
    }

    await fsp
      .copyFile(outLog, path.join(run.dir, 'outputs', `${safeSegment(node.path)}.out`))
      .catch(() => {});
    await this.persist(run).catch(() => {});
  }
}
