/**
 * Unit Tests - Core encryption and key derivation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCipheriv, randomBytes, createDecipheriv, createHash } from 'crypto';

// Reimplement encryption for testing (same as vault-service)
function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString('base64');
}

function decrypt(ciphertext: string, key: Buffer): string {
  const buffer = Buffer.from(ciphertext, 'base64');
  
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

function deriveKey(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('Encryption', () => {
  const key = Buffer.alloc(32, 'test-key-32-bytes!!');
  
  it('should encrypt and decrypt a string', () => {
    const plaintext = 'Hello, World!';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    
    expect(decrypted).toBe(plaintext);
  });
  
  it('should produce different ciphertext each time (random IV)', () => {
    const plaintext = 'Hello, World!';
    const encrypted1 = encrypt(plaintext, key);
    const encrypted2 = encrypt(plaintext, key);
    
    expect(encrypted1).not.toBe(encrypted2);
  });
  
  it('should handle empty string', () => {
    const plaintext = '';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    
    expect(decrypted).toBe(plaintext);
  });
  
  it('should handle unicode characters', () => {
    const plaintext = 'Hello 🌍 你好 مرحبا 🔐';
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    
    expect(decrypted).toBe(plaintext);
  });
  
  it('should handle long strings', () => {
    const plaintext = 'a'.repeat(100000);
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    
    expect(decrypted).toBe(plaintext);
  });
  
  it('should fail with wrong key', () => {
    const plaintext = 'Hello, World!';
    const encrypted = encrypt(plaintext, key);
    const wrongKey = Buffer.alloc(32, 'wrong-key-32-bytes!!!');
    
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });
  
  it('should fail with tampered ciphertext', () => {
    const plaintext = 'Hello, World!';
    const encrypted = encrypt(plaintext, key);
    
    // Tamper with the ciphertext
    const buffer = Buffer.from(encrypted, 'base64');
    buffer[20] = buffer[20] ^ 0xFF;
    const tampered = buffer.toString('base64');
    
    expect(() => decrypt(tampered, key)).toThrow();
  });
});

describe('Key Derivation', () => {
  it('should derive consistent key from signature', () => {
    const signature = '0x1234567890abcdef';
    const key1 = deriveKey(signature);
    const key2 = deriveKey(signature);
    
    expect(key1).toBe(key2);
  });
  
  it('should produce 64 character hex key', () => {
    const key = deriveKey('test-signature');
    
    expect(key.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });
  
  it('should produce different keys for different signatures', () => {
    const key1 = deriveKey('signature-1');
    const key2 = deriveKey('signature-2');
    
    expect(key1).not.toBe(key2);
  });
});

describe('Key Validation', () => {
  function validateKey(key: string): boolean {
    return /^[0-9a-f]{64}$/i.test(key);
  }
  
  it('should accept valid 64-char hex key', () => {
    expect(validateKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(true);
  });
  
  it('should reject key that is too short', () => {
    expect(validateKey('0123456789abcdef')).toBe(false);
  });
  
  it('should reject key with non-hex characters', () => {
    expect(validateKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg')).toBe(false);
  });
  
  it('should reject empty key', () => {
    expect(validateKey('')).toBe(false);
  });
});
