import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface DockerComposeResult {
  success: boolean
  output: string
  error?: string
}

export async function dockerComposeUp(
  composeFile: string,
  projectName: string = 'hybrd-eval'
): Promise<DockerComposeResult> {
  try {
    const { stdout, stderr } = await execAsync(
      `docker compose -f ${composeFile} -p ${projectName} up -d`,
      { timeout: 300000 }
    )
    return { success: true, output: stdout + stderr }
  } catch (error: unknown) {
    const err = error as { message?: string; stdout?: string; stderr?: string }
    return { success: false, output: '', error: err.message ?? 'Unknown error' }
  }
}

export async function dockerComposeDown(
  composeFile: string,
  projectName: string = 'hybrd-eval'
): Promise<DockerComposeResult> {
  try {
    const { stdout, stderr } = await execAsync(
      `docker compose -f ${composeFile} -p ${projectName} down`,
      { timeout: 120000 }
    )
    return { success: true, output: stdout + stderr }
  } catch (error: unknown) {
    const err = error as { message?: string }
    return { success: false, output: '', error: err.message ?? 'Unknown error' }
  }
}

export async function dockerComposeLogs(
  composeFile: string,
  service: string,
  projectName: string = 'hybrd-eval'
): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `docker compose -f ${composeFile} -p ${projectName} logs ${service}`,
      { timeout: 30000 }
    )
    return stdout
  } catch {
    return ''
  }
}

export async function waitForService(
  url: string,
  timeout: number = 60000,
  interval: number = 2000
): Promise<boolean> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return true
      }
    } catch {
      // Service not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  
  return false
}
