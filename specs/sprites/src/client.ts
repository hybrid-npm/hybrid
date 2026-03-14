/**
 * CLI Client - Command-line interface for Vault service
 * 
 * Usage:
 *   npx tsx src/client.ts <command> [args]
 * 
 * Examples:
 *   npx tsx src/client.ts status
 *   npx tsx src/client.ts init 64-character-hex-key-here--------------------------------
 *   npx tsx src/client.ts encrypt "Hello World"
 *   npx tsx src/client.ts decrypt <base64>
 *   npx tsx src/client.ts sign "message"
 *   npx tsx src/client.ts xmtp-identity 0x123...
 */

import process from 'process';

// ============================================================================
// Configuration
// ============================================================================

const VAULT_URL = process.env.VAULT_URL || 'http://localhost:8080';

// ============================================================================
// API Client
// ============================================================================

interface VaultResponse<T = unknown> {
  status?: string;
  encrypted?: string;
  decrypted?: string;
  signature?: string;
  initialized?: boolean;
  uptime?: number;
  version?: string;
  error?: string;
  privateKey?: string;
  publicKey?: string;
  inboxId?: string;
  key?: string;
  message?: string;
  availableEndpoints?: string[];
}

async function vaultRequest<T = VaultResponse>(
  endpoint: string,
  body?: object
): Promise<T> {
  const url = `${VAULT_URL}${endpoint}`;
  
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const data = await response.json() as VaultResponse;
  
  if ('error' in data) {
    throw new Error(data.error);
  }
  
  return data as T;
}

// ============================================================================
// Commands
// ============================================================================

