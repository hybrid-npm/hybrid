import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteSchedulerStore } from './src/store.js'
import { SchedulerService, createSchedulerService } from './src/index.js'

describe('Scheduler Integration Eval', () => {
  let tempDir: string
  let store: SqliteSchedulerStore
  let scheduler: SchedulerService

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'eval-scheduler-'))
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
    scheduler?.stop()
  })

  it('initializes scheduler with SQLite', async () => {
    store = new SqliteSchedulerStore({ dbPath: join(tempDir, 'scheduler.db') })
    await store.init()
    
    scheduler = await createSchedulerService({
      store,
      dispatcher: {
        dispatch: vi.fn().mockResolvedValue({ delivered: true })
      },
      executor: {
        runAgentTurn: vi.fn().mockResolvedValue({ status: 'ok' }),
        runSystemEvent: vi.fn().mockResolvedValue({ status: 'ok' })
      },
      enabled: false
    })

    expect(scheduler).toBeDefined()
  })

  it('creates and lists scheduled tasks', async () => {
    store = new SqliteSchedulerStore({ dbPath: join(tempDir, 'scheduler.db') })
    await store.init()
    
    scheduler = await createSchedulerService({
      store,
      dispatcher: {
        dispatch: vi.fn().mockResolvedValue({ delivered: true })
      },
      executor: {
        runAgentTurn: vi.fn().mockResolvedValue({ status: 'ok' }),
        runSystemEvent: vi.fn().mockResolvedValue({ status: 'ok' })
      },
      enabled: false
    })

    const task = await scheduler.add({
      agentId: 'eval-agent',
      name: 'eval-test-task',
      schedule: { kind: 'every', everyMs: 60000 },
      payload: { kind: 'systemEvent', text: 'Test event' },
      enabled: true
    })

    expect(task.id).toBeDefined()

    const tasks = await scheduler.list()
    expect(tasks.length).toBe(1)
    expect(tasks[0].name).toBe('eval-test-task')
  })

  it('cancels scheduled tasks', async () => {
    store = new SqliteSchedulerStore({ dbPath: join(tempDir, 'scheduler.db') })
    await store.init()
    
    scheduler = await createSchedulerService({
      store,
      dispatcher: {
        dispatch: vi.fn().mockResolvedValue({ delivered: true })
      },
      executor: {
        runAgentTurn: vi.fn().mockResolvedValue({ status: 'ok' }),
        runSystemEvent: vi.fn().mockResolvedValue({ status: 'ok' })
      },
      enabled: false
    })

    const task = await scheduler.add({
      agentId: 'eval-agent',
      name: 'cancellable-task',
      schedule: { kind: 'every', everyMs: 60000 },
      payload: { kind: 'systemEvent', text: 'Test event' },
      enabled: true
    })

    await scheduler.remove(task.id)

    const tasks = await scheduler.list()
    expect(tasks.length).toBe(0)
  })

  it('handles cron expressions', async () => {
    store = new SqliteSchedulerStore({ dbPath: join(tempDir, 'scheduler.db') })
    await store.init()
    
    scheduler = await createSchedulerService({
      store,
      dispatcher: {
        dispatch: vi.fn().mockResolvedValue({ delivered: true })
      },
      executor: {
        runAgentTurn: vi.fn().mockResolvedValue({ status: 'ok' }),
        runSystemEvent: vi.fn().mockResolvedValue({ status: 'ok' })
      },
      enabled: false
    })

    const task = await scheduler.add({
      agentId: 'eval-agent',
      name: 'cron-task',
      schedule: { kind: 'cron', expr: '* * * * *' },
      payload: { kind: 'systemEvent', text: 'Cron test' },
      enabled: true
    })

    expect(task.id).toBeDefined()

    const retrieved = await scheduler.get(task.id)
    expect(retrieved?.schedule.kind).toBe('cron')
  })

  it('updates scheduled tasks', async () => {
    store = new SqliteSchedulerStore({ dbPath: join(tempDir, 'scheduler.db') })
    await store.init()
    
    scheduler = await createSchedulerService({
      store,
      dispatcher: {
        dispatch: vi.fn().mockResolvedValue({ delivered: true })
      },
      executor: {
        runAgentTurn: vi.fn().mockResolvedValue({ status: 'ok' }),
        runSystemEvent: vi.fn().mockResolvedValue({ status: 'ok' })
      },
      enabled: false
    })

    const task = await scheduler.add({
      agentId: 'eval-agent',
      name: 'original-name',
      schedule: { kind: 'every', everyMs: 60000 },
      payload: { kind: 'systemEvent', text: 'Test event' },
      enabled: true
    })

    await scheduler.update(task.id, { name: 'updated-name', enabled: false })

    const retrieved = await scheduler.get(task.id)
    expect(retrieved?.name).toBe('updated-name')
    expect(retrieved?.enabled).toBe(false)
  })
})
