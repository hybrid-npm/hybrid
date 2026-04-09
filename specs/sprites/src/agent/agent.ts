/**
 * Agent - Example Agent entry point for Agent Sprite
 * 
 * This demonstrates:
 * 1. Initializing AgentStorage
 * 2. Checking vault connection
 * 3. Saving/loading encrypted sessions
 * 4. Running an AI agent loop
 */

import { createAgentStorage, AgentStorage } from './agent-storage.js';

interface AgentConfig {
  vaultUrl: string;
  userId: string;
  dataPath: string;
}

interface AgentState {
  initialized: boolean;
  currentSession: string | null;
  sessionCount: number;
}

/**
 * Initialize the agent
 */
async function initializeAgent(): Promise<AgentStorage> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    INITIALIZING AGENT                        ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  const storage = createAgentStorage();
  
  // Check vault connection
  console.log('Connecting to Vault...');
  const ready = await storage.isReady();
  
  if (!ready) {
    console.log(`
⚠️  VAULT NOT INITIALIZED
    User must authenticate to unlock encrypted storage.
    
    To authenticate, the user needs to:
    1. Sign a challenge with their wallet
    2. Derive the encryption key: key = hash(signature)
    3. Call POST /init on the Vault with this key
    
    For now, running in limited mode.
`);
  } else {
    console.log('✅ Vault connected and ready');
  }
  
  return storage;
}

/**
 * Create a new session
 */
async function createSession(storage: AgentStorage, sessionId?: string): Promise<string> {
  const id = sessionId || `session-${Date.now()}`;
  
  const sessionData = {
    id,
    messages: [
      {
        role: 'system' as const,
        content: 'You are a helpful AI assistant.',
      },
    ],
    context: {
      workingDirectory: '/home/sprite/agent/workspace',
      variables: {
        PROJECT_NAME: 'agent-project',
      },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await storage.saveSession(id, sessionData);
  console.log(`Created session: ${id}`);
  
  return id;
}

/**
 * Add message to session
 */
async function addMessage(
  storage: AgentStorage,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const session = await storage.loadSession(sessionId);
  
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }
  
  session.messages.push({
    role,
    content,
    timestamp: Date.now(),
  });
  session.updatedAt = Date.now();
  
  await storage.saveSession(sessionId, session);
}

/**
 * Example: Save some data
 */
async function saveExampleData(storage: AgentStorage): Promise<void> {
  console.log('\n--- Saving Encrypted Data ---');
  
  // Save session
  await storage.setJSON('lastSession', {
    id: 'demo-session',
    timestamp: Date.now(),
  });
  console.log('✅ Saved session metadata');
  
  // Save user preferences
  await storage.set('preferences.theme', 'dark');
  console.log('✅ Saved preferences');
}

/**
 * Example: Load encrypted data
 */
async function loadExampleData(storage: AgentStorage): Promise<void> {
  console.log('\n--- Loading Encrypted Data ---');
  
  // Load session
  const session = await storage.getJSON('lastSession');
  console.log('✅ Loaded session:', session);
  
  // Load preferences
  const theme = await storage.get('preferences.theme');
  console.log('✅ Loaded theme:', theme);
}

/**
 * List all stored data
 */
async function listData(storage: AgentStorage): Promise<void> {
  console.log('\n--- Listing Stored Data ---');
  
  const sessions = await storage.listSessions();
  console.log('Sessions:', sessions);
  
  // Note: We can't list encrypted keys directly for security
  console.log('(Encrypted keys are not enumerable)');
}

/**
 * Example AI agent loop
 */
async function runAgentLoop(storage: AgentStorage): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    AGENT LOOP                                ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  // Create a session
  const sessionId = await createSession(storage);
  
  // Simulate conversation
  await addMessage(storage, sessionId, 'user', 'Hello! Help me with coding.');
  await addMessage(storage, sessionId, 'assistant', 'Of course! What would you like to build?');
  await addMessage(storage, sessionId, 'user', 'A simple web app.');
  await addMessage(storage, sessionId, 'assistant', 'Great! Let me help you create one.');
  
  // Load the conversation
  const session = await storage.loadSession(sessionId);
  console.log('\nConversation:');
  for (const msg of session?.messages || []) {
    console.log(`  ${msg.role}: ${msg.content}`);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const config: AgentConfig = {
    vaultUrl: process.env.VAULT_URL || 'http://localhost:8080',
    userId: process.env.USER_ID || 'anonymous',
    dataPath: process.env.AGENT_DATA_PATH || '/home/sprite/agent/data',
  };
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    AGENT SPRITE                             ║
║              Zero-Knowledge Agent Platform                   ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Vault URL: ${config.vaultUrl.padEnd(45)}║
║  User ID:   ${config.userId.padEnd(45)}║
║  Data Path: ${config.dataPath.padEnd(45)}║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  try {
    // Initialize
    const storage = await initializeAgent();
    
    // Save example data
    await saveExampleData(storage);
    
    // Load example data
    await loadExampleData(storage);
    
    // List data
    await listData(storage);
    
    // Run agent loop
    await runAgentLoop(storage);
    
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    AGENT READY!                             ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  The agent is now running with:                              ║
║  • Encrypted session storage                                 ║
║  • Zero-knowledge vault connection                          ║
║                                                               ║
║  All sensitive data is encrypted with keys stored only      ║
║  in the Vault Sprite's memory.                              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
    
    // Keep process running
    console.log('\nWaiting for requests...');
    
    // In production, this would start an HTTP server
    // or connect to a message queue
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('VAULT_URL')) {
        console.error('\n⚠️  VAULT_URL not set');
        console.error('Set it with: export VAULT_URL=https://vault-xxx.sprites.app');
      } else if (error.message.includes('not initialized')) {
        console.error('\n⚠️  Vault needs authentication');
        console.error('User must call POST /init with their encryption key');
      }
    }
    
    process.exit(1);
  }
}

// Run
main();

export { main, initializeAgent, AgentStorage, AgentConfig, AgentState };
