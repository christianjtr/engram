import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    calculateObservationLifecycle,
    calculateSessionStatus,
    normalizeTopicKey,
    normalizeObservationType,
    buildDynamicTypeRegistry,
    DEFAULT_TYPE_METADATA,
} from "../../src/core/derivations.ts";

describe("Derivations", () => {
    describe("calculateObservationLifecycle", () => {
        it("returns active when review_after is absent or empty", () => {
            assert.equal(calculateObservationLifecycle(undefined), "active");
            assert.equal(calculateObservationLifecycle(null), "active");
            assert.equal(calculateObservationLifecycle(""), "active");
            assert.equal(calculateObservationLifecycle("   "), "active");
        });

        it("returns active when review_after date is in the future", () => {
            const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
            assert.equal(calculateObservationLifecycle(future), "active");
        });

        it("returns stale when review_after date is in the past", () => {
            const past = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
            assert.equal(calculateObservationLifecycle(past), "stale");
        });

        it("returns active when review_after is malformed", () => {
            assert.equal(calculateObservationLifecycle("not-a-date"), "active");
        });
    });

    describe("calculateSessionStatus", () => {
        it("returns active when ended_at is missing", () => {
            assert.equal(calculateSessionStatus({}), "active");
            assert.equal(calculateSessionStatus({ ended_at: null }), "active");
            assert.equal(calculateSessionStatus({ ended_at: "" }), "active");
        });

        it("returns completed when ended_at and summary are present", () => {
            assert.equal(
                calculateSessionStatus({
                    ended_at: "2026-09-17T12:00:00Z",
                    summary: "Completed feature implementation",
                }),
                "completed"
            );
        });

        it("returns interrupted when ended_at is present but summary is missing", () => {
            assert.equal(
                calculateSessionStatus({
                    ended_at: "2026-09-17T12:00:00Z",
                    summary: undefined,
                }),
                "interrupted"
            );
            assert.equal(
                calculateSessionStatus({
                    ended_at: "2026-09-17T12:00:00Z",
                    summary: "   ",
                }),
                "interrupted"
            );
        });
    });

    describe("normalizations", () => {
        it("normalizes topic keys with general fallback", () => {
            assert.equal(normalizeTopicKey(undefined), "general");
            assert.equal(normalizeTopicKey(""), "general");
            assert.equal(normalizeTopicKey("  architecture/plugins  "), "architecture/plugins");
        });

        it("normalizes observation types with other fallback", () => {
            assert.equal(normalizeObservationType(undefined), "other");
            assert.equal(normalizeObservationType(""), "other");
            assert.equal(normalizeObservationType("  CONVENTION  "), "convention");
        });
    });

    describe("buildDynamicTypeRegistry", () => {
        it("includes standard defaults without icons", () => {
            const registry = buildDynamicTypeRegistry([]);
            assert.ok(registry.convention);
            assert.equal(registry.convention.label, "CONVENTION");
            assert.equal(registry.convention.isConventionLike, true);
            assert.equal(registry.decision.label, "DECISION");
            assert.equal(registry.bugfix.label, "BUGFIX");
            assert.equal(registry.bugfix.isConventionLike, false);

            // Ensure no icons/emojis exist in labels
            for (const meta of Object.values(registry)) {
                assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(meta.label));
            }
        });

        it("dynamically registers custom types found in observations", () => {
            const observations = [
                { type: "security-audit" },
                { type: "custom_rule" },
            ];
            const registry = buildDynamicTypeRegistry(observations);

            assert.ok(registry["security-audit"]);
            assert.equal(registry["security-audit"].label, "SECURITY-AUDIT");
            assert.equal(registry["security-audit"].isConventionLike, false);
            assert.ok(registry["security-audit"].color.startsWith("#"));

            assert.ok(registry.custom_rule);
            assert.equal(registry.custom_rule.label, "CUSTOM_RULE");
        });
    });
});
