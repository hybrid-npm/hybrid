export function createHttpClient(baseUrl) {
    const getUrl = (path) => {
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `${baseUrl}${cleanPath}`;
    };
    return {
        async get(path) {
            const response = await fetch(getUrl(path), {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            return {
                status: response.status,
                json: () => response.json(),
                text: () => response.text()
            };
        },
        async post(path, body) {
            const response = await fetch(getUrl(path), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined
            });
            return {
                status: response.status,
                json: () => response.json(),
                text: () => response.text()
            };
        },
        async postStream(path, body) {
            const response = await fetch(getUrl(path), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined
            });
            if (!response.body) {
                throw new Error('Response body is null');
            }
            const decoder = new TextDecoder();
            const reader = response.body.getReader();
            async function* iter() {
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        if (buffer.trim()) {
                            yield buffer;
                        }
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (line.trim()) {
                            yield line;
                        }
                    }
                }
            }
            return iter();
        }
    };
}
export async function waitForAgent(baseUrl, timeout = 60000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) {
                return true;
            }
        }
        catch {
            // Agent not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return false;
}
