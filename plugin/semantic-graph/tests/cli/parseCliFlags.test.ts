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

test("parseCliFlags parses --globals=<n>", () => {
    const flags = parseCliFlags(["--globals=25"]);
    assert.equal(flags.globalLimit, 25);
    assert.equal(flags.all, false);
    assert.equal(flags.allGlobals, false);
});

test("parseCliFlags parses --globals", () => {
    const flags = parseCliFlags(["--globals"]);
    assert.equal(flags.allGlobals, true);
    assert.equal(flags.globalLimit, undefined);
});

test("parseCliFlags throws on invalid --globals value", () => {
    assert.throws(() => parseCliFlags(["--globals=abc"]), /Invalid value for --globals/);
    assert.throws(() => parseCliFlags(["--globals=-5"]), /Invalid value for --globals/);
    assert.throws(() => parseCliFlags(["--globals="]), /Invalid value for --globals/);
});

test("parseCliFlags throws when combining --globals and --globals=<n>", () => {
    assert.throws(
        () => parseCliFlags(["--globals", "--globals=10"]),
        /--globals and --globals=<n> cannot be used together/,
    );
    assert.throws(
        () => parseCliFlags(["--globals=10", "--globals"]),
        /--globals and --globals=<n> cannot be used together/,
    );
});

test("parseCliFlags throws on duplicate flags", () => {
    assert.throws(() => parseCliFlags(["-a", "-a"]), /Duplicate flag: -a/);
    assert.throws(() => parseCliFlags(["-s", "-s"]), /Duplicate flag: -s/);
    assert.throws(() => parseCliFlags(["--globals", "--globals"]), /Duplicate flag: --globals/);
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
    assert.throws(() => parseCliFlags(["--all-globals"]), /Unknown flag: --all-globals/);
    assert.throws(() => parseCliFlags(["--global-limit=10"]), /Unknown flag: --global-limit=10/);
});
