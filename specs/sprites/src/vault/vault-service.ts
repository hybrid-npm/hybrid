/**
 * Vault Service - Zero-Knowledge Key Management
 * 
 * This service holds encryption keys in memory only, providing
 * HTTP API for encrypt/decrypt/sign operations.
 * 
 * Keys are NEVER written to disk - they exist only in RAM.
 * If the service restarts, keys are lost (intentional security feature).
 */

import express, { Request, Response, NextFunction } from 'express';
import { createCipheriv, randomBytes, createDecipheriv, createHash } from 'crypto';

const app = express();

// ============================================================================
// Types
// ============================================================================

interface VaultState {
  encryptionKey: Buffer | null;
  initialized: boolean;
  createdAt: number;
  requestCount: number;
}

interface ApiResponse<T = unknown> {
  status?: string;
  error?: string;
  [key: string]: T | string | undefined;
}

// ============================================================================
// Configuration
// ============================================================================

const PORT = parseInt(process.env.PORT || '8080', 10);
const INITIAL_KEY = process.env.INITIAL_KEY || null;

// ============================================================================
// State
// ============================================================================

const state: VaultState = {
  encryptionKey: null,
  initialized: false,
  createdAt: Date.now(),
  requestCount: 0,
};

// ============================================================================
// Middleware
// ============================================================================

app.use(express.json({ limit: '10mb' }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  state.requestCount++;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Encrypt plaintext using AES-256-GCM
 * Format: iv(16) + authTag(16) + ciphertext
 */
function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine: IV + AuthTag + Ciphertext
  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString('base64');
}

/**
 * Decrypt ciphertext using AES-256-GCM
 */
function decrypt(ciphertext: string, key: Buffer): string {
  const buffer = Buffer.from(ciphertext, 'base64');
  
  if (buffer.length < 33) {
    throw new Error('Invalid ciphertext: too short');
  }
  
  const iv = buffer.subarray(0, 16);
  const authTag = buffer.subarray(16, 32);
  const encrypted = buffer.subarray(32);
  
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Derive a 64-character hex key from any input
 */
function deriveKey(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Validate that a key is properly formatted (64 hex chars)
 */
function validateKey(key: string): boolean {
  return /^[0-9a-f]{64}$/i.test(key);
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /status
 * Health check - returns initialization state
 */
app.get('/status', (_req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - state.createdAt) / 1000);
  
  res.json({
    initialized: state.initialized,
    uptime,
    requestCount: state.requestCount,
    version: '1.0.0',
  } as ApiResponse);
});

/**
 * POST /init
 * Initialize vault with user's encryption key
 * 
 * Request body: { key: "64-hex-character-key" }
 */
app.post('/init', (req: Request, res: Response) => {
  const { key } = req.body;
  
  // Validate key presence
  if (!key || typeof key !== 'string') {
    return res.status(400).json({
      error: 'key is required',
    } as ApiResponse);
  }
  
  // Validate key format
  if (!validateKey(key)) {
    return res.status(400).json({
      error: 'key must be exactly 64 hexadecimal characters',
    } as ApiResponse);
  }
  
  try {
    // Store key in memory (never on disk)
    state.encryptionKey = Buffer.from(key, 'hex');
    state.initialized = true;
    
    console.log(`[${new Date().toISOString()}] Vault initialized successfully`);
    
    res.json({
      status: 'ok',
      message: 'Vault initialized with encryption key',
    } as ApiResponse);
  } catch (err) {
    console.error('Init error:', err);
    res.status(500).json({
      error: 'failed to initialize vault',
    } as ApiResponse);
  }
});

/**
 * POST /reinit
 * Re-initialize after cold start (same as init but for existing users)
 */
app.post('/reinit', (req: Request, res: Response) => {
  const { key } = req.body;
  
  if (!key || typeof key !== 'string' || !validateKey(key)) {
    return res.status(400).json({
      error: 'valid 64-hex-character key required',
    } as ApiResponse);
  }
  
  state.encryptionKey = Buffer.from(key, 'hex');
  state.initialized = true;
  
  console.log(`[${new Date().toISOString()}] Vault re-initialized`);
  
  res.json({
    status: 'ok',
    message: 'Vault re-initialized',
  } as ApiResponse);
});

/**
 * POST /encrypt
 * Encrypt data with user's key
 * 
 * Request body: { data: "plaintext to encrypt" }
 * Response: { encrypted: "base64-encoded-ciphertext" }
 */
app.post('/encrypt', (req: Request, res: Response) => {
  // Check initialization
  if (!state.initialized || !state.encryptionKey) {
    return res.status(401).json({
      error: 'vault not initialized. Call /init or /reinit first.',
    } as ApiResponse);
  }
  
  const { data } = req.body;
  
  // Validate data
  if (!data || typeof data !== 'string') {
    return res.status(400).json({
      error: 'data is required and must be a string',
    } as ApiResponse);
  }
  
  try {
    const encrypted = encrypt(data, state.encryptionKey);
    
    res.json({
      encrypted,
    } as ApiResponse);
  } catch (err) {
    console.error('Encryption error:', err);
    res.status(500).json({
      error: 'encryption failed',
    } as ApiResponse);
  }
});

/**
 * POST /decrypt
 * Decrypt data with user's key
 * 
 * Request body: { encrypted: "base64-encoded-ciphertext" }
 * Response: { decrypted: "plaintext" }
 */
app.post('/decrypt', (req: Request, res: Response) => {
  // Check initialization
  if (!state.initialized || !state.encryptionKey) {
    return res.status(401).json({
      error: 'vault not initialized. Call /init or /reinit first.',
    } as ApiResponse);
  }
  
  const { encrypted } = req.body;
  
  // Validate encrypted data
  if (!encrypted || typeof encrypted !== 'string') {
    return res.status(400).json({
      error: 'encrypted is required and must be a string',
    } as ApiResponse);
  }
  
  try {
    const decrypted = decrypt(encrypted, state.encryptionKey);
    
    res.json({
      decrypted,
    } as ApiResponse);
  } catch (err) {
    console.error('Decryption error:', err);
    res.status(400).json({
      error: 'decryption failed - invalid data or wrong key',
    } as ApiResponse);
  }
});

/**
 * POST /sign
 * Sign a message with user's key
 * Used for cryptographic operations
 * 
 * Request body: { message: "message to sign" }
 * Response: { signature: "hex-signature" }
 */
app.post('/sign', (req: Request, res: Response) => {
  // Check initialization
  if (!state.initialized || !state.encryptionKey) {
    return res.status(401).json({
      error: 'vault not initialized. Call /init or /reinit first.',
    } as ApiResponse);
  }
  
  const { message } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      error: 'message is required and must be a string',
    } as ApiResponse);
  }
  
  try {
    // Create signature by hashing message + key
    const signature = createHash('sha256')
      .update(message, 'utf8')
      .update(state.encryptionKey)
      .digest('hex');
    
    res.json({
      signature,
    } as ApiResponse);
  } catch (err) {
    console.error('Sign error:', err);
    res.status(500).json({
      error: 'signing failed',
    } as ApiResponse);
  }
});

