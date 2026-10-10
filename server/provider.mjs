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

/**
 * Turn a failed upstream provider response into a friendly, structured error.
 *
 * Local servers answer 404 with a plain "model not found, try pulling it
 * first" when the selected model isn't on disk — a common, recoverable state
 * that deserves a one-click fix rather than a scary raw 404. Pure & tested.
 *
 * @returns {{ message: string, code: "model_not_found"|"provider_error", model: string|null }}
 */
export function classifyUpstreamError(status, bodyText, fallbackModel) {
  const raw = String(bodyText || "");
  // Ollama: {"error":{"message":"model \"x\" not found, try pulling it first", ...}}
  // LM Studio / llama.cpp: 404 with a "model ... not found" style message.
  const isMissingModel =
    /not[_ ]found/i.test(raw) &&
    (/pull/i.test(raw) || /model/i.test(raw)) &&
    (status === 404 || status === 400);

  if (isMissingModel) {
    // Prefer the model named in the provider's own message; fall back to the
    // one we tried to call.
    // The body is raw JSON, so the quotes around the model name may be
    // backslash-escaped — tolerate both spellings.
    const quoted = raw.match(/model\s+\\?"([^"\\]+)\\?"\s+not\s+found/i);
    const bare = quoted?.[1] ?? (String(fallbackModel || "").trim() || null);
    const name = bare || "that model";
    return {
      code: "model_not_found",
      model: bare,
      message: `${name} isn't downloaded on your server yet. Pull it and I'll pick right back up.`,
    };
  }

  return {
    code: "provider_error",
    model: null,
    message: `Provider responded ${status}: ${raw.slice(0, 400)}`,
  };
}
