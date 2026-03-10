import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MemoryManager } from './src/index.js'
import { parseACL, getRole } from './src/acl.js'

describe('Memory Integration Eval', () => {
  let tempDir: string
  let manager: MemoryManager

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'eval-memory-'))
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('initializes memory system with SQLite', async () => {
    manager = await MemoryManager.create({
      agentId: 'eval-agent',
      dataRoot: tempDir
    })

    expect(manager).toBeDefined()
  })

  it('writes and retrieves memories', async () => {
    manager = await MemoryManager.create({
      agentId: 'eval-agent',
      dataRoot: tempDir
    })

    await manager.writeMemory({
      userId: 'user-1',
      content: 'Test memory: the sky is blue',
      category: 'fact'
    })

    const results = await manager.search('sky color', {
      userId: 'user-1',
      maxResults: 5
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content.toLowerCase()).toContain('sky')
  })

  it('enforces user isolation via ACL', async () => {
    const aclPath = join(tempDir, 'ACL.md')
    writeFileSync(aclPath, `
# ACL
- 0xuserA: owner
- 0xuserB: guest
`)

    const acl = parseACL(tempDir)
    const userARole = getRole(acl, '0xuserA')
    const userBRole = getRole(acl, '0xuserB')

    expect(userARole).toBe('owner')
    expect(userBRole).toBe('guest')
  })

  it('performs hybrid search (vector + BM25)', async () => {
    manager = await MemoryManager.create({
      agentId: 'eval-agent',
      dataRoot: tempDir
    })

    await manager.writeMemory({
      userId: 'user-1',
      content: 'Project deadline is March 15th',
      category: 'milestone'
    })

    await manager.writeMemory({
      userId: 'user-1',
      content: 'Meeting scheduled for tomorrow',
      category: 'event'
    })

    await manager.writeMemory({
      userId: 'user-1',
      content: 'Coffee preference: oat milk',
      category: 'preference'
    })

    const results = await manager.search('deadline meeting', {
      userId: 'user-1',
      maxResults: 10,
      minScore: 0.1
    })

    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  it('handles PARA structure correctly', async () => {
    manager = await MemoryManager.create({
      agentId: 'eval-agent',
      dataRoot: tempDir
    })

    await manager.writePara({
      userId: 'user-1',
      projectName: 'EvalProject',
      content: 'Key fact about project',
      category: 'milestone'
    })

    const projectPath = join(
      tempDir,
      'life',
      'projects',
      'EvalProject',
      'items.json'
    )

    expect(existsSync(projectPath)).toBe(true)
  })
})
