/**
 * Build a fetch Request for the local OpenAI-compatible provider.
 * Normalizes Ollama-style base URLs (http://host:11434) and
 * OpenAI-style ones (.../v1) so /chat/completions always lands correctly.
 */
export function buildProviderRequest(provider, messages, model) {
  const raw = String(provider?.baseUrl || "").replace(/\/+$/, "");
  const url = raw.endsWith("/v1")
    ? `${raw}/chat/completions`
    : `${raw}/v1/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (provider?.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;
  const body = JSON.stringify({
    model,
    messages,
    stream: true,
    temperature: typeof provider?.temperature === "number" ? provider.temperature : 0.7,
    ...(provider?.maxTokens ? { max_tokens: provider.maxTokens } : {}),
  });
  return new Request(url, { method: "POST", headers, body });
}

export function validateProviderConfig(provider) {
  if (!provider || typeof provider !== "object") return false;
  const u = String(provider.baseUrl || "");
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
