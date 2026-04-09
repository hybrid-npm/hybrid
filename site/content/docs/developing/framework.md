---
title: Framework Development
description: Building and testing the Hybrid framework core
---

# Framework Development

Learn how to develop and extend the core Hybrid framework, including monorepo structure, package development, and testing strategies.

## Monorepo Structure and Package Organization

Hybrid uses a monorepo structure with multiple packages that work together to provide the complete framework experience.

### Repository Structure

```
hybrid/
├── packages/
│   ├── core/                 # Core framework
│   ├── cli/                  # Command-line interface
│   ├── channels/             # Channel adapters
│   ├── utils/                # Shared utilities
│   └── types/                # TypeScript type definitions
├── docs/                     # Documentation
├── site/                     # Documentation website
├── tools/                    # Development tools
├── scripts/                  # Build and utility scripts
├── package.json              # Root package.json
├── pnpm-workspace.yaml       # Workspace configuration
├── turbo.json               # Turborepo configuration
└── tsconfig.json            # TypeScript configuration
```

### Package Dependencies

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'site'
```

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Core Package Structure

```
packages/core/
├── src/
│   ├── agent/               # Agent implementation
│   │   ├── agent.ts
│   │   ├── context.ts
│   │   └── lifecycle.ts
│   ├── behaviors/           # Message processing behaviors
│   │   ├── index.ts
│   │   ├── filter-messages.ts
│   │   ├── react-with.ts
│   │   └── threaded-reply.ts
│   ├── tools/               # Built-in tools
│   │   ├── index.ts
│   │   ├── blockchain/
│   │   └── mini-apps/
│   ├── types/               # Type definitions
│   │   ├── agent.ts
│   │   ├── behavior.ts
│   │   ├── tool.ts
│   │   └── message.ts
│   ├── utils/               # Utility functions
│   │   ├── crypto.ts
│   │   ├── validation.ts
│   │   └── formatting.ts
│   └── index.ts             # Main exports
├── test/                    # Test files
├── package.json
├── tsconfig.json
└── README.md
```

## Building and Testing the Framework

### Development Setup

```bash
# Install dependencies for all packages
pnpm install

# Build all packages
pnpm build

# Build specific package
pnpm --filter @hybrd/core build

# Watch mode for development
pnpm --filter @hybrd/core dev

# Run tests
pnpm test

