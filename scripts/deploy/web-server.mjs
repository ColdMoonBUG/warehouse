#!/usr/bin/env node
// 管理端生产托管：提供构建好的静态文件，并把 /api 转发给后端（与 vite.config.ts 里的 proxy 行为一致）。
// 只依赖 Node 自带模块，发布包里的 web/ 目录 + 本文件即可独立运行。
//
//   node web-server.mjs --root=<dist 目录> --port=5173 --api=http://127.0.0.1:8888 [--host=0.0.0.0] [--release=名称]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const args = {}
for (const arg of process.argv.slice(2)) {
  const m = /^--([^=]+)=(.*)$/.exec(arg)
  if (m) args[m[1]] = m[2]
}
const root = path.resolve(args.root || path.join(path.dirname(fileURLToPath(import.meta.url)), 'web'))
const port = Number(args.port || 5173)
const host = args.host || '0.0.0.0'
const api = new URL(args.api || 'http://127.0.0.1:8888')
const release = args.release || ''
const assetsDir = path.join(root, 'assets')
const indexFile = path.join(root, 'index.html')
const PROXY_TIMEOUT_MS = 10 * 60 * 1000

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.txt', '.svg', '.ttf', '.eot'])
const HOP_BY_HOP = ['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'trailer']

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`)

if (!fs.existsSync(indexFile)) {
  log(`[web] 找不到 ${indexFile}，发布包不完整`)
  process.exit(1)
}

// 发布包内容不会变，读一次后连同 gzip 结果缓存在内存里（整个 dist 只有几 MB）
const cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }
  if (!stat.isFile()) return null
  const body = fs.readFileSync(file)
  const ext = path.extname(file).toLowerCase()
  const entry = {
    body,
    gzip: COMPRESSIBLE.has(ext) && body.length > 1024 ? zlib.gzipSync(body, { level: 9 }) : null,
    type: TYPES[ext] || 'application/octet-stream',
    etag: `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
    // 带 hash 的打包文件可以永久缓存；index.html 每次都要回源校验，保证发版后立即生效
    immutable: file.startsWith(assetsDir + path.sep),
  }
  cache.set(file, entry)
  return entry
}

function resolveFile(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const file = path.normalize(path.join(root, decoded))
  if (file !== root && !file.startsWith(root + path.sep)) return null
  return file
}

function sendStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end()
    return
  }
  const pathname = (req.url || '/').split('?')[0]
  const file = resolveFile(pathname)
  if (!file) {
    res.writeHead(400)
    res.end()
    return
  }
  let entry = load(file) || load(path.join(file, 'index.html'))
  if (!entry) {
    // 缺失的 js/css 等资源返回 404，不能拿 index.html 冒充；其余路径按单页应用回退到 index.html
    if (path.extname(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }
    entry = load(indexFile)
  }
  const headers = {
    'Content-Type': entry.type,
    ETag: entry.etag,
    'Cache-Control': entry.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
  }
  if (req.headers['if-none-match'] === entry.etag) {
    res.writeHead(304, headers)
    res.end()
    return
  }
  const useGzip = entry.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '')
  const body = useGzip ? entry.gzip : entry.body
  if (useGzip) headers['Content-Encoding'] = 'gzip'
  headers['Content-Length'] = body.length
  res.writeHead(200, headers)
  res.end(req.method === 'HEAD' ? undefined : body)
}

// 不复用到后端的连接：本机回环建连几乎没有开销，也避免空闲连接被后端关闭时的竞态报错
const upstreamAgent = new http.Agent({ keepAlive: false })

function proxy(req, res) {
  const headers = { ...req.headers, host: api.host }
  for (const name of HOP_BY_HOP) delete headers[name]
  const upstream = http.request(
    { hostname: api.hostname, port: api.port || 80, method: req.method, path: req.url, headers, agent: upstreamAgent },
    (up) => {
      const out = { ...up.headers }
      for (const name of HOP_BY_HOP) delete out[name]
      res.writeHead(up.statusCode || 502, out)
      up.pipe(res)
    },
  )
  upstream.setTimeout(PROXY_TIMEOUT_MS, () => upstream.destroy(new Error('后端响应超时')))
  upstream.on('error', (err) => {
    log(`[proxy] ${req.method} ${req.url} 失败: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ code: -1, msg: '后端服务暂时不可用，请稍后重试' }))
    } else {
      res.destroy()
    }
  })
  res.on('close', () => {
    if (!res.writableFinished) upstream.destroy()
  })
  req.pipe(upstream)
}

const server = http.createServer((req, res) => {
  const url = req.url || '/'
  if (url.startsWith('/api')) {
    proxy(req, res)
    return
  }
  if (url === '/__web/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ ok: true, release, root, pid: process.pid }))
    return
  }
  try {
    sendStatic(req, res)
  } catch (err) {
    log(`[web] ${req.method} ${url} 出错: ${err && err.stack ? err.stack : err}`)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
  else socket.destroy()
})
server.on('error', (err) => {
  log(`[web] 启动失败: ${err.message}`)
  process.exit(1)
})
server.listen(port, host, () => {
  log(`[web] 管理端已启动 http://${host}:${port}  release=${release || '-'}  root=${root}  api=${api.origin}`)
})

const shutdown = (signal) => {
  log(`[web] 收到 ${signal}，正在停止`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
