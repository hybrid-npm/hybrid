# Hybrid - Typescript Framework for building crypto AI Agents.

An open-source agent framework for building conversational AI agents on XMTP. 

Hybrid makes it easy for developers to create intelligent agents that can understand natural language, process messages, and respond through XMTP's decentralized messaging protocol.

See [hybrid.dev](https://hybrid.dev) for more information.

## 📦 Quickstart

Getting started with Hybrid is simple:

### 1. Initialize your project

```bash
npm create hybrid my-agent
cd my-agent
```

This creates all the necessary files and configuration for your agent.

### 2. Get your OpenRouter API key
   
Visit [OpenRouter](https://openrouter.ai/keys), create an account and generate an API key

Add it to your `.env` file:

```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### 3. Generate XMTP keys

```bash
hybrid keys
```

or automatically add it to your `.env` file:  

```bash
hybrid keys --write
```

### 4. Register your wallet with XMTP

```bash
hybrid register
```

This generates secure wallet and encryption keys for your XMTP agent.

  ### 5. Start developing

```bash
hybrid dev
```

Your agent will start listening for XMTP messages and you're ready to build! 

Go to [https://xmtp.chat/dm/](https://xmtp.chat/dm/) and send a message to your agent.

## 🧠 Agent Behaviors

`hybrid` comes with a set of behaviors that you can use to customize your agent's behavior. Behaviors are executed before or after the agent responds.

### Basic Agent

Here's a basic agent implementation:

```typescript
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { Agent } from "hybrid"
import { filterMessages, reactWith, threadedReply } from "hybrid/behaviors"

export const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY
})

const agent = new Agent({
	name: "Basic Agent",
	model: openrouter("x-ai/grok-4"),
	instructions:
		"You are a XMTP agent that responds to messages and reactions. Be conversational."
})

await agent.listen({
	port: process.env.PORT || "8454"
})
```

### Message Filtering

By default, the agent will process all messages in the conversation. You can filter messages by using the `filterMessages` behavior.

```typescript
import { filterMessages } from "hybrid/behaviors"

await agent.listen({
	port: process.env.PORT || "8454",
	behaviors: [
      filterMessages((filter) =>
        filters.isReply() || filters.isDM() || filters.hasMention("@agent")
      )
    ]
})
```

The filter function receives a `filter` object with methods that return boolean values. Return `true` to process the message, `false` to filter it out.

**Available filter methods:**
- `filter.isText()` - Message is text content
- `filter.isReply()` - Message is a reply
- `filter.isReaction()` - Message is a reaction
- `filter.isReaction(emoji, action?)` - Message is a reaction with specific emoji and/or action ("added" | "removed")
- `filter.isDM()` - Message is a direct message
- `filter.isFromSelf()` - Message is from the agent itself
- `filter.isFromSelf()` - Message is from the agent itself (alias for isFromSelf)
- `filter.isFrom(address)` - Message is from a specific Ethereum address (async)
- `filter.hasMention(mention:string)` - Message contains a mention
- `filter.hasContent()` - Message has content
- `filter.isGroup()` - Message is in a group conversation
- `filter.isGroupAdmin()` - Message sender is group admin
- `filter.isGroupSuperAdmin()` - Message sender is group super admin
- `filter.isRemoteAttachment()` - Message has remote attachment
- `filter.isTextReply()` - Message is a text reply

**Using async filters:**

Filters can now be async to support operations like address resolution:

```typescript
filterMessages(async (filter) => 
  !await filter.isFrom("0x1234567890123456789012345678901234567890") && 
  !filter.isFromSelf()
)
```

See XMTP Agent SDK filter docs for all filtering options: [XMTP Agent SDK – Built-in filters](https://github.com/xmtp/xmtp-js/tree/main/sdks/agent-sdk#3-builtin-filters).

### Reactions

A common behavior for agents is to react to the inbound message to let others know the agent is aware of the message and will reply.

```typescript
import { reactWith } from "hybrid/behaviors"