# Run tests for specific package
pnpm --filter @hybrd/core test
```

### Package Configuration

```json
// packages/core/package.json
{
  "name": "@hybrd/core",
  "version": "1.0.0",
  "description": "Core Hybrid framework for building AI agents",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./behaviors": {
      "import": "./dist/behaviors/index.mjs",
      "require": "./dist/behaviors/index.js",
      "types": "./dist/behaviors/index.d.ts"
    },
    "./tools": {
      "import": "./dist/tools/index.mjs",
      "require": "./dist/tools/index.js",
      "types": "./dist/tools/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-sdk/openai": "^0.0.24",
    "viem": "^2.7.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

### Build Configuration

```typescript
// packages/core/tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/behaviors/index.ts',
    'src/tools/index.ts'
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  external: [
    '@ai-sdk/openai',
    'viem'
  ]
})
```

### Testing Strategy

#### Unit Tests

```typescript
// packages/core/test/agent.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Agent } from '../src/agent/agent'
import { MockAIModel } from './mocks/ai-model'
import { MockMessagingClient } from './mocks/messaging-client'

describe('Agent', () => {
  let agent: Agent
  let mockModel: MockAIModel
  let mockMessaging: MockMessagingClient
  
  beforeEach(() => {
    mockModel = new MockAIModel()
    mockMessaging = new MockMessagingClient()
    
    agent = new Agent({
      model: mockModel,
      instructions: "You are a test agent",
      messagingClient: mockMessaging
    })
  })
  
  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(agent.instructions).toBe("You are a test agent")
      expect(agent.model).toBe(mockModel)
    })
    
    it('should throw error with invalid configuration', () => {
      expect(() => new Agent({} as any)).toThrow('Invalid agent configuration')
    })
  })
  
  describe('message processing', () => {
    it('should process text messages', async () => {
      const message = {
        id: 'test-1',
        content: 'Hello, agent!',
        sender: '0x1234567890abcdef1234567890abcdef12345678',
        timestamp: Date.now(),
        conversation: { id: 'conv-1', isGroup: false }
      }
      
      mockModel.setResponse('Hello! How can I help you?')
      
      const result = await agent.processMessage(message)
      
      expect(result.processed).toBe(true)
      expect(mockMessaging.sentMessages).toHaveLength(1)
      expect(mockMessaging.sentMessages[0].content).toContain('Hello!')
    })
    
    it('should handle processing errors gracefully', async () => {
      const message = {
        id: 'test-2',
        content: 'Test message',
        sender: '0x1234567890abcdef1234567890abcdef12345678',
        timestamp: Date.now(),
        conversation: { id: 'conv-1', isGroup: false }
      }
      
      mockModel.setError(new Error('AI model error'))
      
      const result = await agent.processMessage(message)
      
      expect(result.processed).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
  
  describe('behaviors', () => {
    it('should apply behaviors in correct order', async () => {
      const behavior1 = vi.fn().mockResolvedValue(true)
      const behavior2 = vi.fn().mockResolvedValue(true)
      
      agent.use(behavior1)
      agent.use(behavior2)
      
      const message = createTestMessage()
      await agent.processMessage(message)
      
      expect(behavior1).toHaveBeenCalledBefore(behavior2)
    })
    
    it('should skip processing when behavior returns false', async () => {
      const blockingBehavior = vi.fn().mockResolvedValue(false)
      
      agent.use(blockingBehavior)
      
      const message = createTestMessage()
      const result = await agent.processMessage(message)
      
      expect(result.processed).toBe(false)
      expect(mockModel.generateResponse).not.toHaveBeenCalled()
    })
  })
})
```

#### Integration Tests

```typescript
// packages/core/test/integration/agent-lifecycle.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Agent } from '../../src/agent/agent'
import { TestEnvironment } from '../helpers/test-environment'

describe('Agent Lifecycle Integration', () => {
  let testEnv: TestEnvironment
  
  beforeAll(async () => {
    testEnv = await TestEnvironment.create()
  })
  
  afterAll(async () => {
    await testEnv.cleanup()
  })
  
  it('should handle complete agent lifecycle', async () => {
    // Create agent
    const agent = testEnv.createAgent({
      instructions: "You are a helpful assistant"
    })
    
    // Start agent
    await agent.start()
    expect(agent.isRunning).toBe(true)
    
    // Send message
    const message = await testEnv.sendMessage(agent, "Hello!")
    
    // Wait for response
    const response = await testEnv.waitForResponse(message.id, 5000)
    expect(response).toBeDefined()
    expect(response.content).toContain("Hello")
    
    // Stop agent
    await agent.stop()
    expect(agent.isRunning).toBe(false)
  })
  
  it('should persist state across restarts', async () => {
    const agent = testEnv.createAgent({
      instructions: "Remember our conversation"
    })
    
    // Start and send message
    await agent.start()
    await testEnv.sendMessage(agent, "My name is Alice")
    await testEnv.waitForResponse()
    
    // Stop and restart
    await agent.stop()
    await agent.start()
    
    // Send follow-up message
    const followUp = await testEnv.sendMessage(agent, "What's my name?")
    const response = await testEnv.waitForResponse(followUp.id)
    
    expect(response.content.toLowerCase()).toContain("alice")
  })
})
```

#### Test Utilities

```typescript
// packages/core/test/helpers/test-environment.ts
import { Agent, AgentConfig } from '../../src/agent/agent'
import { MockAIModel } from '../mocks/ai-model'
import { MockMessagingClient } from '../mocks/messaging-client'
import { MockDatabase } from '../mocks/database'

export class TestEnvironment {
  private mockModel: MockAIModel
  private mockMessaging: MockMessagingClient
  private mockDB: MockDatabase
  private agents: Agent[] = []
  
  static async create(): Promise<TestEnvironment> {
    const env = new TestEnvironment()
    await env.initialize()
    return env
  }
  
  private async initialize() {
    this.mockModel = new MockAIModel()
    this.mockMessaging = new MockMessagingClient()
    this.mockDB = new MockDatabase()
    
    await this.mockMessaging.connect()
  }
  
  createAgent(config: Partial<AgentConfig>): Agent {
    const agent = new Agent({
      model: this.mockModel,
      messagingClient: this.mockMessaging,
      database: this.mockDB,
      ...config
    })
    
    this.agents.push(agent)
    return agent
  }
  
  async sendMessage(agent: Agent, content: string): Promise<Message> {
    return this.mockMessaging.simulateIncomingMessage({
      content,
      sender: '0x1234567890abcdef1234567890abcdef12345678',
      conversation: { id: 'test-conv', isGroup: false }
    })
  }
  
  async waitForResponse(messageId?: string, timeout = 5000): Promise<Message> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Response timeout'))
      }, timeout)
      
      this.mockMessaging.on('messageSent', (message) => {
        clearTimeout(timer)
        resolve(message)
      })
    })
  }
  
  async cleanup() {
    await Promise.all(this.agents.map(agent => agent.stop()))
    await this.mockMessaging.disconnect()
    await this.mockDB.close()
  }
}
```

## Adding New Behaviors and Tools

### Creating a New Behavior

```typescript
// packages/core/src/behaviors/sentiment-analysis.ts
import { Behavior, BehaviorContext } from '../types/behavior'

export interface SentimentAnalysisBehavior extends Behavior {
  threshold?: number
}

export function sentimentAnalysis(options: {
  threshold?: number
  onNegativeSentiment?: (context: BehaviorContext) => Promise<void>
} = {}): SentimentAnalysisBehavior {
  const { threshold = -0.5, onNegativeSentiment } = options
  
  return {
    name: 'sentimentAnalysis',
    threshold,
    
    async process(context: BehaviorContext) {
      // Analyze sentiment of the message
      const sentiment = await analyzeSentiment(context.message.content)
      
      // Add sentiment to context
      context.metadata.sentiment = sentiment
      
      // Handle negative sentiment
      if (sentiment.score < threshold && onNegativeSentiment) {
        await onNegativeSentiment(context)
      }
      
      return context
    }
  }
}

async function analyzeSentiment(text: string): Promise<{
  score: number
  label: 'positive' | 'negative' | 'neutral'
}> {
  // Simplified sentiment analysis
  // In production, use a proper sentiment analysis service
  const positiveWords = ['good', 'great', 'awesome', 'love', 'excellent']
  const negativeWords = ['bad', 'terrible', 'hate', 'awful', 'horrible']
  
  const words = text.toLowerCase().split(/\s+/)
  let score = 0
  
  words.forEach(word => {
    if (positiveWords.includes(word)) score += 1
    if (negativeWords.includes(word)) score -= 1
  })
  
  const normalizedScore = Math.max(-1, Math.min(1, score / words.length))
  
  return {
    score: normalizedScore,
    label: normalizedScore > 0.1 ? 'positive' : 
           normalizedScore < -0.1 ? 'negative' : 'neutral'
  }
}

// Export from behaviors index
// packages/core/src/behaviors/index.ts
export { sentimentAnalysis } from './sentiment-analysis'
```

### Creating a New Tool

```typescript
// packages/core/src/tools/weather.ts
import { createTool } from '../utils/create-tool'
import { z } from 'zod'

const weatherSchema = z.object({
  location: z.string().describe("City or location to get weather for"),
  units: z.enum(['celsius', 'fahrenheit']).default('celsius')
})

export const weatherTool = createTool({
  name: 'getWeather',
  description: 'Get current weather information for a location',
  schema: weatherSchema,
  
  async execute({ location, units }) {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${process.env.OPENWEATHER_API_KEY}&units=${units === 'celsius' ? 'metric' : 'imperial'}`
      )
      
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      return {
        location: data.name,
        temperature: Math.round(data.main.temp),
        condition: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed,
        units: units === 'celsius' ? '°C' : '°F'
      }
    } catch (error) {
      throw new Error(`Failed to get weather for ${location}: ${error.message}`)
    }
  }
})

