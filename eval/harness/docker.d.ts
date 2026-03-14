export interface DockerComposeResult {
    success: boolean;
    output: string;
    error?: string;
}
export declare function dockerComposeUp(composeFile: string, projectName?: string): Promise<DockerComposeResult>;
export declare function dockerComposeDown(composeFile: string, projectName?: string): Promise<DockerComposeResult>;
export declare function dockerComposeLogs(composeFile: string, service: string, projectName?: string): Promise<string>;
export declare function waitForService(url: string, timeout?: number, interval?: number): Promise<boolean>;
