// 极简 YAML 子集：够描述 AutoEval 的模板配置文件，也够让用户手改。
//
// 支持：块状映射、块状序列、`- key: value` 形式的序列项、行内 `[a, b]` 与 `{a: b}`、
// 单双引号字符串、数字/布尔/null、`#` 注释、`|` 与 `>` 文本块。
// 不支持：锚点/别名、多文档、复杂标签——遇到就直接报错，不去猜。

export function parseYaml(text) {
  const lines = []
  const raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n')
  for (let index = 0; index < raw.length; index += 1) {
    const source = raw[index]
    if (!source.trim()) continue
    const indent = source.length - source.trimStart().length
    const body = source.slice(indent)
    if (body.startsWith('#')) continue
    if (body === '---' || body === '...') continue
    if (source.includes('\t') && /^\s*\t/.test(source)) {
      throw new Error(`第 ${index + 1} 行：YAML 不允许用制表符缩进`)
    }
    const content = stripComment(body).trimEnd()
    if (!content) continue
    lines.push({ indent, content, lineNo: index + 1 })
  }
  if (lines.length === 0) return null
  const [value, next] = parseNode(lines, 0, lines[0].indent)
  if (next < lines.length) {
    throw new Error(`第 ${lines[next].lineNo} 行：缩进对不上`)
  }
  return value
}

export function stringifyYaml(value, options = {}) {
  const comments = options.comments || {}
  const lines = []
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    lines.push(scalar(value))
    return `${lines.join('\n')}\n`
  }
  emitMapping(value, 0, '', lines, comments)
  return `${lines.join('\n')}\n`
}

// ---------------------------------------------------------------- 解析

function stripComment(text) {
  let single = false
  let double = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\\' && double) {
      index += 1
      continue
    }
    if (char === "'" && !double) single = !single
    else if (char === '"' && !single) double = !double
    else if (char === '#' && !single && !double) {
      if (index === 0 || /\s/.test(text[index - 1])) return text.slice(0, index)
    }
  }
  return text
}

function parseNode(lines, index, indent) {
  const line = lines[index]
  if (line.content === '-' || line.content.startsWith('- ')) return parseSequence(lines, index, indent)
  return parseMapping(lines, index, indent)
}

function parseMapping(lines, index, indent) {
  const out = {}
  let cursor = index
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent < indent) break
    if (line.indent > indent) throw new Error(`第 ${line.lineNo} 行：缩进多了`)
    if (line.content === '-' || line.content.startsWith('- ')) break
    const { key, rest } = splitKey(line)
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new Error(`第 ${line.lineNo} 行：键「${key}」重复了`)
    }
    if (rest === '') {
      const next = lines[cursor + 1]
      if (next && next.indent > indent) {
        const [value, consumed] = parseNode(lines, cursor + 1, next.indent)
        out[key] = value
        cursor = consumed
      } else {
        out[key] = null
        cursor += 1
      }
      continue
    }
    if (/^[|>][-+]?$/.test(rest)) {
      const [text, consumed] = readBlockScalar(lines, cursor + 1, indent, rest)
      out[key] = text
      cursor = consumed
      continue
    }
    out[key] = parseScalar(rest, line.lineNo)
    cursor += 1
  }
  return [out, cursor]
}

function parseSequence(lines, index, indent) {
  const out = []
  let cursor = index
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent < indent) break
    if (line.indent > indent) throw new Error(`第 ${line.lineNo} 行：缩进多了`)
    if (!(line.content === '-' || line.content.startsWith('- '))) break
    const rest = line.content === '-' ? '' : line.content.slice(2).trim()
    if (rest === '') {
      const next = lines[cursor + 1]
      if (next && next.indent > indent) {
        const [value, consumed] = parseNode(lines, cursor + 1, next.indent)
        out.push(value)
        cursor = consumed
      } else {
        out.push(null)
        cursor += 1
      }
      continue
    }
    if (looksLikeMapping(rest)) {
      // "- key: value" 起的映射项：把首行当成 indent+2 的普通映射行继续解
      const sub = [{ indent: indent + 2, content: rest, lineNo: line.lineNo }]
      let next = cursor + 1
      while (next < lines.length && lines[next].indent > indent) {
        sub.push(lines[next])
        next += 1
      }
      const [value, consumed] = parseMapping(sub, 0, indent + 2)
      out.push(value)
      cursor += consumed
      continue
    }
    out.push(parseScalar(rest, line.lineNo))
    cursor += 1
  }
  return [out, cursor]
}

function readBlockScalar(lines, index, indent, marker) {
  const parts = []
  let cursor = index
  let blockIndent = null
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (line.indent <= indent) break
    if (blockIndent == null) blockIndent = line.indent
    parts.push(' '.repeat(Math.max(0, line.indent - blockIndent)) + line.content)
    cursor += 1
  }
  if (marker.startsWith('>')) return [parts.join(' '), cursor]
  if (marker.endsWith('-')) return [parts.join('\n'), cursor]
  return [parts.length > 0 ? `${parts.join('\n')}\n` : '', cursor]
}

function looksLikeMapping(text) {
  if (text.startsWith('[') || text.startsWith('{')) return false
  try {
    splitKey({ content: text, lineNo: 0 })
    return true
  } catch {
    return false
  }
}

