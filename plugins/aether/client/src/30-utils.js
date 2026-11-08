    // ---------------------------------------------------------- 工具

    function fill(template, values) {
      return String(template == null ? '' : template).replace(/\{(\w+)\}/g, (match, key) =>
        values && values[key] !== undefined ? String(values[key]) : match,
      );
    }

    function tr(t, key, values) {
      return values ? fill(t(key), values) : t(key);
    }

    function pad(value) {
      return String(value).padStart(2, '0');
    }

    function formatDateTime(ms) {
      if (!ms) return '—';
      const date = new Date(ms);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatDuration(start, end) {
      if (!start) return '—';
      const ms = Math.max(0, (end || Date.now()) - start);
      if (ms < 1000) return `${Math.round(ms)}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.round((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }

    function statusText(t, status) {
      return t(`status.${status}`);
    }

    function statusClass(status) {
      return status;
    }

    function environmentLabel(t, environment) {
      if (!environment) return '';
      if (environment.builtin && environment.id === 'local') return t('environment.local');
      return environment.name || environment.id;
    }

    function environmentHint(t, environment) {
      if (!environment) return '';
      if (environment.builtin && environment.id === 'local') return t('environment.localHint');
      return environment.description || '';
    }

    /** 在环境目录里找名字；目录里没有时退回节点快照里的名字。 */
    function environmentName(t, environments, environmentId, fallback) {
      const environment = (environments || []).find((item) => item.id === environmentId);
      if (environment) return environmentLabel(t, environment);
      return fallback || environmentId || t('environment.local');
    }

    function executorLabel(t, executorId) {
      return executorId === 'local' ? t('executor.local') : executorId || t('executor.local');
    }

    function paramsToRows(params) {
      return Object.entries(params || {}).map(([key, value]) => ({ key, value: String(value) }));
    }

    function rowsToParams(rows) {
      const params = {};
      for (const row of rows) {
        const key = String(row.key || '').trim();
        if (!key) continue;
        params[key] = row.value;
      }
      return params;
    }

    function uniqueNodeId(graph, base) {
      const taken = new Set(graph.nodes.map((node) => node.id));
      let index = 1;
      let id = `${base}-${index}`;
      while (taken.has(id)) {
        index += 1;
        id = `${base}-${index}`;
      }
      return id;
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || '');
          resolve(text.slice(text.indexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
    }

    function uniqueExperimentName(base, graphs, suffix) {
      const taken = new Set((graphs || []).map((graph) => String(graph.name || '').toLowerCase()));
      const stem = `${String(base || 'experiment').trim()} · ${suffix}`.slice(0, 110);
      if (!taken.has(stem.toLowerCase())) return stem;
      for (let index = 2; index < 1000; index += 1) {
        const candidate = `${stem} ${index}`;
        if (!taken.has(candidate.toLowerCase())) return candidate;
      }
      return `${stem} ${Date.now().toString(36)}`;
    }

    /** 本地分层；有环时返回 null，画布退回单列布局。 */
    function localLayers(graph) {
      const ids = new Set(graph.nodes.map((node) => node.id));
      const deps = new Map(graph.nodes.map((node) => [node.id, []]));
      const out = new Map(graph.nodes.map((node) => [node.id, []]));
      for (const edge of graph.edges) {
        if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
        deps.get(edge.to).push(edge.from);
        out.get(edge.from).push(edge.to);
      }
      const indegree = new Map(graph.nodes.map((node) => [node.id, deps.get(node.id).length]));
      const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
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
      if (order.length !== graph.nodes.length) return null;
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
