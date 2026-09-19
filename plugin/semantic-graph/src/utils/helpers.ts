import { EngramHttpClient } from "../core/client";

/**
 * Uses the caller's explicit environment override, otherwise resolves its cwd.
 * Resolution errors propagate so generation and status cannot guess a project.
 */
export async function getCurrentProjectName(): Promise<string> {
    return process.env.ENGRAM_PROJECT?.trim() || new EngramHttpClient().resolveCurrentProject();
}
