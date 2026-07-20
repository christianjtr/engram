export const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
    dim: "\x1b[2m"
};

export const W = {
    banner: {
        line: `${C.blue}${C.bright}====================================================${C.reset}`,
        title: `${C.cyan}${C.bright}      🧠 ENGRAM SEMANTIC GRAPH CONFIG WIZARD       ${C.reset}`
    },
    trigger: {
        title: `\n${C.yellow}${C.bright}▶ 1. Trigger Generation Mode${C.reset}`,
        description: `   Defines how and when your semantic relational map refreshes.\n` +
            `   ${C.bright}1) On Demand${C.reset}  ➔ Managed dynamically by AI Agents via MCP ${C.dim}(Recommended)${C.reset}\n` +
            `   ${C.bright}2) Scheduled${C.reset} ➔ Periodic background execution interval\n`,
        query: `${C.cyan}➔ Select option [1/2] (Default: 1): ${C.reset}`,
        intervalQuery: (current: number) => `${C.cyan}➔ Enter background interval in minutes (Default: ${current}): ${C.reset}`,
        success: (mode: string, min: number) => `   ${C.green}✓ Trigger set to: "${mode}" (${min} min)${C.reset}\n`,
        errorSelection: `${C.red}❌ Invalid selection. Please type 1 or 2.${C.reset}`,
        errorInterval: `${C.red}❌ Please enter a valid positive integer greater than 0.${C.reset}`
    },
    strategy: {
        title: `${C.yellow}${C.bright}▶ 2. Timeline Session Isolation${C.reset}`,
        description: `   Isolates metadata connections strictly inside active developer Session IDs.\n` +
            `   Prevents historical test failure logs from leaking into current prompt scopes.\n`,
        query: (current: boolean) => `${C.cyan}➔ Enforce strict session isolation? [y/n] (Default: ${current ? 'y' : 'n'}): ${C.reset}`,
        success: (status: boolean) => `   ${C.green}✓ Session isolation status set to: ${status}${C.reset}\n`,
        error: `${C.red}❌ Invalid input. Please enter 'y' (yes) or 'n' (no).${C.reset}`
    },
    footer: {
        successHeading: `${C.green}${C.bright}🎉 SUCCESS: Plugin environmental config initialized!${C.reset}`,
        storageLabel: `   Stored securely at: `,
        errorHeading: `${C.red}❌ Critical Exception while dumping config payload:${C.reset}`
    }
};
