import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { readFileSync } from "fs";

const isProd = process.argv.includes("--production") || process.env.NODE_ENV === "production";
const isWatch = process.argv.includes("--watch");

const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

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
    define: {
        "__PLUGIN_VERSION__": JSON.stringify(version),
    },
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
