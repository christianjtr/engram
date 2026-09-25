export interface CliFlags {
    all: boolean;
    includeStale: boolean;
    globalLimit?: number;
    allGlobals?: boolean;
}

const VALID_FLAGS = new Set(["-a", "-s", "-h", "--help", "--globals"]);

export function parseCliFlags(args: string[]): CliFlags {
    const seen = new Set<string>();
    let hasAllGlobals = false;
    let limitArg: string | undefined;

    for (const arg of args) {
        if (!arg.startsWith("-")) {
            throw new Error(`Unexpected positional argument: ${arg}`);
        }

        if (arg === "--globals") {
            if (limitArg) {
                throw new Error("--globals and --globals=<n> cannot be used together");
            }
            if (hasAllGlobals) {
                throw new Error("Duplicate flag: --globals");
            }
            hasAllGlobals = true;
            continue;
        }

        if (arg.startsWith("--globals=")) {
            if (hasAllGlobals) {
                throw new Error("--globals and --globals=<n> cannot be used together");
            }
            if (limitArg) {
                throw new Error("Duplicate flag: --globals");
            }
            limitArg = arg;
            continue;
        }

        if (seen.has(arg)) {
            throw new Error(`Duplicate flag: ${arg}`);
        }
        seen.add(arg);

        if (!VALID_FLAGS.has(arg)) {
            throw new Error(`Unknown flag: ${arg}`);
        }
    }

    let globalLimit: number | undefined;
    if (limitArg) {
        const val = limitArg.slice("--globals=".length).trim();
        const num = Number(val);

        if (!val || !Number.isSafeInteger(num) || num < 0) {
            throw new Error("Invalid value for --globals: must be a non-negative integer");
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
