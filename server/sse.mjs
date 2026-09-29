/**
 * Convert one line from an upstream OpenAI-compatible SSE stream into
 * our normalized downstream SSE event. Returns "" for lines to skip.
 */
export function encodeSSE(line, model) {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("data:")) return "";
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return `data: [DONE]\n\n`;
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return "";
  }
  const delta = parsed?.choices?.[0]?.delta;
  const token = delta?.content ?? parsed?.choices?.[0]?.text ?? "";
  const finish = parsed?.choices?.[0]?.finish_reason;
  const event = {
    type: "token",
    token,
    model: model ?? parsed?.model ?? null,
    finish: finish ?? null,
  };
  return `data: ${JSON.stringify(event)}\n\n`;
}
