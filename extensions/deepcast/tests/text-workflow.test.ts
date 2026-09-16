import assert from "node:assert/strict";
import test from "node:test";
import { runTextWorkflow } from "../src/text-workflow.ts";

test("Raycast workflow never falls back to the script workflow", async () => {
  const calls: string[] = [];
  const result = await runTextWorkflow("raycast", {
    raycast: async () => {
      calls.push("raycast");
      return "";
    },
    script: async () => {
      calls.push("script");
      return "unexpected";
    },
  });

  assert.equal(result, "");
  assert.deepEqual(calls, ["raycast"]);
});

test("Script workflow never falls back to the Raycast workflow", async () => {
  const calls: string[] = [];
  const result = await runTextWorkflow("script", {
    raycast: async () => {
      calls.push("raycast");
      return "unexpected";
    },
    script: async () => {
      calls.push("script");
      return "";
    },
  });

  assert.equal(result, "");
  assert.deepEqual(calls, ["script"]);
});
