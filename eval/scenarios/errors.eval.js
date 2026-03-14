export function createErrorsScenarios() {
    return [
        {
            name: 'agent handles invalid JSON gracefully',
            run: async (ctx) => {
                const response = await ctx.http.post('/api/chat', {
                    messages: 'not an array'
                });
                if (response.status < 400) {
                    throw new Error('Should return 400+ for invalid request body');
                }
            }
        },
        {
            name: 'agent handles missing required fields',
            run: async (ctx) => {
                const response = await ctx.http.post('/api/chat', {
                    messages: [{ id: '1', role: 'user', content: 'test' }]
                });
                if (response.status < 400) {
                    throw new Error('Should return 400+ for missing chatId');
                }
            }
        },
        {
            name: 'agent handles empty message content',
            timeout: 15000,
            run: async (ctx) => {
                const response = await ctx.http.post('/api/chat', {
                    messages: [
                        { id: '1', role: 'user', content: '' }
                    ],
                    chatId: 'empty-message-test'
                });
                if (response.status !== 200) {
                    throw new Error(`Empty message should be handled, got status ${response.status}`);
                }
            }
        },
        {
            name: 'agent handles very long messages',
            timeout: 30000,
            run: async (ctx) => {
                const longMessage = 'a'.repeat(100000);
                const response = await ctx.http.post('/api/chat', {
                    messages: [
                        { id: '1', role: 'user', content: longMessage }
                    ],
                    chatId: 'long-message-test'
                });
                if (response.status === 200) {
                    const body = await response.text();
                    if (body.length > 0) {
                        return;
                    }
                }
                if (response.status === 413 || response.status === 400) {
                    return;
                }
                throw new Error(`Unexpected response for long message: ${response.status}`);
            }
        },
        {
            name: 'agent recovers from rate limiting',
            timeout: 45000,
            run: async (ctx) => {
                const promises = [];
                for (let i = 0; i < 10; i++) {
                    promises.push(ctx.http.post('/api/chat', {
                        messages: [
                            { id: String(i), role: 'user', content: 'Ping' }
                        ],
                        chatId: 'rate-limit-test-' + i
                    }));
                }
                const results = await Promise.allSettled(promises);
                const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
                if (successful === 0) {
                    throw new Error('All requests failed - possible rate limiting misconfiguration');
                }
            }
        }
    ];
}
