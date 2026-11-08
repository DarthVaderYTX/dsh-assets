// Proxy-aware JSON transport for FootPrint.
//
// The DSH host runs inside Electron on a desktop that may use a local HTTP
// proxy. Node's built-in fetch ignores the Windows system proxy, so this module
// implements a small HTTPS client that can CONNECT through an HTTP proxy and
// then speak HTTP/1.1 to the origin. It only needs Node's standard library.

import { execFile } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { promisify } from 'node:util'
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'

const execFileAsync = promisify(execFile)
const MAX_BODY = 6 * 1024 * 1024
let proxyPromise = null

function parseProxy(raw) {
  if (!raw) return null
  let value = String(raw).trim()
  if (!value) return null
  if (value.includes('=')) {
    const entries = value
      .split(';')
      .map((entry) => entry.split('='))
      .filter((entry) => entry.length === 2)
    const preferred =
      entries.find(([key]) => key.toLowerCase() === 'https') ||
      entries.find(([key]) => key.toLowerCase() === 'http') ||
      entries[0]
    value = preferred ? preferred[1] : ''
  }
  if (!value) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`
  let url = null
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:') return null
  const port = Number(url.port || 80)
  if (!url.hostname || !Number.isInteger(port) || port <= 0) return null
  return {
    hostname: url.hostname,
    port,
    auth: url.username
      ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`
      : '',
  }
}

async function detectProxy() {
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
    return parseProxy(
      process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy,
    )
  }
  if (process.platform !== 'win32') return null
  try {
    const { stdout } = await execFileAsync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
      { windowsHide: true, timeout: 4000, encoding: 'utf8' },
    )
    if (!/ProxyEnable\s+REG_DWORD\s+0x1/i.test(stdout)) return null
    const line = stdout
      .split(/\r?\n/)
      .find((entry) => /ProxyServer\s+REG_SZ/i.test(entry))
    if (!line) return null
    const server = line.replace(/^.*ProxyServer\s+REG_SZ\s+/i, '').trim()
    return parseProxy(server)
  } catch {
    return null
  }
}

export function getProxy() {
  if (!proxyPromise) proxyPromise = detectProxy()
  return proxyPromise
}

function openTunnel(proxy, targetHost, targetPort, timeout) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.hostname)
    let buffer = Buffer.alloc(0)
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(new Error('Proxy connection timed out'))
    }, timeout)
    const fail = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      reject(error)
    }
    socket.once('error', fail)
    socket.once('connect', () => {
      const auth = proxy.auth
        ? `Proxy-Authorization: Basic ${Buffer.from(proxy.auth).toString('base64')}\r\n`
        : ''
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
          `Host: ${targetHost}:${targetPort}\r\n` +
          `${auth}Proxy-Connection: keep-alive\r\n\r\n`,
      )
    })
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      const end = buffer.indexOf('\r\n\r\n')
      if (end < 0) return
      socket.removeListener('data', onData)
      if (settled) return
      settled = true
      clearTimeout(timer)
      const head = buffer.subarray(0, end).toString('latin1')
      if (!/^HTTP\/1\.[01] 200/.test(head)) {
        socket.destroy()
        reject(new Error(head.split('\r\n')[0] || 'Proxy CONNECT failed'))
        return
      }
      const rest = buffer.subarray(end + 4)
      if (rest.length) socket.unshift(rest)
      resolve(socket)
    }
    socket.on('data', onData)
  })
}

function wrapTls(socket, hostname, timeout) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({
      socket,
      servername: hostname,
      ALPNProtocols: ['http/1.1'],
    })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      secure.destroy()
      reject(new Error('TLS handshake timed out'))
    }, timeout)
    secure.once('secureConnect', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(secure)
    })
    secure.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
  })
}

function readAll(socket, timeout) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(new Error('Response timed out'))
    }, timeout)
    socket.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        reject(new Error('Response is too large'))
        return
      }
      chunks.push(chunk)
    })
    socket.once('end', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(Buffer.concat(chunks))
    })
    socket.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
  })
}

function dechunk(body) {
  const parts = []
  let offset = 0
  while (offset < body.length) {
    const lineEnd = body.indexOf('\r\n', offset)
    if (lineEnd < 0) break
    const size = Number.parseInt(
      body.subarray(offset, lineEnd).toString('latin1').split(';')[0],
      16,
    )
    if (!Number.isFinite(size) || size <= 0) break
    offset = lineEnd + 2
    if (offset + size > body.length) break
    parts.push(body.subarray(offset, offset + size))
    offset += size + 2
  }
  return Buffer.concat(parts)
}

