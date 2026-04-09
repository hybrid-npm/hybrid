export interface TestScenario {
  name: string
  timeout?: number
  run: (ctx: TestContext) => Promise<void>
}

export interface TestContext {
  agentUrl: string
  wallets: TestWallet[]
  http: HttpClient
}

export interface TestWallet {
  inboxId: string
  address: string
  privateKey: string
}

export interface TestResult {
  scenario: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  error?: string
}

export interface HttpClient {
  get(path: string): Promise<HttpResponse>
  post(path: string, body?: unknown): Promise<HttpResponse>
  postStream(path: string, body?: unknown): Promise<AsyncIterable<string>>
}

export interface HttpResponse {
  status: number
  json(): Promise<unknown>
  text(): Promise<string>
}

export interface EvalConfig {
  agentUrl: string
  walletsPath: string
  resultsPath: string
  timeout?: number
}
