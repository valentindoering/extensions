import { AI, getPreferenceValues, LocalStorage } from "@raycast/api";
import http from "http";
import https from "https";

interface AISettings {
  aiProvider?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
}

export interface Model {
  id: string;
  name: string;
  description?: string;
}

interface ModelEntry {
  id: string;
  name?: string;
  display_name?: string;
}

interface GeminiModel {
  name: string;
  displayName: string;
}

interface LMStudioModel {
  id: string;
  type?: string;
  arch?: string;
  quantization?: string;
  state?: string;
}

interface OllamaModel {
  name: string;
  model?: string;
  details?: { parameter_size?: string; quantization_level?: string };
}

const LOCAL_PROVIDERS = new Set(["lmstudio", "ollama"]);
const API_KEY_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
]);
const DEFAULT_BASE_URLS: Record<string, string> = {
  lmstudio: "http://localhost:1234",
  ollama: "http://localhost:11434",
};

export function isLocalProvider(provider: string): boolean {
  return LOCAL_PROVIDERS.has(provider);
}

export function requiresApiKey(provider: string): boolean {
  return API_KEY_PROVIDERS.has(provider);
}

export function defaultBaseUrl(provider: string): string {
  return DEFAULT_BASE_URLS[provider] ?? "";
}

/**
 * Raised when the extension is misconfigured (missing key/model, unreachable
 * local server). The action runner turns these into a toast that links straight
 * to the extension settings.
 */
export class LLMConfigError extends Error {
  constructor(
    message: string,
    public readonly destination: "settings" | "model" = "settings",
  ) {
    super(message);
    this.name = "LLMConfigError";
  }
}

/** Remote calls get a short leash; local models may need to warm up first. */
const REMOTE_TIMEOUT_MS = 60_000;
const LOCAL_TIMEOUT_MS = 180_000;
const MAX_TOKENS = 4096;

/**
 * Accepts anything the user is likely to paste ("localhost:1234",
 * "http://127.0.0.1:1234/v1/", "http://host:11434/api") and reduces it to a
 * bare origin that the per-provider paths below can be appended to.
 */
