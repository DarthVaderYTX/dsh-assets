/**
 * TechHub host half.
 *
 * Owns the durable evaluation catalogue (datasets, templates, tasks) and the
 * local run engine. The browser half talks to this file through a small
 * same-origin JSON API mounted at /techhub/api.
 */
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const name = 'tech-hub';
export const inject = ['webServer', 'skills'];

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIRECTORY = path.join(PLUGIN_ROOT, 'skills', 'tech-hub');
const SKILL_PATH = path.join(SKILL_DIRECTORY, 'SKILL.md');
const API_PREFIX = '/techhub/api';
const STORE_VERSION = 1;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const MAX_IMPORT_BYTES = 512 * 1024 * 1024;
const MAX_RUNS = 20;
const THEME_IDS = new Set(['default', 'blue', 'emerald', 'amber', 'violet', 'rose']);
const LANGUAGE_IDS = new Set(['auto', 'zh', 'en']);
const SKILL_NAME = 'tech-hub';
const SKILL_DESCRIPTION =
  'Operate the TechHub evaluation plugin: manage datasets, templates, tasks, runs, workspace bundles, themes, language and documentation.';
const SKILL_WHEN_TO_USE =
  'Use when asked to create, edit, delete, run or inspect TechHub datasets, templates, tasks, experiment runs, workspace exports/imports, or TechHub settings/docs.';
const MAX_LOG_CHARS = 160_000;

function emptyStore() {
  return {
    version: STORE_VERSION,
    datasets: [],
    templates: [],
    tasks: [],
    runs: [],
  };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDataset(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  const format = value.format === 'csv' ? 'csv' : 'jsonl';
  return {
    id,
    name: text(value.name, 'Untitled dataset').slice(0, 200),
    description: text(value.description).slice(0, 2_000),
    format,
    raw: text(value.raw),
    columns: stringArray(value.columns).slice(0, 500),
    rowCount: Math.max(0, Math.floor(numberOrNull(value.rowCount) ?? 0)),
    sourceName: text(value.sourceName),
    createdAt: numberOrNull(value.createdAt) ?? Date.now(),
    updatedAt: numberOrNull(value.updatedAt) ?? Date.now(),
  };
}

function normalizeParameterDefinition(value) {
  if (!isRecord(value)) return null;
  const key = text(value.key).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  return {
    id: text(value.id).trim() || `param-${key}`,
    key,
    defaultValue: text(value.defaultValue),
    description: text(value.description).slice(0, 2_000),
  };
}

function normalizeParameterValues(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const parameters = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const key = text(item.key).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    parameters.push({ key, value: text(item.value) });
  }
  return parameters;
}

function normalizeOutputDefinition(value) {
  if (!isRecord(value)) return null;
  const name = text(value.name).trim();
  const file = text(value.file).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || file === '') return null;
  return {
    id: text(value.id).trim() || `output-${name}`,
    name,
    file: file.slice(0, 1_000),
  };
}

function normalizeInputReference(value) {
  if (!isRecord(value)) return null;
  const key = text(value.key).trim();
  const stageId = text(value.stageId).trim();
  const outputName = text(value.outputName).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  if (stageId === '' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(outputName)) return null;
  return { id: text(value.id).trim() || `input-${key}`, key, stageId, outputName };
}

function normalizeStage(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  return {
    id,
    name: text(value.name, 'Stage').slice(0, 200),
    command: text(value.command).slice(0, 8_000),
    args: text(value.args).slice(0, 8_000),
    inputs: stringArray(value.inputs).filter(Boolean).slice(0, 20),
    outputs: (Array.isArray(value.outputs) ? value.outputs : [])
      .map(normalizeOutputDefinition)
      .filter(Boolean)
      .filter((output, index, list) => list.findIndex((item) => item.name === output.name) === index)
      .slice(0, 20),
    inputRefs: (Array.isArray(value.inputRefs) ? value.inputRefs : [])
      .map(normalizeInputReference)
      .filter(Boolean)
      .filter(
        (reference, index, list) =>
          list.findIndex((item) => item.key === reference.key) === index,
      )
      .slice(0, 40),
    description: text(value.description).slice(0, 2_000),
  };
}

function normalizeTemplate(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  return {
    id,
    name: text(value.name, 'Untitled template').slice(0, 200),
    description: text(value.description).slice(0, 2_000),
    parameters: (Array.isArray(value.parameters) ? value.parameters : [])
      .map(normalizeParameterDefinition)
      .filter(Boolean)
      .filter((parameter, index, list) => list.findIndex((item) => item.key === parameter.key) === index)
      .slice(0, 60),
    stages: (Array.isArray(value.stages) ? value.stages : []).map(normalizeStage).filter(Boolean).slice(0, 60),
    createdAt: numberOrNull(value.createdAt) ?? Date.now(),
    updatedAt: numberOrNull(value.updatedAt) ?? Date.now(),
  };
}

function normalizeStageConfig(value) {
  if (!isRecord(value)) return null;
  const stageId = text(value.stageId).trim();
  if (stageId === '') return null;
  return {
    stageId,
    name: text(value.name, 'Stage').slice(0, 200),
    command: text(value.command).slice(0, 8_000),
    args: text(value.args).slice(0, 8_000),
    inputs: stringArray(value.inputs).filter(Boolean).slice(0, 20),
    outputs: (Array.isArray(value.outputs) ? value.outputs : [])
      .map(normalizeOutputDefinition)
      .filter(Boolean)
      .filter((output, index, list) => list.findIndex((item) => item.name === output.name) === index)
      .slice(0, 20),
    inputRefs: (Array.isArray(value.inputRefs) ? value.inputRefs : [])
      .map(normalizeInputReference)
      .filter(Boolean)
      .filter(
        (reference, index, list) =>
          list.findIndex((item) => item.key === reference.key) === index,
      )
      .slice(0, 40),
  };
}

function normalizeGroup(value, index) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  const role = value.role === 'control' ? 'control' : 'treatment';
  return {
    id,
    name: text(value.name, role === 'control' ? 'Control' : `Treatment ${index}`).slice(0, 200),
    role,
    templateId: text(value.templateId),
    parameters: normalizeParameterValues(value.parameters),
    stageConfigs: (Array.isArray(value.stageConfigs) ? value.stageConfigs : [])
      .map(normalizeStageConfig)
      .filter(Boolean)
      .slice(0, 60),
  };
}

function normalizeTask(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  const groups = (Array.isArray(value.groups) ? value.groups : []).map(normalizeGroup).filter(Boolean);
  const controls = groups.filter((group) => group.role === 'control');
  if (controls.length !== 1) return null;
  return {
    id,
    name: text(value.name, 'Untitled task').slice(0, 200),
    description: text(value.description).slice(0, 4_000),
    datasetId: text(value.datasetId),
    cwd: text(value.cwd).slice(0, 4_000),
    groups,
    createdAt: numberOrNull(value.createdAt) ?? Date.now(),
    updatedAt: numberOrNull(value.updatedAt) ?? Date.now(),
  };
}

