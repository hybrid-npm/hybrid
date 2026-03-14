/**
 * Agent Storage - Encrypted storage wrapper for Agent Sprite
 * 
 * This module provides:
 * - VaultStorage: HTTP client to Vault service
 * - EncryptedFileStorage: Transparent file encryption
 * - AgentStorage: High-level API for agent data
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
  statSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import type {
  VaultConfig,
  VaultStatus,
  EncryptResponse,
  DecryptResponse,
  SignResponse,
  XmtpIdentityResponse,
  SessionData,
} from '../shared/types.js';

// ============================================================================
// VaultClient
// ============================================================================

/**
 * HTTP client for Vault service
 */
export class VaultClient {
  private baseUrl: string;
  private timeout: number;
  
  constructor(config: VaultConfig) {
    // Remove trailing slash
    this.baseUrl = config.vaultUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
  }
  
  private async request<T>(endpoint: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      
      if (!response.ok) {
        const error = await response.text();
        let parsedError: { error?: string };
        try {
          parsedError = JSON.parse(error);
        } catch {
          parsedError = { error: `HTTP ${response.status}: ${error}` };
        }
        throw new Error(parsedError.error || `Vault API error: ${response.status}`);
      }
      
      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Vault request timeout after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  /**
   * Check vault status
   */
  async getStatus(): Promise<VaultStatus> {
    return this.request<VaultStatus>('/status');
  }
  
  /**
   * Check if vault is initialized
   */
  async isInitialized(): Promise<boolean> {
    try {
      const status = await this.getStatus();
      return status.initialized;
    } catch {
      return false;
    }
  }
  
  /**
   * Initialize vault with encryption key
   */
  async initialize(key: string): Promise<void> {
    await this.request<{ status: string }>('/init', { key });
  }
  
  /**
   * Re-initialize after cold start
   */
  async reinitialize(key: string): Promise<void> {
    await this.request<{ status: string }>('/reinit', { key });
  }
  
  /**
   * Encrypt data
   */
  async encrypt(data: string): Promise<string> {
    const result = await this.request<EncryptResponse>('/encrypt', { data });
    return result.encrypted;
  }
  
  /**
   * Decrypt data
   */
  async decrypt(encrypted: string): Promise<string> {
    const result = await this.request<DecryptResponse>('/decrypt', { encrypted });
    return result.decrypted;
  }
  
  /**
   * Sign a message
   */
  async sign(message: string): Promise<string> {
    const result = await this.request<SignResponse>('/sign', { message });
    return result.signature;
  }
  
  /**
   * Get XMTP identity
   */
  async getXmtpIdentity(walletAddress: string): Promise<XmtpIdentityResponse> {
    return this.request<XmtpIdentityResponse>('/xmtp/identity', { walletAddress });
  }
  
  /**
   * Derive a sub-key for specific purpose
   */
  async deriveKey(purpose:> {
    const string): Promise<string result = await this.request<{ key: string }>('/derive-key', { purpose });
    return result.key;
  }
}

// ============================================================================
// EncryptedFileStorage
// ============================================================================

/**
 * File storage that transparently encrypts/decrypts files
 * using the Vault service
 */
export class EncryptedFileStorage {
  private client: VaultClient;
  private basePath: string;
  
  constructor(vaultUrl: string, basePath: string) {
    this.client = new VaultClient({ vaultUrl });
    this.basePath = basePath;
    
    // Ensure base path exists
    this.ensureDirectory(this.basePath);
  }
  
  private ensureDirectory(path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }
  
  private getFilePath(filename: string): string {
    return join(this.basePath, filename);
  }
  
  private getMetaPath(filename: string): string {
    return join(this.basePath, `.${filename}.meta`);
  }
  
  /**
   * Write encrypted file
   */
  async write(filename: string, data: string): Promise<void> {
    const encrypted = await this.client.encrypt(data);
    const filepath = this.getFilePath(filename);
    
    // Ensure directory exists
    this.ensureDirectory(dirname(filepath));
    
    // Write encrypted data
    writeFileSync(filepath, encrypted, 'utf8');
    
    // Write metadata
    const meta = {
      filename,
      encrypted: true,
      created: Date.now(),
      size: data.length,
    };
    writeFileSync(this.getMetaPath(filename), JSON.stringify(meta), 'utf8');
  }
  
  /**
   * Read and decrypt file
   */
  async read(filename: string): Promise<string> {
    const filepath = this.getFilePath(filename);
    
    if (!existsSync(filepath)) {
      throw new Error(`File not found: ${filename}`);
    }
    
    const encrypted = readFileSync(filepath, 'utf8');
    const decrypted = await this.client.decrypt(encrypted);
    return decrypted;
  }
  
  /**
   * Check if file exists
   */
  exists(filename: string): boolean {
    return existsSync(this.getFilePath(filename));
  }
  
  /**
   * Delete file
   */
  delete(filename: string): void {
    const filepath = this.getFilePath(filename);
    const metaPath = this.getMetaPath(filename);
    
    if (existsSync(filepath)) {
      unlinkSync(filepath);
    }
    if (existsSync(metaPath)) {
      unlinkSync(metaPath);
    }
  }
  