await agent.listen({
	port: process.env.PORT || "8454",
	behaviors: [reactWith("👀")]
})
```

### Threaded Replies

By default, the agent will reply to the dm / group message in a top-level manner. You can change this to a threaded manner by using the `threadedReply` behavior. This will have the agent reply to the original message and start a thread.

```typescript
import { threadedReply } from "hybrid/behaviors"

await agent.listen({
	port: process.env.PORT || "8454",
	behaviors: [threadedReply()]
})
```

## 🛠️ Tools Standard Library

Hybrid includes a comprehensive standard library of tools for building crypto-enabled agents:

### Blockchain Tools (`blockchainTools`)

```typescript
import { Agent } from "hybrid"
import { blockchainTools } from "hybrid/tools"

const agent = new Agent({
  name: "my-agent",
  model: myModel,
  tools: blockchainTools,
  // Expose runtime configuration used by blockchain tools
  createRuntime: () => ({
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY as `0x${string}` | undefined,
    defaultChain: "mainnet" as const
  }),
  instructions: "You can check balances, send transactions, and interact with the blockchain."
})
```

**Available Tools:**
- `getBalance` - Get native token balance for any address
- `sendTransaction` - Send native tokens to another address
- `getTransaction` - Get transaction details by hash
- `getBlock` - Get blockchain block information
- `getGasPrice` - Get current gas prices
- `estimateGas` - Estimate gas costs for transactions

**Supported Chains:** Ethereum, Polygon, Arbitrum, Optimism, Base, and Sepolia testnet

### XMTP Tools

The XMTP plugin automatically includes the following tools when your agent starts listening for messages:

**Available Tools:**
- `sendMessage` - Send messages to XMTP conversations
- `sendReply` - Reply to specific messages
- `sendReaction` - Send emoji reactions
- `getMessage` - Retrieve message details by ID

These tools are automatically available to your agent without needing to explicitly include them in your agent configuration.

### Using Blockchain Tools

```typescript
import { Agent } from "hybrid"
import { blockchainTools } from "hybrid/tools"

const agent = new Agent({
  name: "blockchain-agent",
  model: myModel,
  tools: blockchainTools,
  createRuntime: () => ({
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY as `0x${string}` | undefined,
    defaultChain: "mainnet" as const
  })
})
```

## 🖥️ CLI Commands

The Hybrid CLI provides commands to manage your agent development workflow:

```bash
hybrid <command>
```

## 🔧 Developing Locally

If you want to work with the source code or contribute to Hybrid:

### Prerequisites

- **Node.js**: Version 22 or higher
- **pnpm**: Package manager
- **Git**: Version control

### 1. Clone and Install

```bash
git clone <repository-url>
cd hybrid
pnpm install
```

### 2. Environment Setup

Create a `.env.local` file in the root directory:

```env
# AI Configuration
OPENROUTER_API_KEY="your_openai_api_key"

# XMTP Configuration
XMTP_WALLET_KEY="0x..."  # Private key for XMTP agent
XMTP_DB_ENCRYPTION_KEY="..."  # Database encryption key
XMTP_ENV="dev"  # dev, production
```

### 3. Start Development Server

```bash
# Start the agent
pnpm dev
```

This starts the agent and begins listening for XMTP messages on the configured port (default: 8454).

## 🛠️ Development

### Available Scripts

```bash
# Development
pnpm build                  # Build all packages
pnpm build:watch            # Build all packages in watch mode
pnpm test                   # Run tests across all packages
pnpm typecheck              # Type checking across all packages

# Code Quality
pnpm lint                   # Lint all packages
pnpm lint:fix               # Fix linting issues
pnpm format                 # Format code (handled by Biome)

# Maintenance
pnpm clean                  # Clean build artifacts
pnpm nuke                   # Remove all node_modules (nuclear option)
pnpm bump                   # Bump version (patch by default)
pnpm bump:patch             # Bump patch version
pnpm bump:minor             # Bump minor version
pnpm bump:major             # Bump major version

