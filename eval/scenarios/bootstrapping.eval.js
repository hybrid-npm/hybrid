export function createBootstrappingScenarios() {
    return [
        {
            name: 'agent health endpoint responds',
            run: async (ctx) => {
                const response = await ctx.http.get('/api/health');
                if (response.status !== 200) {
                    throw new Error(`Health check failed with status ${response.status}`);
                }
                const body = await response.json();
                if (body.status !== 'healthy') {
                    throw new Error(`Unexpected health status: ${body.status}`);
                }
            }
        },
        {
            name: 'agent accepts chat messages',
            run: async (ctx) => {
                const response = await ctx.http.post('/api/chat', {
                    messages: [
                        { id: '1', role: 'user', content: 'Hello' }
                    ],
                    chatId: 'test-chat'
                });
                if (response.status !== 200) {
                    throw new Error(`Chat endpoint failed with status ${response.status}`);
                }
            }
        },
        {
            name: 'agent responds to messages',
            run: async (ctx) => {
                const stream = await ctx.http.postStream('/api/chat', {
                    messages: [
                        { id: '1', role: 'user', content: 'Say "pong" and nothing else' }
                    ],
                    chatId: 'test-ping'
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
                if (!responseText.toLowerCase().includes('pong')) {
                    throw new Error(`Expected "pong" in response, got: ${responseText}`);
                }
            }
        }
    ];
}
