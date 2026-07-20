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
        title: `${C.cyan}${C.bright}      🧠 ENGRAM SEMANTIC GRAPH INITIALIZATION       ${C.reset}`
    },
    strategy: {
        title: `\n${C.yellow}${C.bright}▶ 🛠️  Smart Memory Isolation (Session-Based)${C.reset}`,
        description:
            `   This feature creates an invisible boundary between your coding sessions.\n\n` +
            `   ${C.green}• WITH ISOLATION (Recommended):${C.reset}\n` +
            `     The AI stays 100% focused on your current task. It will prioritize\n` +
            `     the decisions, files, and notes from your active session, preventing\n` +
            `     older, unrelated project history from cluttering the workspace memory.\n\n` +
            `   ${C.red}• WITHOUT ISOLATION:${C.reset}\n` +
            `     The AI mixes all historical project memories together. It might get\n` +
            `     distracted by legacy choices or past conventions you already moved away from,\n` +
            `     reducing the accuracy of its suggestions.\n`,
        query: (current: boolean) => `${C.cyan}➔ Enable session isolation? [y/n] (Default: ${current ? 'y' : 'n'}): ${C.reset}`,
        success: (status: boolean) => `   ${C.green}✓ Session isolation is now: ${status ? "ENABLED 🛡️" : "DISABLED ⚠️"}${C.reset}\n`,
        error: `${C.red}❌ Please enter 'y' for Yes or 'n' for No.${C.reset}`
    },
    footer: {
        successHeading: `${C.green}${C.bright}🎉 SUCCESS: Your AI map settings are ready!${C.reset}`,
        storageLabel: `   Saved in your local system at: `,
        errorHeading: `${C.red}❌ Error writing settings file:${C.reset}`
    }
};
