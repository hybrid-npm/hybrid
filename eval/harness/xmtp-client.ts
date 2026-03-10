import { readFileSync } from 'fs'
import type { TestWallet, XmtpTestClient, XmtpMessage } from './types.js'

export function createXmtpClient(
  wallet: TestWallet,
  env: 'dev' | 'production' = 'dev'
): XmtpTestClient {
  let client: unknown = null
  const pendingMessages: XmtpMessage[] = []

  return {
    getWallet(): TestWallet {
      return wallet
    },

    async sendMessage(toAddress: string, content: string): Promise<string> {
      console.log(`[XMTP] Sending message to ${toAddress}: ${content}`)
      return `msg-${Date.now()}`
    },

    async waitForMessage(timeout: number = 30000): Promise<XmtpMessage | null> {
      console.log(`[XMTP] Waiting for message (timeout: ${timeout}ms)`)
      
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, timeout)))
      return null
    },

    async close(): Promise<void> {
      console.log('[XMTP] Client closed')
    }
  }
}

export function loadTestWallets(path: string): TestWallet[] {
  const content = readFileSync(path, 'utf-8')
  const data = JSON.parse(content)
  
  return data.wallets.map((w: { inboxId: string; address: string; privateKey: string }) => ({
    inboxId: w.inboxId,
    address: w.address,
    privateKey: w.privateKey
  }))
}
