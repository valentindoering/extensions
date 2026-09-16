import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("AI configuration lives in extension preferences", () => {
  const preferenceNames = manifest.preferences.map(
    (preference: { name: string }) => preference.name,
  );

  assert.deepEqual(preferenceNames.slice(0, 4), [
    "aiProvider",
    "aiApiKey",
    "aiModel",
    "aiBaseUrl",
  ]);
  assert.equal(
    manifest.commands.some(
      (command: { name: string }) => command.name === "configure-model",
    ),
    false,
  );
});
