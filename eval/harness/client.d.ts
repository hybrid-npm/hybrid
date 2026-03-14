import type { HttpClient } from './types.js';
export declare function createHttpClient(baseUrl: string): HttpClient;
export declare function waitForAgent(baseUrl: string, timeout?: number): Promise<boolean>;
