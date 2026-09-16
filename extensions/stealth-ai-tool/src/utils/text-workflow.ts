export type TextWorkflow = "raycast" | "script";

export async function runTextWorkflow<T>(
  workflow: TextWorkflow,
  handlers: Record<TextWorkflow, () => Promise<T>>,
): Promise<T> {
  return workflow === "script" ? handlers.script() : handlers.raycast();
}