  /**
   * List files
   */
  list(): string[] {
    if (!existsSync(this.basePath)) {
      return [];
    }
    
    return readdirSync(this.basePath)
      .filter((f) => !f.startsWith('.')) // Skip hidden files
      .filter((f) => {
        try {
          return statSync(join(this.basePath, f)).isFile();
        } catch {
          return false;
        }
      });
  }
  
  /**
   * Write JSON file (encrypted)
   */
  async writeJSON<T>(filename: string, data: T): Promise<void> {
    await this.write(filename, JSON.stringify(data, null, 2));
  }
  
  /**
   * Read JSON file (decrypted)
   */
  async readJSON<T>(filename: string): Promise<T> {
    const content = await this.read(filename);
    return JSON.parse(content) as T;
  }
  
  /**
   * Get client for direct vault access
   */
  getClient(): VaultClient {
    return this.client;
  }
}

// ============================================================================
// AgentStorage
// ============================================================================

/**
 * High-level storage API for Agent
 * Provides convenient methods for common operations
 */
export class AgentStorage {
  private encryptedFs: EncryptedFileStorage;
  private client: VaultClient;
  private basePath: string;
  
  constructor(vaultUrl: string, basePath: string = '/home/sprite/agent/data') {
    this.client = new VaultClient({ vaultUrl });
    this.encryptedFs = new EncryptedFileStorage(vaultUrl, basePath);
    this.basePath = basePath;
  }
  
  /**
   * Check if vault is ready
   */
  async isReady(): Promise<boolean> {
    return this.client.isInitialized();
  }
  
  /**
   * Ensure vault is initialized, throw if not
   */
  async requireReady(): Promise<void> {
    const ready = await this.isReady();
    if (!ready) {
      throw new Error('Vault not initialized - user must authenticate');
    }
  }
  
  // ==================== Session Management ====================
  
  /**
   * Save agent session
   */
  async saveSession(sessionId: string, sessionData: SessionData): Promise<void> {
    await this.requireReady();
    
    const data: SessionData & { savedAt: number } = {
      ...sessionData,
      savedAt: Date.now(),
    };
    
    await this.encryptedFs.writeJSON(`sessions/${sessionId}.json`, data);
  }
  
  /**
   * Load agent session
   */
  async loadSession(sessionId: string): Promise<SessionData | null> {
    await this.requireReady();
    
    try {
      return await this.encryptedFs.readJSON<SessionData>(`sessions/${sessionId}.json`);
    } catch {
      return null;
    }
  }
  
  /**
   * List all sessions
   */
  async listSessions(): Promise<string[]> {
    const sessionsPath = join(this.basePath, 'sessions');
    if (!existsSync(sessionsPath)) {
      return [];
    }
    
    return readdirSync(sessionsPath)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  }
  
  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.requireReady();
    this.encryptedFs.delete(`sessions/${sessionId}.json`);
  }
  
  // ==================== Key-Value Store ====================
  
  /**
   * Store encrypted value
   */
  async set(key: string, value: string): Promise<void> {
    await this.requireReady();
    await this.encryptedFs.write(`${key}.enc`, value);
  }
  
  /**
   * Retrieve encrypted value
   */
  async get(key: string): Promise<string | null> {
    await this.requireReady();
    
    try {
      return await this.encryptedFs.read(`${key}.enc`);
    } catch {
      return null;
    }
  }
  
  /**
   * Delete key
   */
  async delete(key: string): Promise<void> {
    await this.requireReady();
    this.encryptedFs.delete(`${key}.enc`);
  }
  
  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    return this.encryptedFs.exists(`${key}.enc`);
  }
  
  // ==================== JSON Store ====================
  
  /**
   * Store JSON object
   */
  async setJSON<T>(key: string, value: T): Promise<void> {
    await this.set(key, JSON.stringify(value));
  }
  
  /**
   * Retrieve JSON object
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  
  // ==================== XMTP Data ====================
  
  /**
   * Store XMTP data
   */
  async saveXmtpData(key: string, data: string): Promise<void> {
    await this.set(`xmtp.${key}`, data);
  }
  
  /**
   * Load XMTP data
   */
  async loadXmtpData(key: string): Promise<string | null> {
    return this.get(`xmtp.${key}`);
  }
  
  /**
   * Get XMTP identity from vault
   */
  async getXmtpIdentity(walletAddress: string): Promise<XmtpIdentityResponse> {
    await this.requireReady();
    return this.client.getXmtpIdentity(walletAddress);
  }
  
  // ==================== Utilities ====================
  
  /**
   * Get the underlying Vault client for direct access
   */
  getVaultClient(): VaultClient {
    return this.client;
  }
  
  /**
   * Get base path
   */
  getBasePath(): string {
    return this.basePath;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create AgentStorage from environment variables
 */
export function createAgentStorage(): AgentStorage {
  const vaultUrl = process.env.VAULT_URL;
  
  if (!vaultUrl) {
    throw new Error('VAULT_URL environment variable is required');
  }
  
  const basePath = process.env.AGENT_DATA_PATH || '/home/sprite/agent/data';
  
  return new AgentStorage(vaultUrl, basePath);
}

/**
 * Create VaultClient from environment variable
 */
export function createVaultClient(): VaultClient {
  const vaultUrl = process.env.VAULT_URL;
  
  if (!vaultUrl) {
    throw new Error('VAULT_URL environment variable is required');
  }
  
  return new VaultClient({ vaultUrl });
}