async function cmdStatus() {
  const status = await vaultRequest<VaultResponse>('/status');
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    VAULT STATUS                             ║
╠═══════════════════════════════════════════════════════════════╣
║  Initialized:  ${(status.initialized ? '✅ Yes' : '❌ No').padEnd(44)}║
║  Uptime:       ${(status.uptime ? `${status.uptime}s` : 'N/A').padEnd(44)}║
║  Version:      ${(status.version || 'unknown').padEnd(44)}║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

async function cmdInit(key: string) {
  if (!key || key.length !== 64) {
    console.error('Error: Key must be exactly 64 hexadecimal characters');
    console.error('Example: npx tsx src/client.ts init 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    process.exit(1);
  }
  
  console.log('Initializing vault...');
  
  const result = await vaultRequest<VaultResponse>('/init', { key });
  
  console.log(`
✅ Vault initialized!
   ${result.message || 'Ready for encrypt/decrypt operations'}
`);
}

async function cmdReinit(key: string) {
  if (!key || key.length !== 64) {
    console.error('Error: Key must be exactly 64 hexadecimal characters');
    process.exit(1);
  }
  
  console.log('Re-initializing vault...');
  
  const result = await vaultRequest<VaultResponse>('/reinit', { key });
  
  console.log(`
✅ Vault re-initialized!
   ${result.message || 'Ready for encrypt/decrypt operations'}
`);
}

async function cmdEncrypt(data: string) {
  if (!data) {
    console.error('Error: Data is required');
    console.error('Usage: npx tsx src/client.ts encrypt "your data here"');
    process.exit(1);
  }
  
  const result = await vaultRequest<{ encrypted: string }>('/encrypt', { data });
  
  console.log(`
✅ Encrypted!
   
   Encrypted data (base64):
   ${result.encrypted}
`);
}

async function cmdDecrypt(encrypted: string) {
  if (!encrypted) {
    console.error('Error: Encrypted data is required');
    console.error('Usage: npx tsx src/client.ts decrypt <base64-string>');
    process.exit(1);
  }
  
  const result = await vaultRequest<{ decrypted: string }>('/decrypt', { encrypted });
  
  console.log(`
✅ Decrypted!
   
   Decrypted data:
   ${result.decrypted}
`);
}

async function cmdSign(message: string) {
  if (!message) {
    console.error('Error: Message is required');
    console.error('Usage: npx tsx src/client.ts sign "message to sign"');
    process.exit(1);
  }
  
  const result = await vaultRequest<{ signature: string }>('/sign', { message });
  
  console.log(`
✅ Signed!
   
   Message: ${message}
   Signature: ${result.signature}
`);
}

async function cmdXmtpIdentity(walletAddress: string) {
  if (!walletAddress) {
    console.error('Error: Wallet address is required');
    console.error('Usage: npx tsx src/client.ts xmtp-identity 0x123...');
    process.exit(1);
  }
  
  const result = await vaultRequest<{
    privateKey: string;
    publicKey: string;
    inboxId: string;
  }>('/xmtp/identity', { walletAddress });
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    XMTP IDENTITY                              ║
╠═══════════════════════════════════════════════════════════════╣
║  Inbox ID:    ${result.inboxId?.padEnd(44)}║
║  Public Key:  ${(result.publicKey?.substring(0, 20) + '...').padEnd(44)}║
║  Private Key: ${(result.privateKey?.substring(0, 20) + '...').padEnd(44)}║
╚═══════════════════════════════════════════════════════════════╝
  `);
}

async function cmdDeriveKey(purpose: string) {
  if (!purpose) {
    console.error('Error: Purpose is required');
    console.error('Usage: npx tsx src/client.ts derive-key "session-encryption"');
    process.exit(1);
  }
  
  const result = await vaultRequest<{ key: string }>('/derive-key', { purpose });
  
  console.log(`
✅ Derived key for: ${purpose}
   
   Key: ${result.key}
`);
}

function cmdHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    VAULT CLI CLIENT                         ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  npx tsx src/client.ts <command> [args]

Commands:
  status                    Check vault status
  init <key>               Initialize vault with 64-char hex key
  reinit <key>             Re-initialize after cold start
  encrypt <data>            Encrypt text
  decrypt <base64>         Decrypt base64 blob
  sign <message>            Sign message
  xmtp-identity <wallet>   Get XMTP identity
  derive-key <purpose>     Derive sub-key for purpose
  help                     Show this help

Environment:
  VAULT_URL                Vault URL (default: http://localhost:8080)

Examples:
  # Check status
  npx tsx src/client.ts status

  # Initialize with key
  npx tsx src/client.ts init 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

  # Encrypt data
  npx tsx src/client.ts encrypt "Hello World"

  # Decrypt data
  npx tsx src/client.ts decrypt "Gi5sdmVyc2lvbj0x..."

  # Sign a message
  npx tsx src/client.ts sign "My message"

  # Get XMTP identity
  npx tsx src/client.ts xmtp-identity 0x1234567890123456789012345678901234567890

  # Derive a sub-key
  npx tsx src/client.ts derive-key "session-encryption"

Environment Variables:
  VAULT_URL=http://localhost:8080 npx tsx src/client.ts status
`);
}

// ============================================================================
// Main
// ============================================================================

const command = process.argv[2];

async function main() {
  // Handle empty command
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    cmdHelp();
    return;
  }
  
  // Show vault URL
  console.log(`Vault: ${VAULT_URL}\n`);
  
  try {
    switch (command) {
      case 'status':
        await cmdStatus();
        break;
      
      case 'init':
        await cmdInit(process.argv[3]);
        break;
      
      case 'reinit':
        await cmdReinit(process.argv[3]);
        break;
      
      case 'encrypt':
        await cmdEncrypt(process.argv.slice(3).join(' '));
        break;
      
      case 'decrypt':
        await cmdDecrypt(process.argv[3]);
        break;
      
      case 'sign':
        await cmdSign(process.argv.slice(3).join(' '));
        break;
      
      case 'xmtp-identity':
        await cmdXmtpIdentity(process.argv[3]);
        break;
      
      case 'derive-key':
        await cmdDeriveKey(process.argv[3]);
        break;
      
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "npx tsx src/client.ts help" for usage');
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
