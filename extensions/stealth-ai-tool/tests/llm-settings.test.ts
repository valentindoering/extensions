import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("credentials live in preferences and models use the dynamic picker", () => {
  const preferenceNames = manifest.preferences.map(
    (preference: { name: string }) => preference.name,
  );

  assert.deepEqual(preferenceNames.slice(0, 3), [
    "aiProvider",
    "aiApiKey",
    "aiBaseUrl",
  ]);
  assert.equal(preferenceNames.includes("aiModel"), false);
  assert.equal(
    manifest.commands.some(
      (command: { name: string }) => command.name === "select-model",
    ),
    true,
  );
  assert.equal(
    manifest.commands.some(
      (command: { name: string }) => command.name === "configure-model",
    ),
    false,
  );
});