// Add tests
// packages/core/test/tools/weather.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { weatherTool } from '../../src/tools/weather'

// Mock fetch
global.fetch = vi.fn()

describe('weatherTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it('should fetch weather data successfully', async () => {
    const mockResponse = {
      name: 'London',
      main: { temp: 20, humidity: 65 },
      weather: [{ description: 'partly cloudy' }],
      wind: { speed: 5 }
    }
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    } as Response)
    
    const result = await weatherTool.execute({
      location: 'London',
      units: 'celsius'
    })
    
    expect(result).toEqual({
      location: 'London',
      temperature: 20,
      condition: 'partly cloudy',
      humidity: 65,
      windSpeed: 5,
      units: '°C'
    })
  })
  
  it('should handle API errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    } as Response)
    
    await expect(weatherTool.execute({
      location: 'InvalidCity',
      units: 'celsius'
    })).rejects.toThrow('Weather API error: Not Found')
  })
})
```

## Extending the CLI with New Commands

### Adding a New CLI Command

```typescript
// packages/cli/src/commands/analyze.ts
import { Command } from 'commander'
import { analyzeProject } from '../utils/project-analyzer'
import { logger } from '../utils/logger'

export function createAnalyzeCommand(): Command {
  const command = new Command('analyze')
    .description('Analyze your Hybrid project for optimization opportunities')
    .option('-p, --path <path>', 'Project path to analyze', process.cwd())
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .option('--fix', 'Automatically fix issues where possible', false)
    .action(async (options) => {
      try {
        logger.info('Analyzing project...')
        
        const analysis = await analyzeProject(options.path)
        
        if (options.output === 'json') {
          console.log(JSON.stringify(analysis, null, 2))
        } else {
          displayAnalysisTable(analysis)
        }
        
        if (options.fix && analysis.fixableIssues.length > 0) {
          logger.info('Applying automatic fixes...')
          await applyFixes(analysis.fixableIssues, options.path)
          logger.success('Fixes applied successfully')
        }
        
        if (analysis.issues.length === 0) {
          logger.success('No issues found! Your project looks great.')
        } else {
          logger.warn(`Found ${analysis.issues.length} issues`)
          process.exit(1)
        }
      } catch (error) {
        logger.error('Analysis failed:', error.message)
        process.exit(1)
      }
    })
  
  return command
}

