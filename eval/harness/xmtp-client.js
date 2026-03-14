import { Client } from '@xmtp/node-sdk';
import { createWalletClient, http, privateKeyToAccount } from 'viem';
export function createXmtpClient(wallet, env = 'dev') {
    const account = privateKeyToAccount(wallet.privateKey);
    const walletClient = createWalletClient({
        account,
        transport: http()
    });
    let client = null;
    const pendingMessages = [];
    return {
        getWallet() {
            return wallet;
        },
        async sendMessage(toAddress, content) {
            if (!client) {
                client = await Client.create(walletClient, {
                    env,
                    dbPath: `/tmp/xmtp-${wallet.inboxId}.db`
                });
            }
            const conversation = await client.conversations.newConversation(toAddress);
            const sent = await conversation.send(content);
            return sent.messageId;
        },
        async waitForMessage(timeout = 30000) {
            if (!client) {
                client = await Client.create(walletClient, {
                    env,
                    dbPath: `/tmp/xmtp-${wallet.inboxId}.db`
                });
            }
            const startTime = Date.now();
            while (Date.now() - startTime < timeout) {
                const conversations = await client.conversations.list();
                for (const conversation of conversations) {
                    const messages = await conversation.messages({ limit: 10 });
                    for (const message of messages) {
                        const msg = {
                            id: message.id,
                            sender: message.senderInboxId,
                            content: message.content(),
                            timestamp: message.sentAt
                        };
                        if (!pendingMessages.find(m => m.id === msg.id)) {
                            pendingMessages.push(msg);
                            return msg;
                        }
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return null;
        },
        async close() {
            if (client) {
                await client.close();
                client = null;
            }
        }
    };
}
export function loadTestWallets(path) {
    const content = require('fs').readFileSync(path, 'utf-8');
    const data = JSON.parse(content);
    return data.wallets.map((w) => ({
        inboxId: w.inboxId,
        address: w.address,
        privateKey: w.privateKey
    }));
}
