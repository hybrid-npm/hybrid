import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { createTestRunner } from './harness/runner.js';
import { dockerComposeUp, dockerComposeDown, dockerComposeLogs } from './harness/docker.js';
import { createBootstrappingScenarios, createMessagingScenarios, createAclScenarios, createCapabilitiesScenarios, createErrorsScenarios } from './scenarios/index.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
async function main() {
    const agentUrl = process.env.AGENT_URL || 'http://localhost:8454';
    const xmtpSidecarUrl = process.env.XMTP_SIDECAR_URL || 'http://localhost:8455';
    const walletsPath = process.env.TEST_WALLETS_PATH || resolve(__dirname, 'fixtures/wallets.json');
    const resultsPath = process.env.RESULTS_PATH || resolve(__dirname, 'results/results.json');
    const config = {
        agentUrl,
        xmtpSidecarUrl,
        walletsPath,
        resultsPath,
        timeout: 60000
    };
    const runner = createTestRunner();
    const useDocker = process.env.SKIP_DOCKER !== 'true';
    if (useDocker) {
        console.log('Starting Docker environment...');
        const composeFile = resolve(__dirname, 'docker-compose.yml');
        const upResult = await dockerComposeUp(composeFile, 'hybrd-eval');
        if (!upResult.success) {
            console.error('Failed to start Docker:', upResult.error);
            process.exit(1);
        }
        console.log('Waiting for services to be ready...');
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    try {
        runner.addScenario(...createBootstrappingScenarios());
        runner.addScenario(...createMessagingScenarios());
        runner.addScenario(...createAclScenarios());
        runner.addScenario(...createCapabilitiesScenarios());
        runner.addScenario(...createErrorsScenarios());
        const results = await runner.run(config);
        const failed = results.filter(r => r.status === 'failed');
        if (failed.length > 0) {
            console.error(`\n${failed.length} test(s) failed:`);
            for (const f of failed) {
                console.error(`  - ${f.scenario}: ${f.error}`);
            }
            if (useDocker) {
                console.log('\n--- Agent logs ---');
                console.log(await dockerComposeLogs(resolve(__dirname, 'docker-compose.yml'), 'agent', 'hybrd-eval'));
            }
            process.exit(1);
        }
    }
    finally {
        if (useDocker) {
            console.log('\nTearing down Docker environment...');
            await dockerComposeDown(resolve(__dirname, 'docker-compose.yml'), 'hybrd-eval');
        }
    }
}
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
