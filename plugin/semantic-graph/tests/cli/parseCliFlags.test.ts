import assert from "node:assert/strict";
import test from "node:test";
import { parseCliFlags } from "../../src/cli/parseCliFlags";

test("parseCliFlags with no arguments returns defaults", () => {
    const flags = parseCliFlags([]);
    assert.deepEqual(flags, {
        all: false,
        includeStale: false,
        globalLimit: undefined,
        allGlobals: false,
    });
});

test("parseCliFlags parses short flags", () => {
    const flags = parseCliFlags(["-a", "-s"]);
    assert.equal(flags.all, true);
    assert.equal(flags.includeStale, true);
    assert.equal(flags.allGlobals, false);
});

test("parseCliFlags parses --global-limit=<n>", () => {
    const flags = parseCliFlags(["--global-limit=25"]);
    assert.equal(flags.globalLimit, 25);
    assert.equal(flags.all, false);
});

test("parseCliFlags parses --all-globals", () => {
    const flags = parseCliFlags(["--all-globals"]);
    assert.equal(flags.allGlobals, true);
    assert.equal(flags.globalLimit, undefined);
});

test("parseCliFlags throws on --global-limit without value", () => {
    assert.throws(() => parseCliFlags(["--global-limit"]), /Missing value for --global-limit/);
});

test("parseCliFlags throws on invalid --global-limit value", () => {
    assert.throws(() => parseCliFlags(["--global-limit=abc"]), /Invalid value for --global-limit/);
    assert.throws(() => parseCliFlags(["--global-limit=-5"]), /Invalid value for --global-limit/);
});

test("parseCliFlags throws when combining --all-globals and --global-limit", () => {
    assert.throws(
        () => parseCliFlags(["--all-globals", "--global-limit=10"]),
        /--all-globals and --global-limit cannot be used together/,
    );
});

test("parseCliFlags throws on duplicate flags", () => {
    assert.throws(() => parseCliFlags(["-a", "-a"]), /Duplicate flag: -a/);
    assert.throws(() => parseCliFlags(["-s", "-s"]), /Duplicate flag: -s/);
});

test("parseCliFlags throws on unexpected positional arguments", () => {
    assert.throws(
        () => parseCliFlags(["my-project"]),
        /Unexpected positional argument: my-project/,
    );
});

test("parseCliFlags throws on unknown short or long flags", () => {
    assert.throws(() => parseCliFlags(["-x"]), /Unknown flag: -x/);
    assert.throws(() => parseCliFlags(["--unknown-flag"]), /Unknown flag: --unknown-flag/);
});