function normalizeRun(value) {
  if (!isRecord(value)) return null;
  const id = text(value.id).trim();
  if (id === '') return null;
  const status = ['running', 'completed', 'failed', 'stopped'].includes(value.status) ? value.status : 'stopped';
  return {
    id,
    taskId: text(value.taskId),
    taskName: text(value.taskName, 'Task').slice(0, 200),
    datasetId: text(value.datasetId),
    cwd: text(value.cwd),
    workspace: text(value.workspace),
    resultsDir: text(value.resultsDir),
    status: status === 'running' ? 'stopped' : status,
    message: text(value.message),
    failedStage: text(value.failedStage),
    startedAt: numberOrNull(value.startedAt) ?? Date.now(),
    endedAt: numberOrNull(value.endedAt) ?? (status === 'running' ? Date.now() : null),
    groups: (Array.isArray(value.groups) ? value.groups : []).map((group) => {
      if (!isRecord(group)) return null;
      return {
        id: text(group.id),
        name: text(group.name, 'Group').slice(0, 200),
        role: group.role === 'control' ? 'control' : 'treatment',
        templateId: text(group.templateId),
        parameters: normalizeParameterValues(group.parameters),
        resultsDir: text(group.resultsDir),
        status: ['pending', 'running', 'completed', 'failed', 'stopped'].includes(group.status)
          ? group.status
          : 'pending',
        stages: (Array.isArray(group.stages) ? group.stages : []).map((stage) => {
          if (!isRecord(stage)) return null;
          return {
            id: text(stage.id),
            stageId: text(stage.stageId),
            name: text(stage.name, 'Stage').slice(0, 200),
            command: text(stage.command).slice(0, 8_000),
            args: text(stage.args).slice(0, 8_000),
            inputs: stringArray(stage.inputs).filter(Boolean).slice(0, 20),
            outputs: (Array.isArray(stage.outputs) ? stage.outputs : [])
              .map(normalizeOutputDefinition)
              .filter(Boolean)
              .slice(0, 20),
            inputRefs: (Array.isArray(stage.inputRefs) ? stage.inputRefs : [])
              .map(normalizeInputReference)
              .filter(Boolean)
              .slice(0, 40),
            status: ['pending', 'running', 'completed', 'failed', 'stopped'].includes(stage.status)
              ? stage.status
              : 'pending',
            exitCode: numberOrNull(stage.exitCode),
            resultsDir: text(stage.resultsDir),
            outputDir: text(stage.outputDir),
            inputDir: text(stage.inputDir),
            startedAt: numberOrNull(stage.startedAt),
            endedAt: numberOrNull(stage.endedAt),
            stdout: text(stage.stdout).slice(-MAX_LOG_CHARS),
            stderr: text(stage.stderr).slice(-MAX_LOG_CHARS),
          };
        }).filter(Boolean),
      };
    }).filter(Boolean),
  };
}

function normalizeLoadedStore(value) {
  const source = isRecord(value) ? value : {};
  return {
    version: STORE_VERSION,
    datasets: (Array.isArray(source.datasets) ? source.datasets : []).map(normalizeDataset).filter(Boolean),
    templates: (Array.isArray(source.templates) ? source.templates : []).map(normalizeTemplate).filter(Boolean),
    tasks: (Array.isArray(source.tasks) ? source.tasks : []).map(normalizeTask).filter(Boolean),
    runs: (Array.isArray(source.runs) ? source.runs : []).map(normalizeRun).filter(Boolean).slice(0, MAX_RUNS),
  };
}

function normalizeModel(value) {
  return {
    datasets: (Array.isArray(value.datasets) ? value.datasets : []).map(normalizeDataset).filter(Boolean),
    templates: (Array.isArray(value.templates) ? value.templates : []).map(normalizeTemplate).filter(Boolean),
    tasks: (Array.isArray(value.tasks) ? value.tasks : []).map(normalizeTask).filter(Boolean),
  };
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

function sendError(res, status, message, details) {
  sendJson(res, status, { error: { status, message, ...(details === undefined ? {} : { details }) } });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function stripSkillFrontmatter(markdown) {
  const text = String(markdown || '');
  if (!text.startsWith('---')) return text;
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

function readBinaryBody(req, limit = MAX_IMPORT_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readZipEntries(buffer) {
  if (buffer.length < 22) throw new Error('ZIP file is too small.');
  let end = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('ZIP end-of-central-directory record not found.');
  const count = buffer.readUInt16LE(end + 10);
  const centralOffset = buffer.readUInt32LE(end + 16);
  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.slice(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith('/')) continue;
    if (flags & 0x1) throw new Error(`Encrypted ZIP entry is not supported: ${name}`);
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid ZIP local header: ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = inflateRawSync(compressed);
    else throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    entries.push({ name, data });
  }
  return entries;
}

function truncateLog(value) {
  return value.length > MAX_LOG_CHARS ? value.slice(-MAX_LOG_CHARS) : value;
}

function applyParameters(value, parameters) {
  if (typeof value !== 'string' || value === '') return value;
  const values = new Map((Array.isArray(parameters) ? parameters : []).map((parameter) => [parameter.key, parameter.value]));
  return value.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, key) =>
    values.has(key) ? values.get(key) : match,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyInputReferences(value, references) {
  if (typeof value !== 'string' || value === '') return value;
  const entries = Object.entries(references || {}).sort((left, right) => right[0].length - left[0].length);
  if (entries.length === 0) return value;
  const lookup = new Map(entries.map(([key, filePath]) => [key, filePath.replace(/\\/g, '/')]));
  const pattern = new RegExp(`\\{\\{\\s*(${entries.map(([key]) => escapeRegExp(key)).join('|')})\\s*\\}\\}`, 'g');
  return value.replace(pattern, (match, key) => (lookup.has(key) ? lookup.get(key) : match));
}

function terminateChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    if (process.platform !== 'win32' || child.pid === undefined) {
      try {
        child.kill('SIGTERM');
      } catch {
        // Already gone.
      }
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      resolve();
    };
    try {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('error', finish);
      killer.on('close', finish);
    } catch {
      finish();
    }
    setTimeout(finish, 1500).unref?.();
  });
}

