import type { TestWallet, XmtpTestClient } from './types.js';
export declare function createXmtpClient(wallet: TestWallet, env?: 'dev' | 'production'): XmtpTestClient;
export declare function loadTestWallets(path: string): TestWallet[];
