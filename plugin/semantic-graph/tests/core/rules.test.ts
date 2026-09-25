import assert from "node:assert/strict";
import test from "node:test";
import {
    calculateObservationLifecycle,
    calculateSessionStatus,
    isConventionLike,
    normalizeObservationType,
    normalizeTopicKey,
} from "../../src/core/graph/rules";
import { STANDARD_OBSERVATION_TYPES } from "../../src/types";

test("normalizeObservationType normalizes type string", () => {
    assert.equal(normalizeObservationType("  CONVENTION "), "convention");
    assert.equal(normalizeObservationType("architecture"), "architecture");
    assert.equal(normalizeObservationType(null), "other");
    assert.equal(normalizeObservationType(undefined), "other");
    assert.equal(normalizeObservationType("   "), "other");
});

test("normalizeTopicKey normalizes topic key", () => {
    assert.equal(normalizeTopicKey("  auth/tokens  "), "auth/tokens");
    assert.equal(normalizeTopicKey(null), "general");
    assert.equal(normalizeTopicKey(undefined), "general");
    assert.equal(normalizeTopicKey("   "), "general");
});

test("isConventionLike detects convention-like types", () => {
    assert.equal(isConventionLike("convention"), true);
    assert.equal(isConventionLike("DECISION"), true);
    assert.equal(isConventionLike("Architecture"), true);
    assert.equal(isConventionLike("pattern"), true);
    assert.equal(isConventionLike("bugfix"), false);
    assert.equal(isConventionLike("learning"), false);
    assert.equal(isConventionLike("discovery"), false);
});

test("STANDARD_OBSERVATION_TYPES is the catalog for convention-like types", () => {
    for (const type of STANDARD_OBSERVATION_TYPES) {
        const expected =
            type === "convention" ||
            type === "decision" ||
            type === "architecture" ||
            type === "pattern";
        assert.equal(isConventionLike(type), expected);
    }
    assert.equal(isConventionLike("custom-type"), false);
});

test("calculateObservationLifecycle evaluates UTC lifecycle correctly", () => {
    const ref = new Date("2026-09-25T12:00:00.000Z");

    // Null/empty
    assert.equal(calculateObservationLifecycle(null, ref), "active");
    assert.equal(calculateObservationLifecycle("", ref), "active");

    // Future -> active
    assert.equal(calculateObservationLifecycle("2026-09-26 12:00:00", ref), "active");
    assert.equal(calculateObservationLifecycle("2026-09-26T12:00:00Z", ref), "active");
    assert.equal(calculateObservationLifecycle("2026-09-26", ref), "active");

    // Past -> stale
    assert.equal(calculateObservationLifecycle("2026-09-24 12:00:00", ref), "stale");
    assert.equal(calculateObservationLifecycle("2026-09-24T12:00:00Z", ref), "stale");
    assert.equal(calculateObservationLifecycle("2026-09-24", ref), "stale");

    // Equal timestamp -> stale (at or before reference time is stale)
    assert.equal(calculateObservationLifecycle("2026-09-25T12:00:00Z", ref), "stale");

    // Microsecond / RFC3339Nano timestamps
    assert.equal(calculateObservationLifecycle("2026-09-24T12:00:00.123456Z", ref), "stale");
    assert.equal(calculateObservationLifecycle("2026-09-26T12:00:00.123456Z", ref), "active");
});

test("calculateSessionStatus computes correct status", () => {
    assert.equal(calculateSessionStatus({ ended_at: null }), "active");
    assert.equal(calculateSessionStatus({ ended_at: "" }), "active");
    assert.equal(
        calculateSessionStatus({ ended_at: "2026-09-25T12:00:00Z", summary: "Completed task" }),
        "completed",
    );
    assert.equal(
        calculateSessionStatus({ ended_at: "2026-09-25T12:00:00Z", summary: null }),
        "interrupted",
    );
    assert.equal(
        calculateSessionStatus({ ended_at: "2026-09-25T12:00:00Z", summary: "  " }),
        "interrupted",
    );
});
