/**
 * Shared Types - Common type definitions for the Sprites platform
 */

export interface VaultConfig {
  vaultUrl: string;
  timeout?: number;
}

export interface VaultStatus {
  initialized: boolean;
  uptime: number;
  requestCount: number;
  version: string;
}

export interface EncryptRequest {
  data: string;
}

export interface EncryptResponse {
  encrypted: string;
}

export interface DecryptRequest {
  encrypted: string;
}

export interface DecryptResponse {
  decrypted: string;
}

export interface SignRequest {
  message: string;
}

export interface SignResponse {
  signature: string;
}

export interface XmtpIdentityRequest {
  walletAddress: string;
}

export interface XmtpIdentityResponse {
  privateKey: string;
  publicKey: string;
  inboxId: string;
}

export interface DeriveKeyRequest {
  purpose: string;
}

export interface DeriveKeyResponse {
  key: string;
}

export interface InitRequest {
  key: string;
}

export interface InitResponse {
  status: string;
  message?: string;
}

export interface ApiError {
  error: string;
  availableEndpoints?: string[];
}

export interface SessionData {
  id: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
  }>;
  context: {
    workingDirectory: string;
    variables: Record<string, string>;
  };
  createdAt: number;
  updatedAt: number;
}

export interface UserConfig {
  userId: string;
  vaultUrl: string;
  agentUrl: string;
  createdAt: string;
}
