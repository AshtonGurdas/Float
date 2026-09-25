import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { handleApi } from './core.js'

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk as Buffer))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host || 'localhost'
  const url = `http://${host}${req.url || '/'}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(', '))
  }
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return new Request(url, { method, headers })
  const body = await readBody(req)
  return new Request(url, { method, headers, body })
}

async function writeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.end(Buffer.from(await response.arrayBuffer()))
}

export function floatApi(): Plugin {
  return {
    name: 'float-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next()
          return
        }
        toRequest(req)
          .then(handleApi)
          .then((response) => writeResponse(res, response))
          .catch((error: unknown) => {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Server error' }))
          })
      })
    },
  }
}
