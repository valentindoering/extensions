import { Application, Clipboard, getFrontmostApplication, getSelectedText } from "@raycast/api";
import { execFileSync } from "child_process";

export type SelectionMethod = "raycast" | "fallback" | "clipboard";

export interface SelectedContent {
  text: string;
  html?: string;
}

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

function runAppleScript(script: string, args: string[] = []): void {
  execFileSync("/usr/bin/osascript", ["-e", script, ...args], {
    timeout: 5_000,
  });
}

async function readClipboard(): Promise<Awaited<ReturnType<typeof Clipboard.read>>> {
  try {
    return await Clipboard.read();
  } catch {
    return { text: (await Clipboard.readText()) ?? "" };
  }
}

async function restoreClipboard(content: Awaited<ReturnType<typeof Clipboard.read>>): Promise<void> {
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

async function getViaRaycast(): Promise<SelectedContent> {
  try {
    return { text: await getSelectedText() };
  } catch (error) {
    console.log(`Raycast selected-text API failed: ${error}`);
    return { text: "" };
  }
}

async function getViaClipboard(targetApplication?: Application): Promise<SelectedContent> {
  if (process.platform !== "darwin") return { text: "" };

  const previousClipboard = await readClipboard();
  try {
    await Clipboard.clear();
    runAppleScript(ACTIVATE_AND_COPY_SCRIPT, [targetApplication?.bundleId ?? ""]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const selected = await readClipboard();
    return { text: selected.text ?? "", html: selected.html };
  } catch (error) {
    console.log(`Cmd+C selected-text method failed: ${error}`);
    return { text: "" };
  } finally {
    await restoreClipboard(previousClipboard);
  }
}

export async function getTargetApplication(): Promise<Application | undefined> {
  if (process.platform !== "darwin") return undefined;

  try {
    return await getFrontmostApplication();
  } catch (error) {
    console.log(`Could not determine the frontmost application: ${error}`);
    return undefined;
  }
}

export async function getSelectedContent(
  method: SelectionMethod,
  targetApplication?: Application,
): Promise<SelectedContent> {
  if (method === "raycast") return getViaRaycast();

  if (method === "clipboard") {
    const copied = await getViaClipboard(targetApplication);
    return copied.text ? copied : getViaRaycast();
  }

  const selected = await getViaRaycast();
  return selected.text ? selected : getViaClipboard(targetApplication);
}