# Release
pnpm release                # Build and publish all packages
```

### Project Structure

Hybrid is designed as a framework for developers to build XMTP agents:

#### Core Packages
- **core/**: Main agent framework library (published as "hybrid")
  - Agent runtime and plugin system
  - Type-safe message handling
  - Flexible filtering and processing
  - Integration with AI providers and XMTP
- **cli/**: Command-line interface for agent management
  - Project initialization and setup
  - XMTP key generation and management
  - Development server and build tools
- **utils/**: Common utilities and helpers (@hybrd/utils)
  - Array, string, and object utilities
  - Date and UUID helpers
  - Markdown processing utilities
- **xmtp/**: XMTP client and messaging utilities (@hybrd/xmtp)
  - Client initialization and management
  - Message sending and receiving
  - Address resolution (ENS, BaseName, XMTP)
  - Content type handling and encryption

### Key Technologies

- **Core**: Node.js 22+, TypeScript, pnpm workspace
- **Build**: Turbo for monorepo orchestration and caching
- **Messaging**: XMTP Protocol for decentralized messaging
- **AI**: OpenRouter API and Vercel AI SDK for natural language processing
- **Web3**: Viem for Ethereum interactions, Coinbase AgentKit for DeFi
- **Development**: Biome for linting and formatting
- **Testing**: Vitest for fast unit and integration tests

### Environment Variables

Key environment variables for agent operation:

```env
# Required
OPENROUTER_API_KEY="your_openai_api_key"  # For AI integration
XMTP_WALLET_KEY="0x..."                        # XMTP wallet private key
XMTP_ENV="dev"                           # dev or production

# Optional
PORT="8454"                              # Port for the agent server
XMTP_DB_ENCRYPTION_KEY="..."                     # For secure data encryption
```

## 🚀 Deployment

Deploy your Hybrid agent anywhere Node.js runs:

### Build and Deploy

1. **Build the project**:
```bash
pnpm build
```

2. **Deploy to any Node.js hosting provider**:
   - Vercel
   - Railway
   - Render
   - Heroku
   - DigitalOcean
   - AWS Lambda
   - Google Cloud Functions

### Environment Variables

Make sure these environment variables are configured in your deployment:
- `OPENROUTER_API_KEY` - Your AI API key
- `XMTP_WALLET_KEY` - XMTP wallet private key
- `XMTP_ENV` - dev or production
- `PORT` - Port for the agent server (optional)

## 🧪 Testing

### Run Tests

```bash
pnpm test
```

### Manual Testing

1. Start your agent: `pnpm dev`
2. Send XMTP messages to test your agent's responses
3. Verify your custom filters and AI integration work as expected

## 📚 API Reference

### Core Classes

- **Agent**: Main agent class for creating and configuring XMTP agents
- **MessageListenerConfig**: Configuration for message filtering and processing
- **Reaction**: Type for handling XMTP reactions

### Key Methods

- `agent.listen()`: Start listening for XMTP messages with custom filters
- `filter()`: Define which messages your agent should respond to
- `processMessage()`: Handle incoming XMTP messages
- `sendResponse()`: Send responses back to users

### Message Types

Hybrid supports all XMTP message types:
- **Text Messages**: Standard text content
- **Reactions**: 👍, ❤️, and custom reactions
- **Replies**: Threaded conversations
- **Custom Content**: Any XMTP-supported content type

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

ISC License - see LICENSE file for details

## 🏗️ Architecture

This project uses a monorepo structure with multiple packages and supporting directories:

```
hybrid/
├── config/                # Shared configuration (biome, tsconfig)
├── packages/
│   ├── core/              # Main agent framework library (published as "hybrid")
│   ├── cli/               # Command-line interface (bin: "hybrid")
│   ├── types/             # Shared TypeScript types (@hybrd/types)
│   ├── utils/             # Utilities (@hybrd/utils)
│   └── xmtp/              # XMTP client and resolvers (@hybrd/xmtp)
├── scripts/               # Repo scripts (version bump, etc.)
└── site/                  # Docs website
```

## 🆘 Support

- **Documentation**: Check the `/docs` directory
- **Issues**: Create GitHub issues for bugs
- **Discussions**: Use GitHub discussions for questions

Built with ❤️ using modern web3 technologies and natural language processing