function displayAnalysisTable(analysis: ProjectAnalysis) {
  const { table } = require('console-table-printer')
  
  if (analysis.issues.length > 0) {
    console.log('\n📋 Issues Found:')
    table(analysis.issues.map(issue => ({
      Severity: issue.severity,
      Category: issue.category,
      Description: issue.description,
      File: issue.file || 'N/A'
    })))
  }
  
  if (analysis.suggestions.length > 0) {
    console.log('\n💡 Suggestions:')
    table(analysis.suggestions.map(suggestion => ({
      Type: suggestion.type,
      Description: suggestion.description,
      Impact: suggestion.impact
    })))
  }
  
  console.log('\n📊 Project Statistics:')
  table([
    { Metric: 'Total Files', Value: analysis.stats.totalFiles },
    { Metric: 'Agent Files', Value: analysis.stats.agentFiles },
    { Metric: 'Behavior Files', Value: analysis.stats.behaviorFiles },
    { Metric: 'Tool Files', Value: analysis.stats.toolFiles },
    { Metric: 'Test Coverage', Value: `${analysis.stats.testCoverage}%` }
  ])
}

// Register command in main CLI
// packages/cli/src/cli.ts
import { createAnalyzeCommand } from './commands/analyze'

// Add to program
program.addCommand(createAnalyzeCommand())
```

### Project Analyzer Implementation

```typescript
// packages/cli/src/utils/project-analyzer.ts
import { readdir, readFile, stat } from 'fs/promises'
import { join, extname } from 'path'
import { parse } from '@typescript-eslint/parser'

export interface ProjectAnalysis {
  issues: Issue[]
  suggestions: Suggestion[]
  fixableIssues: FixableIssue[]
  stats: ProjectStats
}

export interface Issue {
  severity: 'error' | 'warning' | 'info'
  category: string
  description: string
  file?: string
  line?: number
}