export function normalizeBaseUrl(raw: string, provider: string): string {
  let value = (raw || "").trim();
  if (!value) return defaultBaseUrl(provider);
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;
  try {
    const url = new URL(value);
    const path = url.pathname
      .replace(/\/+$/, "")
      .replace(/\/(v1|api(\/v\d+)?)$/i, "");
    return `${url.origin}${path}`;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

export class LLMService {
  public static async getProvider(): Promise<string> {
    return getPreferenceValues<AISettings>().aiProvider || "raycast";
  }

  public static async getApiKey(): Promise<string> {
    return getPreferenceValues<AISettings>().aiApiKey?.trim() || "";
  }

  public static async getSelectedModel(provider?: string): Promise<string> {
    const activeProvider = provider ?? (await this.getProvider());
    return (
      (await LocalStorage.getItem<string>(
        `selected_model_${activeProvider}`,
      )) || ""
    );
  }

  public static async setSelectedModel(
    provider: string,
    model: string,
  ): Promise<void> {
    await LocalStorage.setItem(`selected_model_${provider}`, model.trim());
  }

  public static async getBaseUrl(provider: string): Promise<string> {
    const configured = getPreferenceValues<AISettings>().aiBaseUrl || "";
    return normalizeBaseUrl(configured, provider);
  }

  // ---------------------------------------------------------------- models

  public static async fetchModels(
    provider: string,
    key: string,
    baseUrl?: string,
  ): Promise<Model[]> {
    const base = normalizeBaseUrl(baseUrl || "", provider);

    if (provider === "openai") {
      const response = await this.request(
        "https://api.openai.com/v1/models",
        "GET",
        { Authorization: `Bearer ${key}` },
      );
      return response.data
        .map((model: ModelEntry) => ({ id: model.id, name: model.id }))
        .sort((a: Model, b: Model) => a.id.localeCompare(b.id));
    }

    if (provider === "anthropic") {
      const response = await this.request(
        "https://api.anthropic.com/v1/models",
        "GET",
        {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
      );
      return response.data
        .map((model: ModelEntry) => ({
          id: model.id,
          name: model.display_name || model.id,
        }))
        .sort((a: Model, b: Model) => a.id.localeCompare(b.id));
    }

    if (provider === "gemini") {
      const response = await this.request(
        "https://generativelanguage.googleapis.com/v1beta/models",
        "GET",
        { "x-goog-api-key": key },
      );
      return response.models
        .filter((model: GeminiModel) => model.name.includes("gemini"))
        .map((model: GeminiModel) => ({
          id: model.name.replace("models/", ""),
          name: model.displayName,
        }));
    }

    if (provider === "openrouter") {
      const response = await this.request(
        "https://openrouter.ai/api/v1/models",
        "GET",
        {},
      );
      return response.data
        .map((model: ModelEntry) => ({
          id: model.id,
          name: model.name || model.id,
        }))
        .sort((a: Model, b: Model) => a.id.localeCompare(b.id));
    }

    if (provider === "lmstudio") {
      return this.fetchLMStudioModels(base, key);
    }
    if (provider === "ollama") return this.fetchOllamaModels(base, key);

    return [];
  }

  private static async fetchLMStudioModels(
    base: string,
    key: string,
  ): Promise<Model[]> {
    const headers = this.localHeaders(key);
    try {
      const response = await this.request(
        `${base}/api/v0/models`,
        "GET",
        headers,
        null,
        LOCAL_TIMEOUT_MS,
      );
      const entries: LMStudioModel[] = response.data || [];
      return entries
        .filter((model) => model.type !== "embeddings")
        .map((model) => ({
          id: model.id,
          name: model.state === "loaded" ? `${model.id} (loaded)` : model.id,
          description:
            [model.arch, model.quantization].filter(Boolean).join(" · ") ||
            undefined,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    } catch {
      const response = await this.request(
        `${base}/v1/models`,
        "GET",
        headers,
        null,
        LOCAL_TIMEOUT_MS,
      );
      const entries: ModelEntry[] = response.data || [];
      return entries
        .map((model) => ({ id: model.id, name: model.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
    }
  }

  private static async fetchOllamaModels(
    base: string,
    key: string,
  ): Promise<Model[]> {
    const response = await this.request(
      `${base}/api/tags`,
      "GET",
      this.localHeaders(key),
      null,
      LOCAL_TIMEOUT_MS,
    );
    const entries: OllamaModel[] = response.models || [];
    return entries
      .map((model) => ({
        id: model.model || model.name,
        name: model.name,
        description:
          [model.details?.parameter_size, model.details?.quantization_level]
            .filter(Boolean)
            .join(" · ") || undefined,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  // ------------------------------------------------------------ completion

  public static async askAI(prompt: string): Promise<string> {
    const provider = await this.getProvider();

    if (provider === "raycast") return this.callRaycastAI(prompt);

    const model = await this.getSelectedModel(provider);
    const apiKey = await this.getApiKey();

    if (requiresApiKey(provider) && !apiKey) {
      throw new LLMConfigError(
        `API key required for ${provider}. Set it in the extension settings.`,
      );
    }
    if (!model) {
      throw new LLMConfigError(
        `No model selected for ${provider}. Run "Select AI Model".`,
        "model",
      );
    }

    switch (provider) {
      case "openai":
        return this.callOpenAICompatible(
          "https://api.openai.com/v1/chat/completions",
          { Authorization: `Bearer ${apiKey}` },
          model,
          prompt,
          REMOTE_TIMEOUT_MS,
        );
      case "anthropic":
        return this.callAnthropic(apiKey, model, prompt);
      case "gemini":
        return this.callGemini(apiKey, model, prompt);
      case "openrouter":
        return this.callOpenAICompatible(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://raycast.com",
            "X-Title": "Raycast Stealth AI",
          },
          model,
          prompt,
          REMOTE_TIMEOUT_MS,
          0.7,
        );
      case "lmstudio":
        return this.callOpenAICompatible(
          `${await this.getBaseUrl(provider)}/v1/chat/completions`,
          this.localHeaders(apiKey),
          model,
          prompt,
          LOCAL_TIMEOUT_MS,
          0.7,
        );
      case "ollama":
        return this.callOllama(
          await this.getBaseUrl(provider),
          apiKey,
          model,
          prompt,
        );
      default:
        throw new LLMConfigError(`Unknown provider: ${provider}`);
    }
  }

  private static async callRaycastAI(prompt: string): Promise<string> {
    try {
      return await AI.ask(prompt);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("Model is not supported")) {
        throw new LLMConfigError(
          "Raycast AI is not available on this account. Pick another provider in the extension settings.",
        );
      }
      throw e;
    }
  }

  /** OpenAI, OpenRouter and LM Studio all speak the same chat-completions dialect. */
  private static async callOpenAICompatible(
    url: string,
    headers: Record<string, string>,
    model: string,
    prompt: string,
    timeoutMs: number,
    temperature?: number,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
    };
    if (temperature !== undefined) body.temperature = temperature;

    const response = await this.request(
      url,
      "POST",
      { "Content-Type": "application/json", ...headers },
      body,
      timeoutMs,
    );
    return response.choices?.[0]?.message?.content?.trim() || "";
  }

  private static async callAnthropic(
    key: string,
    model: string,
    prompt: string,
  ): Promise<string> {
    const response = await this.request(
      "https://api.anthropic.com/v1/messages",
      "POST",
      {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      {
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: MAX_TOKENS,
      },
      REMOTE_TIMEOUT_MS,
    );
    return response.content?.[0]?.text?.trim() || "";
  }

  private static async callGemini(
    key: string,
    model: string,
    prompt: string,
  ): Promise<string> {
    const response = await this.request(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      "POST",
      { "Content-Type": "application/json", "x-goog-api-key": key },
      { contents: [{ parts: [{ text: prompt }] }] },
      REMOTE_TIMEOUT_MS,
    );
    return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  }

  private static async callOllama(
    base: string,
    key: string,
    model: string,
    prompt: string,
  ): Promise<string> {
    const response = await this.request(
      `${base}/api/chat`,
      "POST",
      { "Content-Type": "application/json", ...this.localHeaders(key) },
      {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.7 },
      },
      LOCAL_TIMEOUT_MS,
    );
    return response.message?.content?.trim() || "";
  }

  /** Local servers usually need no auth, but both accept a bearer token when secured. */
  private static localHeaders(key: string): Record<string, string> {
    return key ? { Authorization: `Bearer ${key}` } : {};
  }

  // --------------------------------------------------------------- transport

  private static request(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: Record<string, unknown> | null = null,
    timeoutMs: number = REMOTE_TIMEOUT_MS,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let target: URL;
      try {
        target = new URL(url);
      } catch {
        reject(new LLMConfigError(`Invalid endpoint URL: ${url}`));
        return;
      }

      // Local providers are served over plain HTTP, so pick the module per scheme.
      const transport = target.protocol === "http:" ? http : https;
      const payload = body ? JSON.stringify(body) : null;

      const req = transport.request(
        target,
        {
          method,
          headers: {
            Accept: "application/json",
            ...headers,
            ...(payload
              ? { "Content-Length": Buffer.byteLength(payload) }
              : {}),
          },
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            const status = res.statusCode ?? 0;
            if (status >= 200 && status < 300) {
              try {
                resolve(data ? JSON.parse(data) : {});
              } catch {
                reject(
                  new Error(
                    `Could not parse response from ${target.host}: ${data.slice(0, 200)}`,
                  ),
                );
              }
            } else {
              reject(this.httpError(status, data, target));
            }
          });
        },
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(
          new Error(
            `Request to ${target.host} timed out after ${timeoutMs / 1000}s`,
          ),
        );
      });
      req.on("error", (e) => reject(this.networkError(e, target)));
      if (payload) req.write(payload);
      req.end();
    });
  }

  private static httpError(status: number, data: string, target: URL): Error {
    const detail = this.extractErrorMessage(data);
    if (status === 401 || status === 403) {
      return new LLMConfigError(
        `Authentication failed (${status}). Check your API key. ${detail}`.trim(),
      );
    }
    if (status === 404 && this.isLoopback(target)) {
      return new LLMConfigError(
        `${target.host} returned 404 for ${target.pathname}. Check the base URL and that the model is available.`,
      );
    }
    return new Error(
      `Request failed (${status}): ${detail || data.slice(0, 200)}`,
    );
  }

  private static networkError(e: NodeJS.ErrnoException, target: URL): Error {
    if (
      e.code === "ECONNREFUSED" ||
      e.code === "ECONNRESET" ||
      e.code === "EHOSTUNREACH"
    ) {
      return new LLMConfigError(
        `Cannot reach the local server at ${target.origin}. Make sure it is running and the base URL is correct.`,
      );
    }
    return e;
  }

  private static extractErrorMessage(data: string): string {
    try {
      const parsed = JSON.parse(data);
      return parsed?.error?.message || parsed?.error || parsed?.message || "";
    } catch {
      return "";
    }
  }

  private static isLoopback(target: URL): boolean {
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(
      target.hostname,
    );
  }
}
