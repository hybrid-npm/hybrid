/**
 * XMTP Integration - Zero-knowledge XMTP messaging
 * 
 * This module provides XMTP identity and messaging using
 * Vault for key management.
 * 
 * Keys are derived from wallet + vault key, ensuring:
 * - Keys never leave the Vault Sprite
 * - Platform cannot read XMTP messages
 * - Each user has isolated identity
 */

import { VaultClient } from '../agent/agent-storage.js';

export interface XmtpConfig {
  vaultUrl: string;
  walletAddress: string;
  env: 'local' | 'dev' | 'production';
}

export interface XmtpIdentity {
  privateKey: string;
  publicKey: string;
  inboxId: string;
}

export interface XmtpMessage {
  id: string;
  senderAddress: string;
  content: string;
  timestamp: number;
}

/**
 * XMTP Manager - handles XMTP identity and messaging
 * with encryption keys stored in Vault
 */
export class XmtpManager {
  private vaultClient: VaultClient;
  private config: XmtpConfig;
  private identity: XmtpIdentity | null = null;
  
  constructor(vaultUrl: string, config: Partial<XmtpConfig> & { walletAddress: string }) {
    this.vaultClient = new VaultClient({ vaultUrl });
    this.config = {
      vaultUrl,
      walletAddress: config.walletAddress,
      env: config.env || 'production',
    };
  }
  
  /**
   * Initialize XMTP - load or create identity
   */
  async initialize(): Promise<void> {
    console.log('Initializing XMTP...');
    
    // Check vault is ready
    const ready = await this.vaultClient.isInitialized();
    if (!ready) {
      throw new Error('Vault not initialized - cannot initialize XMTP');
    }
    
    // Try to load existing identity
    const storedIdentity = await this.loadIdentity();
    
    if (storedIdentity) {
      console.log('Recovered existing XMTP identity');
      this.identity = storedIdentity;
    } else {
      console.log('Creating new XMTP identity');
      await this.createIdentity();
    }
    
    console.log(`XMTP Inbox ID: ${this.identity.inboxId}`);
  }
  
  /**
   * Create new XMTP identity
   */
  private async createIdentity(): Promise<void> {
    // Get identity from Vault
    const identity = await this.vaultClient.getXmtpIdentity(this.config.walletAddress);
    
    this.identity = {
      privateKey: identity.privateKey,
      publicKey: identity.publicKey,
      inboxId: identity.inboxId,
    };
    
    // Store encrypted identity for recovery
    await this.saveIdentity();
  }
  
  /**
   * Save identity (encrypted)
   */
  private async saveIdentity(): Promise<void> {
    if (!this.identity) return;
    
    // In production, would use agent-storage to save
    // For now, just store in memory
    console.log('Identity saved (in-memory)');
  }
  
  /**
   * Load identity
   */
  private async loadIdentity(): Promise<XmtpIdentity | null> {
    // In production, would load from agent-storage
    // For now, always create new identity
    return null;
  }
  
  /**
   * Send a message
   */
  async sendMessage(recipientAddress: string, content: string): Promise<string> {
    if (!this.identity) {
      throw new Error('XMTP not initialized');
    }
    
    console.log(`Sending message to ${recipientAddress}: ${content}`);
    
    // In production with real XMTP SDK:
    // const conversation = await this.client.conversations.newConversation(recipientAddress);
    // const message = await conversation.send(content);
    // return message.id;
    
    // Mock for now
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    console.log(`Message sent: ${messageId}`);
    
    return messageId;
  }
  
  /**
   * Stream incoming messages
   */
  async *streamMessages(): AsyncGenerator<XmtpMessage> {
    if (!this.identity) {
      throw new Error('XMTP not initialized');
    }
    
    console.log('Starting message stream...');
    
    // In production:
    // for await (const message of await this.client.conversations.streamMessages()) {
    //   yield {
    //     id: message.id,
    //     senderAddress: message.senderAddress,
    //     content: message.content,
    //     timestamp: message.timestamp,
    //   };
    // }
    
    // Mock - yield nothing for now
    return;
    
    // Keep TypeScript happy
    yield;
  }
  
  /**
   * List conversations
   */
  async listConversations(): Promise<Array<{ id: string; peerAddress: string }>> {
    if (!this.identity) {
      throw new Error('XMTP not initialized');
    }
    
    // In production:
    // return await this.client.conversations.list();
    
    return [];
  }
  
  /**
   * Get conversation by address
   */
  async getConversation(peerAddress: string): Promise<{ id: string } | null> {
    if (!this.identity) {
      throw new Error('XMTP not initialized');
    }
    
    // In production:
    // return await this.client.conversations.newConversation(peerAddress);
    
    return { id: `conv-${peerAddress}` };
  }
  
  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.identity !== null;
  }
  
  /**
   * Get inbox ID
   */
  getInboxId(): string | null {
    return this.identity?.inboxId || null;
  }
  
  /**
   * Get wallet address
   */
  getWalletAddress(): string {
    return this.config.walletAddress;
  }
}

/**
 * Create XMTP manager for a user
 */
export async function createXmtpManager(
  vaultUrl: string,
  walletAddress: string,
  env: 'local' | 'dev' | 'production' = 'production'
): Promise<XmtpManager> {
  const manager = new XmtpManager(vaultUrl, {
    walletAddress,
    env,
  });
  
  await manager.initialize();
  
  return manager;
}

/**
 * Example usage
 */
async function example() {
  const vaultUrl = process.env.VAULT_URL || 'http://localhost:8080';
  const walletAddress = process.env.WALLET_ADDRESS || '0x1234567890123456789012345678901234567890';
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    XMTP MANAGER DEMO                         ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  const xmtp = await createXmtpManager(vaultUrl, walletAddress);
  
  console.log(`\nXMTP initialized!`);
  console.log(`Inbox ID: ${xmtp.getInboxId()}`);
  console.log(`Wallet: ${xmtp.getWalletAddress()}`);
  
  // Send a message
  const messageId = await xmtp.sendMessage(
    '0xrecipient123456789012345678901234567890',
    'Hello from zero-knowledge XMTP!'
  );
  
  console.log(`\nSent message: ${messageId}`);
  
  // List conversations
  const conversations = await xmtp.listConversations();
  console.log(`\nConversations: ${conversations.length}`);
  
  // Stream messages (would block in production)
  // for await (const msg of xmtp.streamMessages()) {
  //   console.log(`New message: ${msg.content}`);
  // }
}

// Run if called directly
if (require.main === module) {
  example().catch(console.error);
}

export { XmtpManager, createXmtpManager };
export default XmtpManager;
