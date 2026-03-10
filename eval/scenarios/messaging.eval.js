export function createMessagingScenarios() {
    return [
        {
            name: 'agent processes message and returns response',
            timeout: 60000,
            run: async (ctx) => {
                const stream = await ctx.http.postStream('/api/chat', {
                    messages: [
                        { id: '1', role: 'user', content: 'What is 2 + 2?' }
                    ],
                    chatId: 'math-test'
                });
                let responseText = '';
                let hasUsage = false;
                for await (const chunk of stream) {
                    if (chunk.startsWith('data: ')) {
                        const data = chunk.slice(6);
                        if (data === '[DONE]')
                            break;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'text') {
                                responseText += parsed.content;
                            }
                            else if (parsed.type === 'usage') {
                                hasUsage = true;
                            }
                        }
                        catch {
                            // Skip invalid JSON
                        }
                    }
                }
                if (!responseText) {
                    throw new Error('No response text received');
                }
                if (!responseText.includes('4')) {
                    throw new Error(`Expected answer to include "4", got: ${responseText}`);
                }
                if (!hasUsage) {
                    throw new Error('No usage data in response');
                }
            }
        },
        {
            name: 'agent maintains conversation context',
            timeout: 60000,
            run: async (ctx) => {
                const chatId = 'context-test-' + Date.now();
                let stream = await ctx.http.postStream('/api/chat', {
                    messages: [
                        { id: '1', role: 'user', content: 'My name is TestUser' }
                    ],
                    chatId
                });
                for await (const chunk of stream) {
                    if (chunk.startsWith('data: ') && chunk.includes('[DONE]')) {
                        break;
                    }
                }
                stream = await ctx.http.postStream('/api/chat', {
                    messages: [
                        { id: '1', role: 'user', content: 'What is my name?' }
                    ],
                    chatId
                });
                let responseText = '';
                for await (const chunk of stream) {
                    if (chunk.startsWith('data: ')) {
                        const data = chunk.slice(6);
                        if (data === '[DONE]')
                            break;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'text') {
                                responseText += parsed.content;
                            }
                        }
                        catch {
                            // Skip invalid JSON
                        }
                    }
                }
                if (!responseText.toLowerCase().includes('testuser')) {
                    throw new Error(`Expected response to remember name, got: ${responseText}`);
                }
            }
        },
        {
            name: 'agent handles tool calls',
            timeout: 60000,
            run: async (ctx) => {
                const stream = await ctx.http.postStream('/api/chat', {
                    messages: [
                        { id: '1', role: 'user', content: 'Search my memory for "project"' }
                    ],
                    chatId: 'tool-test'
                });
                let hasToolCall = false;
                for await (const chunk of stream) {
                    if (chunk.startsWith('data: ')) {
                        const data = chunk.slice(6);
                        if (data === '[DONE]')
                            break;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'tool-call-start' || parsed.type === 'tool-call-end') {
                                hasToolCall = true;
                            }
                        }
                        catch {
                            // Skip invalid JSON
                        }
                    }
                }
                if (!hasToolCall) {
                    throw new Error('No tool calls detected in response');
                }
            }
        }
    ];
}
