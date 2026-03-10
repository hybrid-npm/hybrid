import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHttpClient, waitForAgent } from './client.js';
import { createXmtpClient, loadTestWallets } from './xmtp-client.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
export class TestRunner {
    scenarios = [];
    results = [];
    addScenario(scenario) {
        this.scenarios.push(scenario);
    }
    async run(config) {
        console.log('Starting eval harness...\n');
        const http = createHttpClient(config.agentUrl);
        const wallets = existsSync(config.walletsPath)
            ? loadTestWallets(config.walletsPath)
            : [];
        console.log(`Found ${wallets.length} test wallets`);
        console.log(`Agent URL: ${config.agentUrl}\n`);
        const agentReady = await waitForAgent(config.agentUrl, 60000);
        if (!agentReady) {
            throw new Error('Agent failed to become healthy within timeout');
        }
        console.log('Agent is healthy\n');
        let xmtp;
        if (wallets.length > 0) {
            const env = config.agentUrl.includes('dev') ? 'dev' : 'production';
            xmtp = createXmtpClient(wallets[0], env);
            console.log('XMTP client initialized\n');
        }
        const ctx = {
            agentUrl: config.agentUrl,
            xmtpSidecarUrl: config.xmtpSidecarUrl,
            wallets,
            http,
            xmtp: xmtp
        };
        for (const scenario of this.scenarios) {
            const result = await this.runScenario(scenario, ctx, config.timeout ?? 60000);
            this.results.push(result);
            const status = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
            console.log(`${status} ${scenario.name} (${result.duration}ms)`);
            if (result.error) {
                console.log(`  Error: ${result.error}\n`);
            }
        }
        if (xmtp) {
            await xmtp.close();
        }
        this.saveResults(config.resultsPath);
        const passed = this.results.filter(r => r.status === 'passed').length;
        const failed = this.results.filter(r => r.status === 'failed').length;
        const skipped = this.results.filter(r => r.status === 'skipped').length;
        console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
        return this.results;
    }
    async runScenario(scenario, ctx, timeout) {
        const startTime = Date.now();
        try {
            await Promise.race([
                scenario.run(ctx),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout))
            ]);
            return {
                scenario: scenario.name,
                status: 'passed',
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            const err = error;
            return {
                scenario: scenario.name,
                status: 'failed',
                duration: Date.now() - startTime,
                error: err.message ?? 'Unknown error'
            };
        }
    }
    saveResults(resultsPath) {
        const dir = dirname(resultsPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        const junitXml = this.generateJUnitXml();
        writeFileSync(join(dir, 'results.xml'), junitXml);
        writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));
    }
    generateJUnitXml() {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n';
        xml += '  <testsuite name="evals" tests="' + this.results.length + '" failures="'
            + this.results.filter(r => r.status === 'failed').length + '">\n';
        for (const result of this.results) {
            const status = result.status === 'passed' ? 'pass' : result.status;
            xml += '    <testcase name="' + result.scenario + '" time="' + (result.duration / 1000) + '">\n';
            if (result.status === 'failed') {
                xml += '      <failure message="' + (result.error ?? 'failed') + '"/>\n';
            }
            xml += '    </testcase>\n';
        }
        xml += '  </testsuite>\n</testsuites>';
        return xml;
    }
}
export function createTestRunner() {
    return new TestRunner();
}