function splitKey(line) {
  let single = false
  let double = false
  for (let index = 0; index < line.content.length; index += 1) {
    const char = line.content[index]
    if (char === '\\' && double) {
      index += 1
      continue
    }
    if (char === "'" && !double) single = !single
    else if (char === '"' && !single) double = !double
    else if (char === ':' && !single && !double) {
      const next = line.content[index + 1]
      if (next === undefined || next === ' ') {
        let key = line.content.slice(0, index).trim()
        if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
          key = key.slice(1, -1)
        }
        if (!key) throw new Error(`第 ${line.lineNo} 行：冒号前面缺少键名`)
        return { key, rest: line.content.slice(index + 1).trim() }
      }
    }
  }
  throw new Error(`第 ${line.lineNo} 行：缺少「key: value」里的冒号`)
}

function parseScalar(text, lineNo) {
  const value = text.trim()
  if (value === '') return null
  if (value === '{}') return {}
  if (value === '[]') return []
  if (value.startsWith('[') && !value.endsWith(']')) {
    throw new Error(`第 ${lineNo} 行：方括号没有闭合`)
  }
  if (value.startsWith('{') && !value.endsWith('}')) {
    throw new Error(`第 ${lineNo} 行：花括号没有闭合`)
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return splitFlow(inner, lineNo).map((item) => parseScalar(item, lineNo))
  }
  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return {}
    const out = {}
    for (const part of splitFlow(inner, lineNo)) {
      const { key, rest } = splitKey({ content: part.trim(), lineNo })
      out[key] = parseScalar(rest, lineNo)
    }
    return out
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return unquote(value, lineNo)
  }
  if (value === 'true' || value === 'True' || value === 'yes') return true
  if (value === 'false' || value === 'False' || value === 'no') return false
  if (value === 'null' || value === '~') return null
  if (/^-?\d+$/.test(value)) return Number(value)
  if (/^-?\d*\.\d+$/.test(value)) return Number(value)
  return value
}

function splitFlow(inner, lineNo) {
  const parts = []
  let current = ''
  let depth = 0
  let single = false
  let double = false
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index]
    if (char === '\\' && double) {
      current += char + (inner[index + 1] || '')
      index += 1
      continue
    }
    if (char === "'" && !double) single = !single
    else if (char === '"' && !single) double = !double
    if (!single && !double) {
      if (char === '[' || char === '{') depth += 1
      else if (char === ']' || char === '}') depth -= 1
      else if (char === ',' && depth === 0) {
        parts.push(current)
        current = ''
        continue
      }
    }
    current += char
  }
  if (single || double) throw new Error(`第 ${lineNo} 行：引号没有闭合`)
  if (current.trim()) parts.push(current)
  return parts.map((item) => item.trim())
}

function unquote(text, lineNo) {
  const body = text.slice(1, -1)
  if (text.startsWith("'")) return body.replace(/''/g, "'")
  try {
    return JSON.parse(`"${body.replace(/"/g, '\\"')}"`)
  } catch {
    // 保守处理：不认识的转义就原样留着
    return body.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

// ---------------------------------------------------------------- 序列化

function emitMapping(value, indent, path, lines, comments) {
  const pad = ' '.repeat(indent)
  for (const [key, item] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key
    const comment = comments[here] ? `  # ${comments[here]}` : ''
    if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push(`${pad}${key}: []${comment}`)
        continue
      }
      const flat = item.every((entry) => entry === null || typeof entry !== 'object')
      const flow = flat ? `[${item.map((entry) => scalar(entry)).join(', ')}]` : ''
      if (flat && pad.length + key.length + flow.length <= 96) {
        lines.push(`${pad}${key}: ${flow}${comment}`)
        continue
      }
      lines.push(`${pad}${key}:${comment}`)
      for (const entry of item) lines.push(`${' '.repeat(indent + 2)}- ${flowValue(entry)}`)
      continue
    }
    if (item && typeof item === 'object') {
      if (Object.keys(item).length === 0) {
        lines.push(`${pad}${key}: {}${comment}`)
        continue
      }
      lines.push(`${pad}${key}:${comment}`)
      emitMapping(item, indent + 2, here, lines, comments)
      continue
    }
    lines.push(`${pad}${key}: ${scalar(item)}${comment}`)
  }
}

/** 数组/对象在一行里的写法，只用于非平坦的序列项 */
function flowValue(item) {
  if (Array.isArray(item)) return `[${item.map((entry) => flowValue(entry)).join(', ')}]`
  if (item && typeof item === 'object') {
    const pairs = Object.entries(item).map(([key, value]) => `${key}: ${flowValue(value)}`)
    return `{${pairs.join(', ')}}`
  }
  return scalar(item)
}

function scalar(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  const text = String(value)
  if (text === '') return '""'
  if (needsQuote(text)) return JSON.stringify(text)
  return text
}

function needsQuote(text) {
  if (/^\s|\s$/.test(text)) return true
  if (/[:#]/.test(text)) return true
  if (/^[-?*&!|>%@`"'[\]{},]/.test(text)) return true
  if (/^(true|false|null|yes|no|~)$/i.test(text)) return true
  if (/^-?\d+(\.\d+)?$/.test(text)) return true
  return false
}