export function apply(ctx) {
  const profileDirectory =
    process.env.DSH_PROFILE_DIR ||
    path.join(os.homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE || 'desktop');
  const dataDirectory = path.join(profileDirectory, 'techhub');
  const guideOverrideFile = path.join(dataDirectory, 'AGENT_GUIDE.md');
  const storeFile = path.join(dataDirectory, 'store.json');
  const configFile = path.join(dataDirectory, 'config.json');
  const defaultWorkspace = path.join(dataDirectory, 'workspace');
  const runsDirectory = path.join(dataDirectory, 'runs');
  const settings = { workspace: '', theme: 'default', language: 'auto' };

  const store = emptyStore();
  const activeRuns = new Map();
  let loaded = false;
  let loading;
  let saveChain = Promise.resolve();
  let lastSaveError = null;
  const skills = ctx.get('skills');
  let skillDispose = null;

  function readSkillMarkdown() {
    try {
      return readFileSync(guideOverrideFile, 'utf8');
    } catch (error) {
      if (!error || error.code !== 'ENOENT') console.error('[techhub] failed to read skill override:', error);
    }
    try {
      return readFileSync(SKILL_PATH, 'utf8');
    } catch (error) {
      console.error('[techhub] failed to read bundled skill:', error);
      return '';
    }
  }

  function registerAgentSkill() {
    if (!skills || typeof skills.register !== 'function') return;
    if (skillDispose) {
      skillDispose();
      skillDispose = null;
    }
    const content = stripSkillFrontmatter(readSkillMarkdown());
    if (!content.trim()) {
      console.warn('[techhub] skill content is empty; skipping skill registration');
      return;
    }
    try {
      skillDispose = skills.register({
        name: SKILL_NAME,
        description: SKILL_DESCRIPTION,
        whenToUse: SKILL_WHEN_TO_USE,
        source: 'runtime',
        content,
        resourceBase: {
          kind: 'directory',
          path: SKILL_DIRECTORY,
        },
        metadata: { plugin: 'tech-hub' },
      });
    } catch (error) {
      console.error('[techhub] failed to register agent skill:', error);
      skillDispose = null;
    }
  }

  function refreshAgentSkill() {
    registerAgentSkill();
  }

  ctx.effect(
    () => {
      registerAgentSkill();
      return () => {
        if (skillDispose) {
          skillDispose();
          skillDispose = null;
        }
      };
    },
    'tech-hub: agent skill',
  );

  function workspaceManifestPath() {
    return path.join(workspacePath(), 'techhub-workspace.json');
  }

  function workspaceManifest(includeTasks = true) {
    return {
      format: 'techhub-workspace',
      version: STORE_VERSION,
      updatedAt: Date.now(),
      includeTasks,
      datasets: store.datasets,
      templates: store.templates,
      tasks: includeTasks ? store.tasks : [],
    };
  }

  async function writeWorkspaceManifest(payload) {
    const directory = workspacePath();
    await fs.mkdir(directory, { recursive: true });
    const target = workspaceManifestPath();
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temporary, payload, 'utf8');
    await fs.rename(temporary, target);
  }

  async function persist() {
    const payload = JSON.stringify(store, null, 2);
    const manifestPayload = JSON.stringify(workspaceManifest(true), null, 2);
    saveChain = saveChain
      .then(async () => {
        await fs.mkdir(dataDirectory, { recursive: true });
        const temporary = `${storeFile}.${process.pid}.tmp`;
        await fs.writeFile(temporary, payload, 'utf8');
        await fs.rename(temporary, storeFile);
        await writeWorkspaceManifest(manifestPayload);
        await syncDatasetFiles();
        lastSaveError = null;
      })
      .catch((error) => {
        lastSaveError = error instanceof Error ? error.message : String(error);
        console.error('[techhub] failed to save store:', error);
      });
    return saveChain;
  }

  function scheduleSave() {
    void persist();
  }

  async function persistConfig() {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporary = `${configFile}.${process.pid}.tmp`;
    await fs.writeFile(
      temporary,
      JSON.stringify(
        { version: 1, workspace: settings.workspace, theme: settings.theme, language: settings.language },
        null,
        2,
      ),
      'utf8',
    );
    await fs.rename(temporary, configFile);
  }

  function workspacePath() {
    return settings.workspace || defaultWorkspace;
  }

  function workspaceInfo() {
    return {
      workspace: workspacePath(),
      defaultWorkspace,
      configured: settings.workspace,
      theme: settings.theme,
      language: settings.language,
    };
  }

  async function ensureWorkspace() {
    const directory = workspacePath();
    await fs.mkdir(directory, { recursive: true });
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) throw new Error('Workspace path is not a directory.');
    return directory;
  }

  function safeFilePart(value) {
    return String(value || '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_')
      .replace(/^[. ]+|[. ]+$/g, '')
      .slice(0, 80) || 'item';
  }

  function datasetDirectory(dataset) {
    return path.join(workspacePath(), 'datasets', `${safeFilePart(dataset.name)}__${safeFilePart(dataset.id)}`);
  }

  async function syncDatasetFiles() {
    const root = path.join(workspacePath(), 'datasets');
    await fs.mkdir(root, { recursive: true });
    const expected = new Set(store.datasets.map((dataset) => path.resolve(datasetDirectory(dataset))));
    const children = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      if (!child.isDirectory()) continue;
      const directory = path.join(root, child.name);
      const markerPath = path.join(directory, 'dataset.json');
      let marker = null;
      try {
        marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
      } catch {
        continue;
      }
      if (!marker || typeof marker.id !== 'string') continue;
      if (!expected.has(path.resolve(directory))) {
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
    for (const dataset of store.datasets) {
      const directory = datasetDirectory(dataset);
      await fs.mkdir(directory, { recursive: true });
      const extension = dataset.format === 'csv' ? 'csv' : 'jsonl';
      const dataFile = `data.${extension}`;
      await fs.writeFile(path.join(directory, dataFile), dataset.raw || '', 'utf8');
      await fs.writeFile(
        path.join(directory, 'dataset.json'),
        JSON.stringify(
          {
            id: dataset.id,
            name: dataset.name,
            description: dataset.description,
            format: dataset.format,
            file: dataFile,
            columns: dataset.columns,
            rowCount: dataset.rowCount,
            sourceName: dataset.sourceName,
            updatedAt: dataset.updatedAt,
          },
          null,
          2,
        ),
        'utf8',
      );
    }
  }

  function groupFolderName(group, groupIndex) {
    return `${String(groupIndex + 1).padStart(2, '0')}-${safeFilePart(group.name)}`;
  }

  function stageFolderName(stage, stageIndex) {
    return `${String(stageIndex + 1).padStart(2, '0')}-${safeFilePart(stage.name)}`;
  }

  function stageDirectory(run, group, stage) {
    const groupIndex = run.groups.indexOf(group);
    const stageIndex = group.stages.indexOf(stage);
    return path.join(
      run.resultsDir,
      'groups',
      groupFolderName(group, groupIndex),
      'stages',
      stageFolderName(stage, stageIndex),
    );
  }

  function stageLogBase(run, group, stage) {
    return stage.resultsDir || stageDirectory(run, group, stage);
  }

  async function writeStageLogFiles(base, stdout, stderr) {
    await fs.mkdir(path.dirname(base), { recursive: true });
    await fs.writeFile(`${base}.stdout.log`, stdout || '', 'utf8');
    await fs.writeFile(`${base}.stderr.log`, stderr || '', 'utf8');
  }

  async function writeRunSnapshot(run) {
    if (!run.resultsDir) return;
    await fs.mkdir(run.resultsDir, { recursive: true });
    await fs.writeFile(path.join(run.resultsDir, 'run.json'), JSON.stringify(run, null, 2), 'utf8');
  }

  async function writeRunArtifacts(run) {
    if (!run.resultsDir) return;
    await fs.mkdir(run.resultsDir, { recursive: true });
    for (const group of run.groups) {
      for (const stage of group.stages) {
        await writeStageLogFiles(stageLogBase(run, group, stage), stage.stdout, stage.stderr);
      }
    }
    await writeRunSnapshot(run);
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[index] = value >>> 0;
    }
    return table;
  })();

  function crc32(buffer) {
    let value = 0xffffffff;
    for (let index = 0; index < buffer.length; index += 1) {
      value = CRC_TABLE[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
  }

  function zipDateTime(milliseconds) {
    const date = new Date(milliseconds);
    const year = Math.max(1980, Math.min(2107, date.getFullYear()));
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosTime, dosDate };
  }

  function storeZip(entries) {
    const localChunks = [];
    const centralChunks = [];
    let localOffset = 0;
    for (const entry of entries) {
      const name = Buffer.from(entry.name, 'utf8');
      const data = entry.data;
      const checksum = crc32(data);
      const { dosTime, dosDate } = zipDateTime(entry.mtime);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x0800, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(dosTime, 10);
      local.writeUInt16LE(dosDate, 12);
      local.writeUInt32LE(checksum, 14);
      local.writeUInt32LE(data.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      localChunks.push(local, name, data);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0);
      central.writeUInt16LE(20, 4);
      central.writeUInt16LE(20, 6);
      central.writeUInt16LE(0x0800, 8);
      central.writeUInt16LE(0, 10);
      central.writeUInt16LE(dosTime, 12);
      central.writeUInt16LE(dosDate, 14);
      central.writeUInt32LE(checksum, 16);
      central.writeUInt32LE(data.length, 20);
      central.writeUInt32LE(data.length, 24);
      central.writeUInt16LE(name.length, 28);
      central.writeUInt16LE(0, 30);
      central.writeUInt16LE(0, 32);
      central.writeUInt16LE(0, 34);
      central.writeUInt16LE(0, 36);
      central.writeUInt32LE(0, 38);
      central.writeUInt32LE(localOffset, 42);
      centralChunks.push(central, name);
      localOffset += local.length + name.length + data.length;
    }
    const centralDirectory = Buffer.concat(centralChunks);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(localOffset, 16);
    end.writeUInt16LE(0, 20);
    return Buffer.concat([...localChunks, centralDirectory, end]);
  }

  async function collectFiles(directory, prefix = '') {
    const entries = [];
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children) {
      const fullPath = path.join(directory, child.name);
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.isDirectory()) {
        entries.push(...(await collectFiles(fullPath, relativePath)));
      } else if (child.isFile()) {
        const stat = await fs.stat(fullPath);
        entries.push({
          name: relativePath.split(path.sep).join('/'),
          data: await fs.readFile(fullPath),
          mtime: stat.mtimeMs,
        });
      }
    }
    return entries;
  }

  async function listOutputFiles(directory, prefix = '', files = []) {
    if (files.length >= 2000) return files;
    let children;
    try {
      children = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') return files;
      throw error;
    }
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      if (files.length >= 2000) break;
      const fullPath = path.join(directory, child.name);
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      if (child.isDirectory()) {
        await listOutputFiles(fullPath, relativePath, files);
      } else if (child.isFile()) {
        const stat = await fs.stat(fullPath);
        files.push({
          path: relativePath.split(path.sep).join('/'),
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }
    }
    return files;
  }

  function contentTypeForFile(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    const types = {
      '.txt': 'text/plain; charset=utf-8',
      '.log': 'text/plain; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.jsonl': 'application/x-ndjson; charset=utf-8',
      '.csv': 'text/csv; charset=utf-8',
      '.md': 'text/markdown; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.yaml': 'text/yaml; charset=utf-8',
      '.yml': 'text/yaml; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.ts': 'text/typescript; charset=utf-8',
      '.py': 'text/x-python; charset=utf-8',
      '.sh': 'text/x-shellscript; charset=utf-8',
      '.ps1': 'text/plain; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    return types[extension] || 'application/octet-stream';
  }

  async function runExportFiles(run) {
    if (run.resultsDir) {
      try {
        const stat = await fs.stat(run.resultsDir);
        if (stat.isDirectory()) return await collectFiles(run.resultsDir);
      } catch {
        // Fall back to synthesizing the record from the stored run.
      }
    }
    const entries = [
      {
        name: 'run.json',
        data: Buffer.from(JSON.stringify(run, null, 2), 'utf8'),
        mtime: Date.now(),
      },
    ];
    for (const group of run.groups) {
      for (const stage of group.stages) {
        const base = `${String(run.groups.indexOf(group) + 1).padStart(2, '0')}-${safeFilePart(group.name)}__${String(group.stages.indexOf(stage) + 1).padStart(2, '0')}-${safeFilePart(stage.name)}`;
        entries.push({ name: `${base}.stdout.log`, data: Buffer.from(stage.stdout || '', 'utf8'), mtime: stage.endedAt || Date.now() });
        entries.push({ name: `${base}.stderr.log`, data: Buffer.from(stage.stderr || '', 'utf8'), mtime: stage.endedAt || Date.now() });
      }
    }
    return entries;
  }

  async function clearRunDirectories() {
    const root = path.join(workspacePath(), 'runs');
    try {
      const children = await fs.readdir(root, { withFileTypes: true });
      for (const child of children) {
        if (!child.isDirectory() || !child.name.startsWith('run-')) continue;
        await fs.rm(path.join(root, child.name), { recursive: true, force: true });
      }
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }

  async function collectWorkspaceEntries(workspace, includeTasks, manifestPayload) {
    const entries = [
      {
        name: 'techhub-workspace.json',
        data: Buffer.from(manifestPayload, 'utf8'),
        mtime: Date.now(),
      },
    ];
    const manifestName = path.basename(workspaceManifestPath());
    const walk = async (directory, relative) => {
      const children = await fs.readdir(directory, { withFileTypes: true });
      for (const child of children) {
        const childRelative = relative ? `${relative}/${child.name}` : child.name;
        if (!includeTasks && (childRelative === 'runs' || childRelative.startsWith('runs/'))) continue;
        if (childRelative === manifestName || childRelative.endsWith('.tmp')) continue;
        const full = path.join(directory, child.name);
        if (child.isDirectory()) {
          await walk(full, childRelative);
          continue;
        }
        if (!child.isFile()) continue;
        const stat = await fs.stat(full);
        entries.push({ name: childRelative, data: await fs.readFile(full), mtime: stat.mtimeMs });
      }
    };
    await walk(workspace, '');
    return entries;
  }

  function rebaseRunPaths(run, workspace) {
    run.workspace = workspace;
    run.resultsDir = path.join(workspace, 'runs', run.id);
    for (const [groupIndex, group] of (run.groups || []).entries()) {
      group.resultsDir = path.join(run.resultsDir, 'groups', groupFolderName(group, groupIndex));
      for (const [stageIndex, stage] of (group.stages || []).entries()) {
        stage.resultsDir = path.join(group.resultsDir, 'stages', stageFolderName(stage, stageIndex));
        stage.inputDir = path.join(stage.resultsDir, 'input');
        stage.outputDir = path.join(stage.resultsDir, 'output');
      }
    }
    return run;
  }

  async function loadRunsFromWorkspace(workspace) {
    const root = path.join(workspace, 'runs');
    let children;
    try {
      children = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      throw error;
    }
    const runs = [];
    for (const child of children) {
      if (!child.isDirectory() || !child.name.startsWith('run-')) continue;
      try {
        const raw = await fs.readFile(path.join(root, child.name, 'run.json'), 'utf8');
        const normalized = normalizeRun(JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw));
        if (normalized) runs.push(rebaseRunPaths(normalized, workspace));
      } catch (error) {
        console.error('[techhub] failed to import run record:', child.name, error);
      }
    }
    runs.sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));
    return runs.slice(0, MAX_RUNS);
  }

  function resolveWorkspaceEntry(workspace, name) {
    const normalized = String(name || '').replace(/\\/g, '/');
    if (normalized === '' || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
      throw new Error(`Invalid workspace bundle path: ${name}`);
    }
    const target = path.resolve(workspace, normalized);
    if (target !== workspace && !target.startsWith(`${workspace}${path.sep}`)) {
      throw new Error(`Workspace bundle path escapes the workspace: ${name}`);
    }
    return target;
  }

  function openDirectory(target) {
    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(command, [target], { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', (error) => {
      console.error('[techhub] failed to open directory:', error);
    });
    child.unref();
  }

  async function ensureLoaded() {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      await fs.mkdir(dataDirectory, { recursive: true });
      try {
        const raw = await fs.readFile(configFile, 'utf8');
        const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
        settings.workspace = typeof parsed.workspace === 'string' ? parsed.workspace.trim() : '';
        settings.theme = THEME_IDS.has(parsed.theme) ? parsed.theme : 'default';
        settings.language = LANGUAGE_IDS.has(parsed.language) ? parsed.language : 'auto';
      } catch (error) {
        if (error && error.code !== 'ENOENT') console.error('[techhub] failed to load config:', error);
      }
      let workspaceModel = null;
      try {
        const raw = await fs.readFile(workspaceManifestPath(), 'utf8');
        const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
        if (parsed && (parsed.format === 'techhub-workspace' || Array.isArray(parsed.datasets))) {
          workspaceModel = normalizeModel(parsed);
        }
      } catch (error) {
        if (error && error.code !== 'ENOENT') {
          console.error('[techhub] failed to load workspace manifest:', error);
        }
      }
      try {
        const raw = await fs.readFile(storeFile, 'utf8');
        const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
        const normalized = normalizeLoadedStore(parsed);
        store.datasets = workspaceModel ? workspaceModel.datasets : normalized.datasets;
        store.templates = workspaceModel ? workspaceModel.templates : normalized.templates;
        store.tasks = workspaceModel ? workspaceModel.tasks : normalized.tasks;
        store.runs = normalized.runs;
      } catch (error) {
        if (workspaceModel) {
          store.datasets = workspaceModel.datasets;
          store.templates = workspaceModel.templates;
          store.tasks = workspaceModel.tasks;
        }
        if (error && error.code !== 'ENOENT') {
          try {
            await fs.rename(storeFile, `${storeFile}.corrupt-${Date.now()}`);
          } catch {
            // Keep the original file if it cannot be moved.
          }
          console.error('[techhub] failed to load store; starting empty:', error);
        }
      }
      loaded = true;
      if (!workspaceModel) {
        await persist();
      } else {
        await syncDatasetFiles().catch((error) => {
          console.error('[techhub] failed to sync dataset files:', error);
        });
      }
    })();
    try {
      await loading;
    } finally {
      loading = undefined;
    }
  }

  function defaultCwd() {
    const working = ctx.get('workingDirectory');
    if (working && typeof working.defaultDirectory === 'string') return working.defaultDirectory;
    return process.cwd();
  }

  function snapshotRun(run) {
    return JSON.parse(JSON.stringify(run));
  }

  function trimRuns() {
    if (store.runs.length <= MAX_RUNS) return;
    const activeIds = new Set(activeRuns.keys());
    for (let index = store.runs.length - 1; index >= 0 && store.runs.length > MAX_RUNS; index -= 1) {
      if (activeIds.has(store.runs[index].id)) continue;
      store.runs.splice(index, 1);
    }
  }

  async function prepareStageInputs(group, stage) {
    const inputDir = stage.inputDir;
    if (!inputDir) return { refs: {}, paths: [], dirs: [] };
    await fs.rm(inputDir, { recursive: true, force: true });
    await fs.mkdir(inputDir, { recursive: true });
    const currentIndex = group.stages.indexOf(stage);
    const references = {};
    const paths = [];
    const dirs = new Set();
    const selected = [];
    for (const reference of stage.inputRefs || []) {
      if (references[reference.key]) {
        throw new Error(`输入引用 key 重复：${reference.key}`);
      }
      const upstream = group.stages.find((candidate) => candidate.stageId === reference.stageId);
      if (!upstream || upstream.status !== 'completed' || !upstream.outputDir) {
        throw new Error(`无法解析输入引用 ${reference.key}`);
      }
      if (group.stages.indexOf(upstream) >= currentIndex) {
        throw new Error(`输入引用必须来自前面的阶段：${reference.key}`);
      }
      const output = (upstream.outputs || []).find((candidate) => candidate.name === reference.outputName);
      if (!output) {
        throw new Error(`上游阶段没有配置对外输出：${upstream.name}.${reference.outputName}`);
      }
      const outputRoot = path.resolve(upstream.outputDir);
      const filePath = path.resolve(outputRoot, output.file);
      if (filePath !== outputRoot && !filePath.startsWith(`${outputRoot}${path.sep}`)) {
        throw new Error(`上游输出文件路径越界：${upstream.name}.${output.name}`);
      }
      const stat = await fs.lstat(filePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        throw new Error(`上游输出文件不存在：${upstream.name}.${output.name}（${output.file}）`);
      }
      references[reference.key] = filePath;
      paths.push(filePath);
      selected.push({
        key: reference.key,
        stageId: upstream.stageId,
        stageName: upstream.name,
        outputName: output.name,
        file: output.file,
        path: filePath,
      });
    }
    if ((stage.inputRefs || []).length === 0 && (stage.inputs || []).length > 0) {
      for (const inputId of new Set(stage.inputs || [])) {
        const upstream = group.stages.find((candidate) => candidate.stageId === inputId);
        if (!upstream || upstream.status !== 'completed' || !upstream.outputDir) continue;
        if (group.stages.indexOf(upstream) >= currentIndex) continue;
        dirs.add(upstream.outputDir);
        selected.push({
          stageId: upstream.stageId,
          stageName: upstream.name,
          outputDir: upstream.outputDir,
        });
      }
    }
    const manifest = {
      stage: { id: stage.stageId, name: stage.name },
      generatedAt: Date.now(),
      inputs: selected,
      refs: references,
    };
    await fs.writeFile(path.join(inputDir, 'input.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return { refs: references, paths, dirs: [...dirs] };
  }

  async function materializeDataset(run, task) {
    if (!task.datasetId) return {};
    const dataset = store.datasets.find((item) => item.id === task.datasetId);
    if (!dataset) return {};
    const directory = run.resultsDir || path.join(runsDirectory, run.id);
    await fs.mkdir(directory, { recursive: true });
    const extension = dataset.format === 'csv' ? 'csv' : 'jsonl';
    const file = path.join(directory, `dataset.${extension}`);
    await fs.writeFile(file, dataset.raw, 'utf8');
    return {
      TECHHUB_DATASET_PATH: file,
      TECHHUB_DATASET_FORMAT: dataset.format,
      TECHHUB_DATASET_ID: dataset.id,
      TECHHUB_DATASET_NAME: dataset.name,
    };
  }

  function executeCommand(commandLine, cwd, environment, entry, stage, logBase) {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(commandLine, {
          cwd,
          shell: true,
          windowsHide: true,
          env: environment,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        resolve({
          code: null,
          signal: null,
          stdout: '',
          stderr: '',
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      entry.children.add(child);
      if (entry.stopped) void terminateChild(child);
      let stdout = '';
      let stderr = '';
      let spawnError = null;
      let lastPublished = 0;
      let lastLogWrite = 0;
      const collect = (current, chunk) => truncateLog(current + chunk.toString('utf8'));
      const writeLogs = (force = false) => {
        if (!logBase) return;
        const now = Date.now();
        if (!force && now - lastLogWrite < 500) return;
        lastLogWrite = now;
        void writeStageLogFiles(logBase, stdout, stderr).catch((error) => {
          console.error('[techhub] failed to write stage logs:', error);
        });
      };
      const publish = (force = false) => {
        const now = Date.now();
        if (!force && now - lastPublished < 250) return;
        lastPublished = now;
        stage.stdout = stdout;
        stage.stderr = stderr;
        scheduleSave();
        writeLogs();
      };
      child.stdout?.on('data', (chunk) => {
        stdout = collect(stdout, chunk);
        publish();
      });
      child.stderr?.on('data', (chunk) => {
        stderr = collect(stderr, chunk);
        publish();
      });
      child.on('error', (error) => {
        spawnError = error instanceof Error ? error.message : String(error);
      });
      child.on('close', (code, signal) => {
        entry.children.delete(child);
        stage.stdout = stdout;
        stage.stderr = stderr;
        scheduleSave();
        writeLogs(true);
        resolve({ code, signal, stdout, stderr, error: spawnError });
      });
    });
  }

  async function executeGroup(run, task, group, entry, cwd, datasetEnvironment) {
    if (entry.stopped) {
      group.status = 'stopped';
      for (const stage of group.stages) {
        if (stage.status === 'pending' || stage.status === 'running') stage.status = 'stopped';
      }
      return;
    }
    group.status = 'running';
    scheduleSave();
    for (const stage of group.stages) {
      if (entry.stopped) {
        stage.status = 'stopped';
        group.status = 'stopped';
        return;
      }
      stage.status = 'running';
      stage.startedAt = Date.now();
      scheduleSave();
      if (stage.outputDir) {
        await fs.mkdir(stage.outputDir, { recursive: true }).catch((error) => {
          console.error('[techhub] failed to create stage output directory:', error);
        });
      }
      let inputs = { refs: {}, paths: [], dirs: [] };
      try {
        inputs = await prepareStageInputs(group, stage);
      } catch (error) {
        stage.status = 'failed';
        stage.stderr = `无法准备上游输入：${error instanceof Error ? error.message : String(error)}`;
        stage.endedAt = Date.now();
        group.status = 'failed';
        if (!run.failedStage) run.failedStage = stage.name;
        scheduleSave();
        return;
      }
      stage.command = applyInputReferences(applyParameters(stage.command, group.parameters), inputs.refs);
      stage.args = applyInputReferences(applyParameters(stage.args, group.parameters), inputs.refs);
      const commandLine = [stage.command, stage.args].filter((part) => part.trim() !== '').join(' ').trim();
      stage.commandLine = commandLine;
      const logBase = stageLogBase(run, group, stage);
      const environment = {
        ...process.env,
        ...datasetEnvironment,
        TECHHUB_RUN_ID: run.id,
        TECHHUB_RESULTS_DIR: run.resultsDir,
        TECHHUB_INPUT_DIR: stage.inputDir,
        TECHHUB_INPUT_MANIFEST: stage.inputDir ? path.join(stage.inputDir, 'input.json') : '',
        TECHHUB_INPUT_REFS: JSON.stringify(inputs.refs),
        TECHHUB_INPUT_PATHS: JSON.stringify(inputs.paths),
        TECHHUB_INPUT_DIRS: JSON.stringify(inputs.dirs),
        TECHHUB_OUTPUT_DIR: stage.outputDir,
        TECHHUB_WORKSPACE: run.workspace || workspacePath(),
        TECHHUB_TASK_ID: task.id,
        TECHHUB_TASK_NAME: task.name,
        TECHHUB_GROUP_ID: group.id,
        TECHHUB_GROUP_NAME: group.name,
        TECHHUB_GROUP_ROLE: group.role,
        TECHHUB_STAGE_ID: stage.stageId,
        TECHHUB_STAGE_NAME: stage.name,
      };
      const result = await executeCommand(commandLine, cwd, environment, entry, stage, logBase);
      stage.exitCode = result.code;
      stage.stdout = result.stdout;
      stage.stderr = result.stderr;
      stage.endedAt = Date.now();
      if (entry.stopped) {
        stage.status = 'stopped';
        group.status = 'stopped';
        return;
      }
      if (result.code === 0 && result.error === null) {
        stage.status = 'completed';
      } else {
        stage.status = 'failed';
        if (result.error) stage.stderr = `${stage.stderr}\n${result.error}`.trim();
        if (result.signal) stage.stderr = `${stage.stderr}\nProcess ended by ${result.signal}.`.trim();
        group.status = 'failed';
        if (!run.failedStage) run.failedStage = stage.name;
        run.message = `阶段「${stage.name}」执行失败`;
        scheduleSave();
        return;
      }
      scheduleSave();
    }
    group.status = entry.stopped ? 'stopped' : 'completed';
    scheduleSave();
  }

  async function executeRun(run, task, entry) {
    const baseCwd = defaultCwd();
    const rawCwd = typeof task.cwd === 'string' ? task.cwd.trim() : '';
    const cwd = rawCwd === '' ? baseCwd : path.resolve(baseCwd, rawCwd);
    try {
      const stat = await fs.stat(cwd);
      if (!stat.isDirectory()) throw new Error('Working directory is not a directory.');
    } catch (error) {
      run.status = 'failed';
      run.message = `无法使用工作目录 ${cwd}：${error instanceof Error ? error.message : String(error)}`;
      run.endedAt = Date.now();
      activeRuns.delete(run.id);
      await writeRunSnapshot(run).catch((writeError) => {
        console.error('[techhub] failed to write failed run snapshot:', writeError);
      });
      scheduleSave();
      return;
    }
    run.cwd = cwd;

    let datasetEnvironment = {};
    try {
      datasetEnvironment = await materializeDataset(run, task);
    } catch (error) {
      console.error('[techhub] failed to materialize dataset:', error);
    }

    await Promise.all(
      run.groups.map((group) => executeGroup(run, task, group, entry, cwd, datasetEnvironment)),
    );

    if (entry.stopped) {
      run.status = 'stopped';
      run.message = '任务已停止';
    } else if (run.groups.some((group) => group.status === 'failed')) {
      run.status = 'failed';
      if (!run.message) run.message = '任务执行失败';
    } else {
      run.status = 'completed';
      run.message = '全部阶段执行完成';
    }
    run.endedAt = Date.now();
    await writeRunArtifacts(run).catch((error) => {
      console.error('[techhub] failed to write run artifacts:', error);
    });
    activeRuns.delete(run.id);
    scheduleSave();
  }

  function groupParameterValues(group) {
    const values = new Map(normalizeParameterValues(group.parameters).map((parameter) => [parameter.key, parameter.value]));
    const template = store.templates.find((item) => item.id === group.templateId);
    if (template) {
      for (const parameter of template.parameters || []) {
        if (!values.has(parameter.key)) values.set(parameter.key, parameter.defaultValue);
      }
    }
    return [...values.entries()].map(([key, value]) => ({ key, value }));
  }

  async function startRun(task) {
    const run = {
      id: `run-${randomUUID()}`,
      taskId: task.id,
      taskName: task.name,
      datasetId: task.datasetId,
      cwd: task.cwd,
      status: 'running',
      message: '正在执行',
      startedAt: Date.now(),
      endedAt: null,
      groups: task.groups.map((group) => ({
        id: group.id,
        name: group.name,
        role: group.role,
        templateId: group.templateId,
        parameters: groupParameterValues(group),
        status: 'pending',
        stages: group.stageConfigs.map((stage) => ({
          id: `${group.id}:${stage.stageId}`,
          stageId: stage.stageId,
          name: stage.name,
          command: stage.command,
          args: stage.args,
          inputs: stringArray(stage.inputs).filter(Boolean).slice(0, 20),
          outputs: (Array.isArray(stage.outputs) ? stage.outputs : [])
            .map(normalizeOutputDefinition)
            .filter(Boolean)
            .slice(0, 20),
          inputRefs: (Array.isArray(stage.inputRefs) ? stage.inputRefs : [])
            .map(normalizeInputReference)
            .filter(Boolean)
            .slice(0, 40),
          status: 'pending',
          exitCode: null,
          startedAt: null,
          endedAt: null,
          stdout: '',
          stderr: '',
        })),
      })),
    };
    const workspace = await ensureWorkspace();
    run.workspace = workspace;
    run.resultsDir = path.join(workspace, 'runs', run.id);
    await fs.mkdir(run.resultsDir, { recursive: true });
    for (const [groupIndex, group] of run.groups.entries()) {
      group.resultsDir = path.join(run.resultsDir, 'groups', groupFolderName(group, groupIndex));
      for (const [stageIndex, stage] of group.stages.entries()) {
        stage.resultsDir = path.join(group.resultsDir, 'stages', stageFolderName(stage, stageIndex));
        stage.inputDir = path.join(stage.resultsDir, 'input');
        stage.outputDir = path.join(stage.resultsDir, 'output');
      }
    }
    await Promise.all(
      run.groups.flatMap((group) => [
        fs.mkdir(group.resultsDir, { recursive: true }),
        ...group.stages.flatMap((stage) => [
          fs.mkdir(stage.inputDir, { recursive: true }),
          fs.mkdir(stage.outputDir, { recursive: true }),
        ]),
      ]),
    );
    store.runs.unshift(run);
    const entry = { run, children: new Set(), stopped: false, finished: null };
    activeRuns.set(run.id, entry);
    trimRuns();
    scheduleSave();
    await writeRunSnapshot(run).catch((error) => {
      console.error('[techhub] failed to write initial run snapshot:', error);
    });
    entry.finished = executeRun(run, task, entry).catch((error) => {
      run.status = 'failed';
      run.message = error instanceof Error ? error.message : String(error);
      run.endedAt = Date.now();
      void writeRunSnapshot(run).catch((writeError) => {
        console.error('[techhub] failed to write failed run snapshot:', writeError);
      });
      activeRuns.delete(run.id);
      scheduleSave();
      console.error('[techhub] run failed:', error);
    });
    return run;
  }

  async function handle(req, res) {
    const connection = ctx.get('connection');
    if (connection && typeof connection.requestRejection === 'function') {
      const rejection = connection.requestRejection(req);
      if (rejection !== undefined) {
        res.statusCode = rejection;
        res.end();
        return;
      }
    }

    const url = new URL(String(req.url || '/'), 'http://techhub.local');
    const relative = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '');
    const segments = relative === '' ? [] : relative.split('/').filter(Boolean);
    const method = req.method || 'GET';

    try {
      await ensureLoaded();

      if (segments.length === 1 && segments[0] === 'guide') {
        if (method === 'GET') {
          try {
            let markdown;
            try {
              markdown = await fs.readFile(guideOverrideFile, 'utf8');
            } catch (error) {
              if (!error || error.code !== 'ENOENT') throw error;
              markdown = await fs.readFile(SKILL_PATH, 'utf8');
            }
            markdown = stripSkillFrontmatter(markdown);
            res.statusCode = 200;
            res.setHeader('content-type', 'text/markdown; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.end(markdown);
          } catch (error) {
            sendError(res, 500, `Agent guide is unavailable: ${error instanceof Error ? error.message : String(error)}`);
          }
          return;
        }
        if (method === 'PUT') {
          const body = await readJsonBody(req);
          const markdown = isRecord(body) && typeof body.markdown === 'string' ? body.markdown : null;
          if (markdown === null) {
            sendError(res, 400, 'A markdown string is required.');
            return;
          }
          try {
            await fs.mkdir(dataDirectory, { recursive: true });
            const temporary = `${guideOverrideFile}.${process.pid}.tmp`;
            await fs.writeFile(temporary, markdown, 'utf8');
            await fs.rename(temporary, guideOverrideFile);
            refreshAgentSkill();
            sendJson(res, 200, { saved: true, length: markdown.length });
          } catch (error) {
            sendError(res, 500, `Could not save the agent guide: ${error instanceof Error ? error.message : String(error)}`);
          }
          return;
        }
        sendError(res, 405, 'Method not allowed.');
        return;
      }

      if (segments.length === 1 && segments[0] === 'state') {
        if (method === 'GET') {
          sendJson(res, 200, {
            version: store.version,
            datasets: store.datasets,
            templates: store.templates,
            tasks: store.tasks,
            runs: store.runs,
            settings: workspaceInfo(),
            saveError: lastSaveError,
          });
          return;
        }
        if (method === 'PUT' || method === 'POST') {
          const body = await readJsonBody(req);
          const model = normalizeModel(isRecord(body) ? body : {});
          const taskIds = new Set(model.tasks.map((task) => task.id));
          for (const [runId, entry] of activeRuns) {
            if (taskIds.has(entry.run.taskId)) continue;
            entry.stopped = true;
            for (const child of [...entry.children]) void terminateChild(child);
            entry.children.clear();
            entry.run.status = 'stopped';
            entry.run.endedAt = Date.now();
            activeRuns.delete(runId);
          }
          store.datasets = model.datasets;
          store.templates = model.templates;
          store.tasks = model.tasks;
          store.runs = store.runs.filter((run) => taskIds.has(run.taskId));
          scheduleSave();
          await saveChain;
          sendJson(res, 200, {
            version: store.version,
            datasets: store.datasets,
            templates: store.templates,
            tasks: store.tasks,
            runs: store.runs,
            settings: workspaceInfo(),
            saveError: lastSaveError,
          });
          return;
        }
        sendError(res, 405, 'Method not allowed.');
        return;
      }

      if (segments.length === 1 && segments[0] === 'open-folder' && method === 'POST') {
        const body = await readJsonBody(req);
        const datasetId = text(isRecord(body) ? body.datasetId : '').trim();
        const runId = text(isRecord(body) ? body.runId : '').trim();
        const groupId = text(isRecord(body) ? body.groupId : '').trim();
        const stageId = text(isRecord(body) ? body.stageId : '').trim();
        if (datasetId) {
          const dataset = store.datasets.find((item) => item.id === datasetId);
          if (!dataset) {
            sendError(res, 404, 'Dataset not found.');
            return;
          }
          await syncDatasetFiles();
          const target = datasetDirectory(dataset);
          try {
            const stat = await fs.stat(target);
            if (!stat.isDirectory()) throw new Error('Target is not a directory.');
          } catch (error) {
            sendError(res, 404, `Dataset directory is unavailable: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }
          openDirectory(target);
          sendJson(res, 200, { opened: true, path: target });
          return;
        }
        const run = store.runs.find((item) => item.id === runId);
        if (!run) {
          sendError(res, 404, 'Run not found.');
          return;
        }
        let group;
        if (groupId) {
          group = run.groups.find((item) => item.id === groupId);
          if (!group) {
            sendError(res, 404, 'Group not found.');
            return;
          }
        }
        let stage;
        if (stageId) {
          if (group) stage = group.stages.find((item) => item.id === stageId);
          else {
            for (const candidateGroup of run.groups) {
              const found = candidateGroup.stages.find((item) => item.id === stageId);
              if (found) {
                group = candidateGroup;
                stage = found;
                break;
              }
            }
          }
          if (!stage) {
            sendError(res, 404, 'Stage not found.');
            return;
          }
        }
        const target =
          (stage && (stage.resultsDir || (stage.outputDir ? path.dirname(stage.outputDir) : ''))) ||
          (group && (group.resultsDir || run.resultsDir)) ||
          run.resultsDir;
        if (!target) {
          sendError(res, 404, 'Results directory not found.');
          return;
        }
        try {
          const stat = await fs.stat(target);
          if (!stat.isDirectory()) throw new Error('Target is not a directory.');
        } catch (error) {
          sendError(res, 404, `Results directory is unavailable: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        openDirectory(target);
        sendJson(res, 200, { opened: true, path: target });
        return;
      }

      if (segments.length === 2 && segments[0] === 'workspace' && segments[1] === 'export' && method === 'GET') {
        const workspace = await ensureWorkspace();
        const includeTasks = ['1', 'true', 'yes'].includes(String(url.searchParams.get('includeTasks') || '').toLowerCase());
        const manifestPayload = JSON.stringify({ ...workspaceManifest(includeTasks), includeTasks }, null, 2);
        const entries = await collectWorkspaceEntries(workspace, includeTasks, manifestPayload);
        const archive = storeZip(entries);
        const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        res.statusCode = 200;
        res.setHeader('content-type', 'application/zip');
        res.setHeader('content-disposition', `attachment; filename="techhub-workspace-${stamp}.zip"`);
        res.setHeader('content-length', archive.length);
        res.setHeader('cache-control', 'no-store');
        res.end(archive);
        return;
      }

      if (segments.length === 2 && segments[0] === 'workspace' && segments[1] === 'import' && method === 'POST') {
        if (activeRuns.size > 0) {
          sendError(res, 409, 'Stop active runs before importing a workspace.');
          return;
        }
        const buffer = await readBinaryBody(req);
        if (buffer.length === 0) {
          sendError(res, 400, 'Workspace bundle is empty.');
          return;
        }
        let entries;
        try {
          entries = readZipEntries(buffer);
        } catch (error) {
          sendError(res, 400, `Invalid workspace bundle: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        const manifestEntry = entries.find((entry) => entry.name.replace(/\\/g, '/').endsWith('techhub-workspace.json'));
        if (!manifestEntry) {
          sendError(res, 400, 'Workspace bundle does not contain techhub-workspace.json.');
          return;
        }
        let manifest;
        try {
          const raw = manifestEntry.data.toString('utf8');
          manifest = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
        } catch (error) {
          sendError(res, 400, `Workspace manifest is invalid: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        const includeTasks =
          manifest.includeTasks === true ||
          (manifest.includeTasks === undefined && Array.isArray(manifest.tasks) && manifest.tasks.length > 0);
        const model = normalizeModel(manifest);
        const prefix = manifestEntry.name.replace(/\\/g, '/').replace(/techhub-workspace\.json$/, '');
        const writes = [];
        try {
          for (const entry of entries) {
            const normalizedName = entry.name.replace(/\\/g, '/');
            if (normalizedName === manifestEntry.name) continue;
            if (prefix !== '' && !normalizedName.startsWith(prefix)) continue;
            const relative = prefix === '' ? normalizedName : normalizedName.slice(prefix.length);
            if (!relative || relative === 'techhub-workspace.json') continue;
            if (!includeTasks && (relative === 'runs' || relative.startsWith('runs/'))) continue;
            writes.push({ target: resolveWorkspaceEntry(workspacePath(), relative), data: entry.data });
          }
        } catch (error) {
          sendError(res, 400, error instanceof Error ? error.message : String(error));
          return;
        }
        const workspace = await ensureWorkspace();
        await fs.rm(path.join(workspace, 'runs'), { recursive: true, force: true });
        for (const write of writes) {
          await fs.mkdir(path.dirname(write.target), { recursive: true });
          await fs.writeFile(write.target, write.data);
        }
        store.datasets = model.datasets;
        store.templates = model.templates;
        store.tasks = includeTasks ? model.tasks : [];
        store.runs = includeTasks ? await loadRunsFromWorkspace(workspace) : [];
        await persist();
        sendJson(res, 200, {
          version: store.version,
          datasets: store.datasets,
          templates: store.templates,
          tasks: store.tasks,
          runs: store.runs,
          settings: workspaceInfo(),
          imported: {
            datasets: model.datasets.length,
            templates: model.templates.length,
            tasks: includeTasks ? model.tasks.length : 0,
            runs: includeTasks ? store.runs.length : 0,
            includeTasks,
          },
          saveError: lastSaveError,
        });
        return;
      }

      if (segments.length === 1 && segments[0] === 'language' && (method === 'PUT' || method === 'POST')) {
        const body = await readJsonBody(req);
        const language = text(isRecord(body) ? body.language : '').trim();
        if (!LANGUAGE_IDS.has(language)) {
          sendError(res, 400, 'Unknown language.');
          return;
        }
        settings.language = language;
        await persistConfig();
        sendJson(res, 200, { settings: workspaceInfo() });
        return;
      }

      if (segments.length === 1 && segments[0] === 'theme' && (method === 'PUT' || method === 'POST')) {
        const body = await readJsonBody(req);
        const theme = text(isRecord(body) ? body.theme : '').trim();
        if (!THEME_IDS.has(theme)) {
          sendError(res, 400, 'Unknown theme.');
          return;
        }
        settings.theme = theme;
        await persistConfig();
        sendJson(res, 200, { settings: workspaceInfo() });
        return;
      }

      if (segments.length === 1 && segments[0] === 'workspace' && (method === 'PUT' || method === 'POST')) {
        const body = await readJsonBody(req);
        let requested = text(isRecord(body) ? body.path : '').trim();
        if (requested === '') {
          settings.workspace = '';
        } else {
          if (requested === '~') requested = os.homedir();
          else if (requested.startsWith('~/') || requested.startsWith('~\\')) requested = path.join(os.homedir(), requested.slice(2));
          if (!path.isAbsolute(requested)) {
            sendError(res, 400, 'Workspace path must be absolute.');
            return;
          }
          const resolved = path.resolve(requested);
          try {
            await fs.mkdir(resolved, { recursive: true });
            const stat = await fs.stat(resolved);
            if (!stat.isDirectory()) throw new Error('Path is not a directory.');
          } catch (error) {
            sendError(res, 400, `Cannot use this workspace: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }
          settings.workspace = resolved;
        }
        await persistConfig();
        sendJson(res, 200, { settings: workspaceInfo() });
        return;
      }

      if (segments.length === 2 && segments[0] === 'workspace' && segments[1] === 'reset' && method === 'POST') {
        const entries = [...activeRuns.values()];
        for (const entry of entries) {
          entry.stopped = true;
          for (const child of [...entry.children]) void terminateChild(child);
          entry.children.clear();
        }
        await Promise.all(
          entries.map((entry) =>
            entry.finished
              ? Promise.race([entry.finished.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1500))])
              : Promise.resolve(),
          ),
        );
        activeRuns.clear();
        store.tasks = [];
        store.runs = [];
        scheduleSave();
        await saveChain;
        let cleanupError = null;
        try {
          await clearRunDirectories();
        } catch (error) {
          cleanupError = error instanceof Error ? error.message : String(error);
          console.error('[techhub] failed to clear run directories:', error);
        }
        sendJson(res, 200, {
          version: store.version,
          datasets: store.datasets,
          templates: store.templates,
          tasks: store.tasks,
          runs: store.runs,
          settings: workspaceInfo(),
          cleanupError,
          saveError: lastSaveError,
        });
        return;
      }

      if (segments.length === 1 && segments[0] === 'runs' && method === 'POST') {
        const body = await readJsonBody(req);
        const taskId = text(isRecord(body) ? body.taskId : '').trim();
        const task = store.tasks.find((item) => item.id === taskId);
        if (!task) {
          sendError(res, 404, 'Task not found.');
          return;
        }
        if (task.groups.length === 0) {
          sendError(res, 400, 'Task has no groups.');
          return;
        }
        const run = await startRun(task);
        sendJson(res, 201, snapshotRun(run));
        return;
      }

      if (segments.length === 2 && segments[0] === 'runs') {
        const run = store.runs.find((item) => item.id === segments[1]);
        if (!run) {
          sendError(res, 404, 'Run not found.');
          return;
        }
        if (method === 'GET') {
          sendJson(res, 200, snapshotRun(run));
          return;
        }
        if (method === 'DELETE') {
          if (run.status === 'running') {
            sendError(res, 409, 'Stop the run before deleting it.');
            return;
          }
          store.runs = store.runs.filter((item) => item.id !== run.id);
          scheduleSave();
          sendJson(res, 200, { deleted: true, id: run.id });
          return;
        }
        sendError(res, 405, 'Method not allowed.');
        return;
      }

      if (
        segments.length === 5 &&
        segments[0] === 'runs' &&
        segments[2] === 'stages' &&
        segments[4] === 'output' &&
        method === 'GET'
      ) {
        const run = store.runs.find((item) => item.id === segments[1]);
        if (!run) {
          sendError(res, 404, 'Run not found.');
          return;
        }
        let stageId;
        try {
          stageId = decodeURIComponent(segments[3]);
        } catch {
          sendError(res, 400, 'Invalid stage id.');
          return;
        }
        const stage = run.groups.flatMap((group) => group.stages).find((item) => item.id === stageId);
        if (!stage || !stage.outputDir) {
          sendError(res, 404, 'Stage output directory not found.');
          return;
        }
        try {
          const files = await listOutputFiles(stage.outputDir);
          sendJson(res, 200, { dir: stage.outputDir, files });
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : String(error));
        }
        return;
      }

      if (
        segments.length === 6 &&
        segments[0] === 'runs' &&
        segments[2] === 'stages' &&
        segments[4] === 'output' &&
        segments[5] === 'file' &&
        method === 'GET'
      ) {
        const run = store.runs.find((item) => item.id === segments[1]);
        if (!run) {
          sendError(res, 404, 'Run not found.');
          return;
        }
        let stageId;
        try {
          stageId = decodeURIComponent(segments[3]);
        } catch {
          sendError(res, 400, 'Invalid stage id.');
          return;
        }
        const stage = run.groups.flatMap((group) => group.stages).find((item) => item.id === stageId);
        if (!stage || !stage.outputDir) {
          sendError(res, 404, 'Stage output directory not found.');
          return;
        }
        const relative = url.searchParams.get('path') || '';
        if (relative === '') {
          sendError(res, 400, 'A file path is required.');
          return;
        }
        const outputRoot = path.resolve(stage.outputDir);
        const resolved = path.resolve(outputRoot, relative);
        if (resolved !== outputRoot && !resolved.startsWith(`${outputRoot}${path.sep}`)) {
          sendError(res, 400, 'File path is outside the stage output directory.');
          return;
        }
        try {
          const info = await fs.lstat(resolved);
          if (!info.isFile() || info.isSymbolicLink()) {
            sendError(res, 404, 'Output file not found.');
            return;
          }
          if (info.size > 32 * 1024 * 1024) {
            sendError(res, 413, 'Output file is too large to preview.');
            return;
          }
          const data = await fs.readFile(resolved);
          res.statusCode = 200;
          res.setHeader('content-type', contentTypeForFile(resolved));
          res.setHeader('content-length', data.length);
          res.setHeader('cache-control', 'no-store');
          res.end(data);
        } catch (error) {
          if (error && error.code === 'ENOENT') sendError(res, 404, 'Output file not found.');
          else sendError(res, 500, error instanceof Error ? error.message : String(error));
        }
        return;
      }

      if (segments.length === 3 && segments[0] === 'runs' && segments[2] === 'export' && method === 'GET') {
        const run = store.runs.find((item) => item.id === segments[1]);
        if (!run) {
          sendError(res, 404, 'Run not found.');
          return;
        }
        const files = await runExportFiles(run);
        const archive = storeZip(files);
        const baseName = `techhub-${safeFilePart(run.taskName)}-${run.id}.zip`;
        const asciiName = baseName.replace(/[^\x20-\x7e]/g, '_');
        res.statusCode = 200;
        res.setHeader('content-type', 'application/zip');
        res.setHeader('content-length', archive.length);
        res.setHeader('cache-control', 'no-store');
        res.setHeader(
          'content-disposition',
          `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(baseName)}`,
        );
        res.end(archive);
        return;
      }

      if (segments.length === 3 && segments[0] === 'runs' && segments[2] === 'stop' && method === 'POST') {
        const run = store.runs.find((item) => item.id === segments[1]);
        if (!run) {
          sendError(res, 404, 'Run not found.');
          return;
        }
        if (run.status !== 'running') {
          sendJson(res, 200, snapshotRun(run));
          return;
        }
        const entry = activeRuns.get(run.id);
        if (entry) {
          entry.stopped = true;
          const children = [...entry.children];
          entry.children.clear();
          await Promise.all(children.map((child) => terminateChild(child)));
          if (entry.finished) await Promise.race([entry.finished, new Promise((resolve) => setTimeout(resolve, 1500))]);
        }
        run.status = 'stopped';
        run.message = '任务已停止';
        run.endedAt = Date.now();
        for (const group of run.groups) {
          if (group.status !== 'completed') group.status = 'stopped';
          for (const stage of group.stages) {
            if (stage.status === 'pending' || stage.status === 'running') stage.status = 'stopped';
          }
        }
        scheduleSave();
        sendJson(res, 200, snapshotRun(run));
        return;
      }

      sendError(res, 404, 'Unknown TechHub API endpoint.');
    } catch (error) {
      const status = isRecord(error) && typeof error.status === 'number' ? error.status : 500;
      if (status >= 500) console.error('[techhub] api failure:', error);
      sendError(res, status, error instanceof Error ? error.message : String(error));
    }
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: handle,
      }),
    'techhub: /techhub/api',
  );
}
