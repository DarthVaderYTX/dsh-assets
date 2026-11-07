function cx() {
  const output = [];
  for (const value of arguments) {
    if (!value) continue;
    if (typeof value === 'string') output.push(value);
  }
  return output.join(' ');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function uid(prefix) {
  return `${prefix || 'id'}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function hashTone(value, count) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return count > 0 ? hash % count : 0;
}

function formatClock(seconds) {
  const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(value / 60);
  const remainder = value - minutes * 60;
  const whole = Math.floor(remainder);
  const tenths = Math.floor((remainder - whole) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenths}`;
}

function formatDate(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ');
  }
}

function formatBytes(bytes) {
  const value = Number.isFinite(bytes) ? bytes : 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function splitTags(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value !== 'string') return [];
  const seen = new Set();
  const output = [];
  for (const entry of value.split(/[,，\n\r;；]+/)) {
    const label = entry.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    output.push(label);
  }
  return output;
}

function readStringList(source, key, fallback) {
  if (source && Array.isArray(source[key])) {
    const list = source[key].filter((entry) => typeof entry === 'string' && entry.trim() !== '');
    if (list.length > 0) return list;
  }
  return Array.isArray(fallback) ? fallback : [];
}

function interpolate(message, params) {
  if (typeof message !== 'string' || !params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] === undefined || params[name] === null ? match : String(params[name]),
  );
}

function makeTranslator(props) {
  const base =
    props && typeof props.t === 'function'
      ? props.t
      : props && typeof props.fallbackTranslate === 'function'
        ? props.fallbackTranslate
        : null;
  if (!base) {
    return (key, params) => (params ? interpolate(key, params) : key);
  }
  return (key, params) => {
    let value;
    try {
      value = base(key, params);
    } catch {
      value = key;
    }
    if (typeof value !== 'string' || value === '' || value === key) {
      if (params) return interpolate(typeof value === 'string' && value !== key ? value : key, params);
    }
    return params ? interpolate(value, params) : value;
  };
}

/**
 * Plugin-local translator. It reads only the plugin's own dictionaries, so the
 * plugin language selector never depends on (or changes) the DSH locale.
 */
function makeLocalTranslator(language, dictionaries, fallbackLanguage) {
  const primary = dictionaries && dictionaries[language] ? dictionaries[language] : {};
  const secondary =
    dictionaries && dictionaries[fallbackLanguage] ? dictionaries[fallbackLanguage] : {};
  return (key, params) => {
    let value = primary[key];
    if (typeof value !== 'string') value = secondary[key];
    if (typeof value !== 'string') value = key;
    return params ? interpolate(value, params) : value;
  };
}

function mergeDictionaries(base, extra) {
  const output = { zh: { ...(base.zh || {}) }, en: { ...(base.en || {}) } };
  const languages = extra && typeof extra === 'object' ? Object.keys(extra) : [];
  for (const language of languages) {
    output[language] = output[language] || {};
    Object.assign(output[language], extra[language] || {});
  }
  return output;
}

function normalizeTaskOptions(taskOptions) {
  return taskOptions && typeof taskOptions === 'object' && !Array.isArray(taskOptions) ? taskOptions : {};
}

function itemDisplayName(item, index) {
  const name = typeof item?.name === 'string' ? item.name.trim() : '';
  if (name) return name;
  return `#${index + 1}`;
}

function itemSummary(item) {
  if (!item) return '';
  if (typeof item.text === 'string') {
    return item.text.replace(/\s+/g, ' ').trim().slice(0, 90);
  }
  return item.name || '';
}

function collectItemStrings(value, output, depth = 0) {
  if (value === null || value === undefined || depth > 6) return;
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectItemStrings(entry, output, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value)) collectItemStrings(entry, output, depth + 1);
  }
}

function itemSearchText(item) {
  const strings = [];
  collectItemStrings(item, strings);
  return strings.join('\n').toLowerCase();
}
