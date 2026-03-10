import type { TestScenario, TestResult, EvalConfig } from './types.js';
export declare class TestRunner {
    private scenarios;
    private results;
    addScenario(scenario: TestScenario): void;
    run(config: EvalConfig): Promise<TestResult[]>;
    private runScenario;
    private saveResults;
    private generateJUnitXml;
}
export declare function createTestRunner(): TestRunner;
