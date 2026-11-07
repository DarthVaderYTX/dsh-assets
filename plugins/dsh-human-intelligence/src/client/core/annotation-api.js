/**
 * Browser-side annotation API.
 *
 * This is the only browser module allowed to call `fetch` for annotation data.
 * The UI and annotation app talk to this facade; a task-scoped facade obtained
 * from `forTask(taskId)` exposes exactly the read/status/result operations an
 * annotation app needs. Dataset mutation is exposed separately under
 * `AnnotationApi.datasets`, so an annotation app cannot change its dataset.
 */
const AnnotationApi = (() => {
  const BASE = '/human-intelligence/api';

  async function request(pathname, options) {
    const settings = options || {};
    const init = {
      method: settings.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: settings.signal,
    };
    if (settings.body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(settings.body);
    }
    let response;
    try {
      response = await fetch(`${BASE}${pathname}`, init);
    } catch (error) {
      if (error && error.name === 'AbortError') throw error;
      throw new Error('NETWORK');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && payload.error && typeof payload.error.message === 'string'
          ? payload.error.message
          : `HTTP ${response.status}`;
      const failure = new Error(message);
      failure.status = response.status;
      throw failure;
    }
    return payload;
  }

  async function upload(file) {
    let response;
    try {
      response = await fetch(`${BASE}/media?name=${encodeURIComponent(file.name || 'upload')}`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
    } catch {
      throw new Error('NETWORK');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        payload && payload.error && typeof payload.error.message === 'string'
          ? payload.error.message
          : `HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload.media;
  }

  const tasks = {
    list() {
      return request('/state').then((state) => state.tasks);
    },
    create(input) {
      return request('/tasks', { method: 'POST', body: input });
    },
    get(taskId) {
      return request(`/tasks/${encodeURIComponent(taskId)}`);
    },
    update(taskId, patch) {
      return request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'PATCH', body: patch });
    },
    remove(taskId) {
      return request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    },
    exportUrl(taskId) {
      return `${BASE}/tasks/${encodeURIComponent(taskId)}/export`;
    },
  };

  const datasets = {
    list() {
      return request('/datasets').then((payload) => payload.datasets);
    },
    create(input) {
      return request('/datasets', { method: 'POST', body: input });
    },
    get(datasetId) {
      return request(`/datasets/${encodeURIComponent(datasetId)}`);
    },
    update(datasetId, patch) {
      return request(`/datasets/${encodeURIComponent(datasetId)}`, { method: 'PATCH', body: patch });
    },
    remove(datasetId) {
      return request(`/datasets/${encodeURIComponent(datasetId)}`, { method: 'DELETE' });
    },
    addItems(datasetId, items) {
      return request(`/datasets/${encodeURIComponent(datasetId)}/items`, {
        method: 'POST',
        body: { items },
      });
    },
    removeItem(datasetId, itemId) {
      return request(
        `/datasets/${encodeURIComponent(datasetId)}/items/${encodeURIComponent(itemId)}`,
        { method: 'DELETE' },
      );
    },
  };

  const annotations = {
    save(taskId, itemId, input) {
      return request(
        `/tasks/${encodeURIComponent(taskId)}/dataset/items/${encodeURIComponent(itemId)}/annotation`,
        { method: 'PUT', body: input },
      );
    },
    setStatus(taskId, itemId, status) {
      return request(
        `/tasks/${encodeURIComponent(taskId)}/dataset/items/${encodeURIComponent(itemId)}/status`,
        { method: 'PATCH', body: { status } },
      );
    },
  };

  const tools = {
    list() {
      return request('/tools').then((payload) => payload.tools);
    },
    create(input) {
      return request('/tools', { method: 'POST', body: input });
    },
    remove(toolId) {
      return request(`/tools/${encodeURIComponent(toolId)}`, { method: 'DELETE' });
    },
  };

  const media = {
    upload,
    url(file) {
      return `${BASE}/media/${encodeURIComponent(file)}`;
    },
  };

  function state() {
    return request('/state');
  }

  function forTask(taskId) {
    return {
      taskId,
      get: () => tasks.get(taskId),
      getDataset: () => tasks.get(taskId).then((detail) => detail.dataset),
      saveAnnotation: (itemId, value, status) => annotations.save(taskId, itemId, { value, status }),
      setStatus: (itemId, status) => annotations.setStatus(taskId, itemId, status),
      exportUrl: () => tasks.exportUrl(taskId),
    };
  }

  return { state, tasks, datasets, annotations, tools, media, forTask };
})();
