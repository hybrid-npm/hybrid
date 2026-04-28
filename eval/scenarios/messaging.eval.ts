import type { TestScenario, TestContext } from '../harness/types.js'

export function createMessagingScenarios(): TestScenario[] {
  return [
    {
      name: 'agent processes message and returns response',
      timeout: 60000,
      run: async (ctx: TestContext) => {
        const stream = await ctx.http.postStream('/api/chat', {
          messages: [
            { id: '1', role: 'user', content: 'What is 2 + 2?' }
          ],
          chatId: 'math-test'
        })

        let responseText = ''
        let hasUsage = false
        let agentError: string | null = null

        for await (const chunk of stream) {
          if (chunk.startsWith('data: ')) {
            const data = chunk.slice(6)
            if (data === '[DONE]') break

            const parsed = JSON.parse(data)
            if (parsed.type === 'text') {
              responseText += parsed.content
            } else if (parsed.type === 'error') {
              agentError = parsed.content
            } else if (parsed.type === 'usage') {
              hasUsage = true
            }
          }
        }

        if (agentError) {
          throw new Error(`Agent returned error: ${agentError}`)
        }

        if (!responseText) {
          throw new Error('No response text received')
        }

        if (!responseText.includes('4')) {
          throw new Error(`Expected answer to include "4", got: ${responseText}`)
        }

        if (!hasUsage) {
          throw new Error('No usage data in response')
        }
      }
    },
    {
      name: 'agent maintains conversation context',
      timeout: 45000,
      run: async (ctx: TestContext) => {
        const chatId = 'context-test-' + Date.now()

        // First message in the conversation
        let stream = await ctx.http.postStream('/api/chat', {
          messages: [
            { id: '1', role: 'user', content: 'My name is TestUser' }
          ],
          chatId
        })

        let agentError: string | null = null
        for await (const chunk of stream) {
          if (chunk.startsWith('data: ')) {
            const data = chunk.slice(6)
            if (data === '[DONE]') break

            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'error') {
                agentError = parsed.content
              }
            } catch {}
          }
        }

        if (agentError) {
          throw new Error(`First message error: ${agentError}`)
        }

        // Second message — the agent should know the name from the first
        stream = await ctx.http.postStream('/api/chat', {
          messages: [
            { id: '1', role: 'user', content: 'My name is TestUser' },
            { id: '2', role: 'assistant', content: 'Got it!' },
            { id: '3', role: 'user', content: 'What is my name?' }
          ],
          chatId
        })

        let responseText = ''
        agentError = null
        for await (const chunk of stream) {
          if (chunk.startsWith('data: ')) {
            const data = chunk.slice(6)
            if (data === '[DONE]') break

            const parsed = JSON.parse(data)
            if (parsed.type === 'text') {
              responseText += parsed.content
            } else if (parsed.type === 'error') {
              agentError = parsed.content
            }
          }
        }

        if (agentError) {
          throw new Error(`Second message error: ${agentError}`)
        }

        if (!responseText.toLowerCase().includes('testuser')) {
          throw new Error(`Expected response to remember name, got: ${responseText}`)
        }
      }
    },
    {
      name: 'agent handles tool calls',
      timeout: 45000,
      run: async (ctx: TestContext) => {
        const stream = await ctx.http.postStream('/api/chat', {
          messages: [
            { id: '1', role: 'user', content: 'Search my memory for "project"' }
          ],
          chatId: 'tool-test'
        })

        let hasToolCall = false
        let agentError: string | null = null

        for await (const chunk of stream) {
          if (chunk.startsWith('data: ')) {
            const data = chunk.slice(6)
            if (data === '[DONE]') break

            const parsed = JSON.parse(data)
            if (parsed.type === 'tool-call-start' || parsed.type === 'tool-call-end') {
              hasToolCall = true
            } else if (parsed.type === 'error') {
              agentError = parsed.content
            }
          }
        }

        if (agentError) {
          throw new Error(`Agent returned error: ${agentError}`)
        }

        if (!hasToolCall) {
          throw new Error('No tool calls detected in response')
        }
      }
    }
  ]
}