/**
 * POST /derive-key
 * Derive a sub-key from the master key
 * Useful for creating separate keys for different purposes
 * 
 * Request body: { purpose: "session-encryption" }
 * Response: { key: "derived-hex-key" }
 */
app.post('/derive-key', (req: Request, res: Response) => {
  // Check initialization
  if (!state.initialized || !state.encryptionKey) {
    return res.status(401).json({
      error: 'vault not initialized. Call /init or /reinit first.',
    } as ApiResponse);
  }
  
  const { purpose } = req.body;
  
  if (!purpose || typeof purpose !== 'string') {
    return res.status(400).json({
      error: 'purpose is required',
    } as ApiResponse);
  }
  
  try {
    // Derive key for specific purpose
    const derivedKey = createHash('sha256')
      .update(state.encryptionKey)
      .update(purpose, 'utf8')
      .digest('hex');
    
    res.json({
      key: derivedKey,
    } as ApiResponse);
  } catch (err) {
    console.error('Key derivation error:', err);
    res.status(500).json({
      error: 'key derivation failed',
    } as ApiResponse);
  }
});

// ============================================================================
// Error Handling
// ============================================================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'internal server error',
  } as ApiResponse);
});

// ============================================================================
// 404 Handler
// ============================================================================

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'not found',
    availableEndpoints: [
      'GET /status',
      'POST /init',
      'POST /reinit',
      'POST /encrypt',
      'POST /decrypt',
      'POST /sign',
      'POST /derive-key',
    ],
  } as ApiResponse);
});

// ============================================================================
// Initialize with provided key (optional)
// ============================================================================

if (INITIAL_KEY && validateKey(INITIAL_KEY)) {
  console.log('Initializing vault with provided key...');
  state.encryptionKey = Buffer.from(INITIAL_KEY, 'hex');
  state.initialized = true;
  console.log('Vault auto-initialized');
}

// ============================================================================
// Start Server
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    VAULT SERVICE                             ║
║            Zero-Knowledge Key Management                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Listening on: http://0.0.0.0:${PORT}                         ║
║                                                               ║
║  Endpoints:                                                  ║
║  • GET  /status         - Health check                      ║
║  • POST /init           - Initialize with key                ║
║  • POST /reinit         - Re-initialize after restart        ║
║  • POST /encrypt        - Encrypt data                      ║
║  • POST /decrypt        - Decrypt data                      ║
║  • POST /sign           - Sign message                      ║
║  • POST /derive-key    - Derive sub-key                    ║
║                                                               ║
║  ⚠️  Keys are stored in MEMORY only!                         ║
║      Service restart = keys lost (intentional)               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

function shutdown() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  SHUTDOWN: Encryption keys LOST forever!                      ║
║  This is INTENTIONAL - cold start requires re-authentication  ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  // Clear keys from memory
  state.encryptionKey = null;
  state.initialized = false;
  
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
