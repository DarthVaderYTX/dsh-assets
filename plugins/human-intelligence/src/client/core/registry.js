/**
 * Modality and task registry.
 *
 * A modality module owns one data kind (text, image, video) and composes the
 * task modules it supports. A task module owns its annotation value shape, its
 * editor, its validation, its summary and its option form fields. The registry
 * is the only place that knows the list of modules; the workbench only talks to
 * this interface.
 */
function createRegistry(options) {
  const h = options.h;
  const React = options.React;
  const ui = options.ui;
  const entries = Array.isArray(options.modalityFactories) ? options.modalityFactories : [];

  const modalityList = [];
  const modalityIds = new Set();
  const taskIds = new Set();
  const taskLookup = new Map();

  for (const entry of entries) {
    const descriptor = entry.factory({ h, React, ui, taskFactories: entry.tasks || [] });
    if (!descriptor || typeof descriptor.id !== 'string' || descriptor.id === '') {
      throw new Error('A modality module must declare a non-empty id.');
    }
    if (modalityIds.has(descriptor.id)) throw new Error(`Duplicate modality id: ${descriptor.id}`);
    modalityIds.add(descriptor.id);
    const tasks = Array.isArray(descriptor.tasks) ? descriptor.tasks : [];
    for (const task of tasks) {
      if (!task || typeof task.id !== 'string' || task.id === '') {
        throw new Error(`Modality ${descriptor.id} declared a task without an id.`);
      }
      if (taskIds.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`);
      if (task.modality !== descriptor.id) {
        throw new Error(`Task ${task.id} declares modality ${task.modality} inside ${descriptor.id}.`);
      }
      if (typeof task.Editor !== 'function') throw new Error(`Task ${task.id} must provide an Editor component.`);
      if (typeof task.initial !== 'function') throw new Error(`Task ${task.id} must provide initial().`);
      taskIds.add(task.id);
      taskLookup.set(`${descriptor.id}:${task.id}`, task);
    }
    modalityList.push(descriptor);
  }

  function modalityOf(id) {
    return modalityList.find((descriptor) => descriptor.id === id) || null;
  }

  function taskOf(modalityId, taskId) {
    return taskLookup.get(`${modalityId}:${taskId}`) || null;
  }

  function allTasks() {
    return modalityList.flatMap((descriptor) => descriptor.tasks.map((task) => ({ modality: descriptor, task })));
  }

  function defaultTaskOptions(task) {
    const output = {};
    const fields = Array.isArray(task.options) ? task.options : [];
    for (const field of fields) {
      if (!field || typeof field.key !== 'string') continue;
      if (Array.isArray(field.default)) output[field.key] = [...field.default];
      else if (field.default !== undefined) output[field.key] = field.default;
      else if (field.kind === 'tags') output[field.key] = [];
      else output[field.key] = '';
    }
    return output;
  }

  function resolveOptions(task, taskOptions) {
    const merged = { ...defaultTaskOptions(task), ...(taskOptions && typeof taskOptions === 'object' ? taskOptions : {}) };
    return merged;
  }

  function describe(descriptor) {
    return descriptor;
  }

  function messages() {
    const merged = { zh: {}, en: {} };
    const collect = (owner) => {
      const dictionaries = owner && owner.messages;
      if (!dictionaries || typeof dictionaries !== 'object') return;
      for (const language of Object.keys(dictionaries)) {
        merged[language] = merged[language] || {};
        Object.assign(merged[language], dictionaries[language] || {});
      }
    };
    for (const descriptor of modalityList) {
      collect(descriptor);
      for (const task of descriptor.tasks) collect(task);
    }
    return merged;
  }

  function styles() {
    const output = [];
    for (const descriptor of modalityList) {
      if (typeof descriptor.styles === 'string') output.push(descriptor.styles);
      for (const task of descriptor.tasks) if (typeof task.styles === 'string') output.push(task.styles);
    }
    return output;
  }

  return {
    modalities: modalityList,
    modalityOf,
    taskOf,
    allTasks,
    defaultTaskOptions,
    resolveOptions,
    describe,
    messages,
    styles,
  };
}
