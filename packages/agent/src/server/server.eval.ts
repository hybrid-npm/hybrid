import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'http'
import { AgentServer } from './src/server/index.js'

describe('Agent Server Integration Eval', () => {
  let server: Server
  let baseUrl: string
  const port = 8454

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.XMTP_ENV = 'dev'
    process.env.AGENT_WALLET_KEY = '0x00000000000000000000000000000000000000000000000000000000000000aa'

    server = createServer()
    
    await new Promise<void>((resolve) => {
      server.listen(port, () => {
        baseUrl = `http://localhost:${port}`
        resolve()
      })
    })
  })

  afterAll(() => {
    server.close()
  })

  it('health endpoint returns 200', async () => {
    const response = await fetch(`${baseUrl}/api/health`)
    expect(response.status).toBe(200)
    
    const body = await response.json() as { status?: string }
    expect(body.status).toBe('healthy')
  })

  it('chat endpoint accepts messages', async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { id: '1', role: 'user', content: 'Hello' }
        ],
        chatId: 'eval-test'
      })
    })

    expect(response.status).toBe(200)
  })

  it('chat endpoint returns SSE stream', async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { id: '1', role: 'user', content: 'Say "test"' }
        ],
        chatId: 'eval-stream-test'
      })
    })

    expect(response.headers.get('content-type')).toContain('text/event-stream')
  })

  it('validates required fields', async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: '1', role: 'user', content: 'test' }]
      })
    })

    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})