function decodeBody(body, headers) {
  const encoding = String(headers['content-encoding'] || '').toLowerCase()
  if (!encoding || encoding === 'identity') return body
  try {
    if (encoding.includes('gzip')) return gunzipSync(body)
    if (encoding.includes('deflate')) return inflateSync(body)
    if (encoding.includes('br')) return brotliDecompressSync(body)
  } catch {
    // Return the raw bytes; JSON parsing will produce a useful error.
  }
  return body
}

function parseResponse(buffer) {
  const end = buffer.indexOf('\r\n\r\n')
  if (end < 0) throw new Error('Malformed HTTP response')
  const lines = buffer.subarray(0, end).toString('latin1').split('\r\n')
  const status = Number((lines[0].match(/^HTTP\/1\.[01] (\d{3})/) || [])[1])
  const headers = {}
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
  }
  let body = buffer.subarray(end + 4)
  if (String(headers['transfer-encoding'] || '').toLowerCase().includes('chunked')) {
    body = dechunk(body)
  } else if (headers['content-length']) {
    const length = Number(headers['content-length'])
    if (Number.isFinite(length)) body = body.subarray(0, length)
  }
  body = decodeBody(body, headers)
  return { status, headers, text: body.toString('utf8') }
}

function requestHeaders(extra) {
  return {
    accept: 'application/json',
    'accept-encoding': 'identity',
    connection: 'close',
    'user-agent': 'FootPrint-DSH/1.0',
    ...extra,
  }
}

async function requestViaProxy(target, headers, proxy, timeout) {
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80))
  if (target.protocol !== 'https:') {
    return requestDirect(target, headers, timeout)
  }
  const tunnel = await openTunnel(proxy, target.hostname, port, timeout)
  const socket = await wrapTls(tunnel, target.hostname, timeout)
  const response = readAll(socket, timeout)
  const lines = [
    `GET ${target.pathname}${target.search} HTTP/1.1`,
    `Host: ${target.host}`,
    `User-Agent: ${headers['user-agent']}`,
    `Accept: ${headers.accept}`,
    `Accept-Language: ${headers['accept-language'] || 'en'}`,
    'Accept-Encoding: identity',
    'Connection: close',
    '',
    '',
  ]
  socket.write(lines.join('\r\n'))
  return parseResponse(await response)
}

function requestDirect(target, headers, timeout) {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? https : http
    const request = transport.request(
      {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: {
          ...headers,
          Host: target.host,
        },
        agent: false,
      },
      (response) => {
        const chunks = []
        let size = 0
        let done = false
        response.on('data', (chunk) => {
          size += chunk.length
          if (size > MAX_BODY) {
            if (done) return
            done = true
            response.destroy()
            reject(new Error('Response is too large'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => {
          if (done) return
          done = true
          const headerLines = Object.entries(response.headers)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
            .join('\r\n')
          const firstLine = `HTTP/1.1 ${response.statusCode} ${response.statusMessage || ''}`
          try {
            const head = Buffer.from(`${firstLine}\r\n${headerLines}\r\n\r\n`)
            resolve(parseResponse(Buffer.concat([head, ...chunks])))
          } catch (error) {
            reject(error)
          }
        })
        response.on('error', (error) => {
          if (done) return
          done = true
          reject(error)
        })
      },
    )
    request.setTimeout(timeout, () => request.destroy(new Error('Request timed out')))
    request.on('error', reject)
    request.end()
  })
}

/**
 * Fetch JSON from an HTTPS URL, using the detected HTTP proxy when present.
 * Redirects are followed up to four times.
 */
export async function fetchJson(url, headers = {}, timeoutMs = 9000) {
  const proxy = await getProxy()
  let current = new URL(url)
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const merged = requestHeaders(headers)
    const timeout = Math.max(2000, timeoutMs)
    const response =
      proxy && current.protocol === 'https:'
        ? await requestViaProxy(current, merged, proxy, timeout)
        : await requestDirect(current, merged, timeout)
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.location) {
      current = new URL(response.headers.location, current)
      continue
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`)
    }
    try {
      return JSON.parse(response.text)
    } catch {
      throw new Error('Invalid JSON response')
    }
  }
  throw new Error('Too many redirects')
}