export async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    issues: [],
    suggestions: [],
    fixableIssues: [],
    stats: {
      totalFiles: 0,
      agentFiles: 0,
      behaviorFiles: 0,
      toolFiles: 0,
      testCoverage: 0
    }
  }
  
  // Analyze project structure
  await analyzeProjectStructure(projectPath, analysis)
  
  // Analyze code quality
  await analyzeCodeQuality(projectPath, analysis)
  
  // Analyze configuration
  await analyzeConfiguration(projectPath, analysis)
  
  // Analyze dependencies
  await analyzeDependencies(projectPath, analysis)
  
  return analysis
}

async function analyzeProjectStructure(
  projectPath: string, 
  analysis: ProjectAnalysis
) {
  const files = await getProjectFiles(projectPath)
  analysis.stats.totalFiles = files.length
  
  // Check for required files
  const requiredFiles = ['package.json', 'tsconfig.json']
  for (const file of requiredFiles) {
    const filePath = join(projectPath, file)
    try {
      await stat(filePath)
    } catch {
      analysis.issues.push({
        severity: 'error',
        category: 'structure',
        description: `Missing required file: ${file}`,
        file
      })
    }
  }
  
  // Analyze file types
  for (const file of files) {
    if (file.includes('agent')) analysis.stats.agentFiles++
    if (file.includes('behavior')) analysis.stats.behaviorFiles++
    if (file.includes('tool')) analysis.stats.toolFiles++
  }
  
  // Check for recommended structure
  const recommendedDirs = ['src', 'test', 'docs']
  for (const dir of recommendedDirs) {
    const dirPath = join(projectPath, dir)
    try {
      const dirStat = await stat(dirPath)
      if (!dirStat.isDirectory()) {
        analysis.suggestions.push({
          type: 'structure',
          description: `Consider creating a '${dir}' directory`,
          impact: 'medium'
        })
      }
    } catch {
      analysis.suggestions.push({
        type: 'structure',
        description: `Consider creating a '${dir}' directory`,
        impact: 'medium'
      })
    }
  }
}

async function analyzeCodeQuality(
  projectPath: string, 
  analysis: ProjectAnalysis
) {
  const tsFiles = await getProjectFiles(projectPath, '.ts')
  
  for (const file of tsFiles) {
    try {
      const content = await readFile(file, 'utf-8')
      
      // Check for common issues
      if (content.includes('any')) {
        analysis.issues.push({
          severity: 'warning',
          category: 'types',
          description: 'Usage of "any" type found',
          file
        })
      }
      
      if (content.includes('console.log')) {
        analysis.fixableIssues.push({
          type: 'remove-console-log',
          file,
          description: 'Remove console.log statements'
        })
      }
      
      // Check for proper error handling
      if (content.includes('catch') && !content.includes('throw')) {
        analysis.issues.push({
          severity: 'warning',
          category: 'error-handling',
          description: 'Catch block without proper error handling',
          file
        })
      }
    } catch (error) {
      analysis.issues.push({
        severity: 'error',
        category: 'parsing',
        description: `Failed to parse file: ${error.message}`,
        file
      })
    }
  }
}

async function getProjectFiles(
  dir: string, 
  extension?: string
): Promise<string[]> {
  const files: string[] = []
  
  async function traverse(currentDir: string) {
    const entries = await readdir(currentDir)
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const entryStat = await stat(fullPath)
      
      if (entryStat.isDirectory()) {
        if (!entry.startsWith('.') && entry !== 'node_modules') {
          await traverse(fullPath)
        }
      } else if (!extension || extname(entry) === extension) {
        files.push(fullPath)
      }
    }
  }
  
  await traverse(dir)
  return files
}
```

## Package Publishing and Release Process

### Automated Release Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test
      - run: pnpm lint
      - run: pnpm typecheck

  release:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'
      
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      
      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          commit: 'chore: release packages'
          title: 'chore: release packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Changeset Configuration

```json
// .changeset/config.json
{
  "$schema": "https://unpkg.com/@changesets/config@2.3.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

### Version Management

```bash
# Add changeset for new features
pnpm changeset add

# Version packages
pnpm changeset version

# Publish packages
pnpm changeset publish
```

## Next Steps

- See [Contributing](/developing/contributing) for contribution guidelines
- Check out [Using Hybrid](/using-hybrid) for development workflow
- Explore [Core Concepts](/core-concepts) for framework fundamentals
