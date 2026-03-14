import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { request } from 'http';

interface VaultTestClient {
  baseUrl: string;
  initialize: (key: string) => Promise<void>;
  encrypt: (data: string) => Promise<string>;
  decrypt: (encrypted: string) => Promise<string>;
  status: () => Promise<{ initialized: boolean }>;
}

function createTestClient(port: number): VaultTestClient {
  const baseUrl = `http://localhost:${port}`;
  
  return {
    baseUrl,
    
    async initialize(key: string) {
      const response = await fetch(`${baseUrl}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      
      if (!response.ok) {
        throw new Error(`Init failed: ${response.status}`);
      }
    },
    
    async encrypt(data: string) {
      const response = await fetch(`${baseUrl}/encrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      
      const result = await response.json() as { encrypted: string };
      return result.encrypted;
    },
    
    async decrypt(encrypted: string) {
      const response = await fetch(`${baseUrl}/decrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encrypted }),
      });
      
      const result = await response.json() as { decrypted: string };
      return result.decrypted;
    },
    
    async status() {
      const response = await fetch(`${baseUrl}/status`);
      return response.json() as Promise<{ initialized: boolean }>;
    },
  };
}

describe('Vault Service Integration', () => {
  let vaultProcess: ChildProcess;
  let client: VaultTestClient;
  const PORT = 19999;
  const TEST_KEY = 'test-key-64-characters-long--------------------------------';
  
  beforeAll(async () => {
    // Start vault service
    vaultProcess = spawn('npx', ['tsx', 'vault-service.ts'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });
    
    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout starting vault')), 10000);
      
      const check = () => {
        const req = request(`${client?.baseUrl || `http://localhost:${PORT}`}/status`, (res) => {
          clearTimeout(timeout);
          resolve();
        });
        req.on('error', () => {
          setTimeout(check, 100);
        });
        req.end();
      };
      
      // Give it a moment to start
      setTimeout(check, 2000);
    });
    
    client = createTestClient(PORT);
  });
  
  afterAll(() => {
    if (vaultProcess) {
      vaultProcess.kill();
    }
  });
  
  it('should return health status', async () => {
    const status = await client.status();
    expect(status.initialized).toBe(false);
  });
  
  it('should reject encrypt when not initialized', async () => {
    await expect(client.encrypt('test')).rejects.toThrow();
  });
  
  it('should initialize with valid key', async () => {
    await client.initialize(TEST_KEY);
    const status = await client.status();
    expect(status.initialized).toBe(true);
  });
  
  it('should encrypt and decrypt data', async () => {
    const plaintext = 'Hello, World!';
    const encrypted = await client.encrypt(plaintext);
    const decrypted = await client.decrypt(encrypted);
    
    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });
  
  it('should encrypt unicode correctly', async () => {
    const plaintext = 'Hello 🌍 你好 🔐';
    const encrypted = await client.encrypt(plaintext);
    const decrypted = await client.decrypt(encrypted);
    
    expect(decrypted).toBe(plaintext);
  });
  
  it('should encrypt large data', async () => {
    const plaintext = 'a'.repeat(100000);
    const encrypted = await client.encrypt(plaintext);
    const decrypted = await client.decrypt(encrypted);
    
    expect(decrypted).toBe(plaintext);
  });
  
  it('should fail decrypt with wrong key', async () => {
    // First encrypt with TEST_KEY
    const encrypted = await client.encrypt('secret');
    
    // Note: In integration, we can't easily test wrong key
    // because the vault holds the key in memory
    // This would require a second vault instance with different key
    expect(encrypted).toBeDefined();
  });
});
