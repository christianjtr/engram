import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const isProd = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const isWatch = process.argv.includes("--watch");

const context = await esbuild.context({
    entryPoints: { "semantic-graph": "src/index.ts" },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    external: [
        "@modelcontextprotocol/sdk",
        ...builtins
    ],
    logLevel: "info",
    sourcemap: !isProd ? "inline" : false,
    treeShaking: true,
    outdir: "dist",
    minify: isProd,
    banner: {
        js: "#!/usr/bin/env node",
    },
});

if (isWatch) {
    console.log("⚡ [esbuild] Development mode active. Watching source files...");
    await context.watch();
} else {
    console.log("✨ [esbuild] Compiling production bundle...");
    await context.rebuild();
    await context.dispose();
    process.exit(0);
}
