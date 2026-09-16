import { Application, Clipboard } from "@raycast/api";
import { execFileSync } from "child_process";

const ACTIVATE_AND_COPY_SCRIPT = `
on run argv
  set targetBundleId to item 1 of argv
  tell application "System Events"
    if targetBundleId is not "" then
      try
        set frontmost of first application process whose bundle identifier is targetBundleId to true
      end try
    end if
    delay 0.1
    keystroke "c" using command down
  end tell
end run
`;

const ACTIVATE_SCRIPT = `
on run argv
  set targetBundleId to item 1 of argv
  if targetBundleId is "" then return
  tell application "System Events"
    set frontmost of first application process whose bundle identifier is targetBundleId to true
  end tell
end run
`;

function runAppleScript(script: string, args: string[] = []): void {
  execFileSync("/usr/bin/osascript", ["-e", script, ...args], {
    timeout: 5_000,
  });
}

async function restoreClipboard(
  content: Awaited<ReturnType<typeof Clipboard.read>>,
): Promise<void> {
  if (content.file) {
    await Clipboard.copy({ file: content.file });
  } else if (content.html) {
    await Clipboard.copy({ html: content.html, text: content.text });
  } else if (content.text !== undefined) {
    await Clipboard.copy(content.text);
  } else {
    await Clipboard.clear();
  }
}

/**
 * macOS-only fallback for applications where Raycast's getSelectedText API
 * cannot access the current selection. It temporarily uses Cmd+C, then restores
 * the user's previous clipboard before returning.
 */
export async function getSelectedTextViaClipboard(
  targetApplication?: Application,
): Promise<string> {
  const previousClipboard = await Clipboard.read();

  try {
    await Clipboard.clear();
    runAppleScript(ACTIVATE_AND_COPY_SCRIPT, [
      targetApplication?.bundleId ?? "",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return (await Clipboard.readText()) ?? "";
  } finally {
    await restoreClipboard(previousClipboard);
  }
}

export async function activateApplication(
  application?: Application,
): Promise<void> {
  if (!application?.bundleId) return;
  runAppleScript(ACTIVATE_SCRIPT, [application.bundleId]);
  await new Promise((resolve) => setTimeout(resolve, 150));
}
