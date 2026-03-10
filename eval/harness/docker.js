import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
export async function dockerComposeUp(composeFile, projectName = 'hybrd-eval') {
    try {
        const { stdout, stderr } = await execAsync(`docker compose -f ${composeFile} -p ${projectName} up -d`, { timeout: 300000 });
        return { success: true, output: stdout + stderr };
    }
    catch (error) {
        const err = error;
        return { success: false, output: '', error: err.message ?? 'Unknown error' };
    }
}
export async function dockerComposeDown(composeFile, projectName = 'hybrd-eval') {
    try {
        const { stdout, stderr } = await execAsync(`docker compose -f ${composeFile} -p ${projectName} down`, { timeout: 120000 });
        return { success: true, output: stdout + stderr };
    }
    catch (error) {
        const err = error;
        return { success: false, output: '', error: err.message ?? 'Unknown error' };
    }
}
export async function dockerComposeLogs(composeFile, service, projectName = 'hybrd-eval') {
    try {
        const { stdout } = await execAsync(`docker compose -f ${composeFile} -p ${projectName} logs ${service}`, { timeout: 30000 });
        return stdout;
    }
    catch {
        return '';
    }
}
export async function waitForService(url, timeout = 60000, interval = 2000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return true;
            }
        }
        catch {
            // Service not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    return false;
}
