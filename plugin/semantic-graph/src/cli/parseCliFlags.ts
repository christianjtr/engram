export interface CliFlags {
    all: boolean;
    includeStale: boolean;
    globalLimit?: number;
    allGlobals?: boolean;
}

const VALID_FLAGS = new Set(["-a", "-s", "-h", "--help", "--all-globals"]);

export function parseCliFlags(args: string[]): CliFlags {
    const seen = new Set<string>();

    for (const arg of args) {
        if (!arg.startsWith("-")) {
            throw new Error(`Unexpected positional argument: ${arg}`);
        }

        if (seen.has(arg)) {
            throw new Error(`Duplicate flag: ${arg}`);
        }
        seen.add(arg);

        if (arg === "--global-limit") {
            throw new Error("Missing value for --global-limit. Use --global-limit=<number>");
        }

        if (arg.startsWith("--global-limit=")) {
            continue;
        }

        if (!VALID_FLAGS.has(arg)) {
            throw new Error(`Unknown flag: ${arg}`);
        }
    }

    const hasAllGlobals = args.includes("--all-globals");
    const limitArg = args.find((a) => a.startsWith("--global-limit="));

    if (hasAllGlobals && limitArg) {
        throw new Error("--all-globals and --global-limit cannot be used together");
    }

    let globalLimit: number | undefined;
    if (limitArg) {
        const val = limitArg.slice("--global-limit=".length).trim();
        const num = Number(val);

        if (!val || !Number.isSafeInteger(num) || num < 0) {
            throw new Error("Invalid value for --global-limit: must be a non-negative integer");
        }
        globalLimit = num;
    }

    return {
        all: args.includes("-a"),
        includeStale: args.includes("-s"),
        globalLimit,
        allGlobals: hasAllGlobals,
    };
}
