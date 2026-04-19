type ChatMessage = { role: "system" | "user"; content: string };

export async function callAiJson<T>(messages: ChatMessage[]): Promise<{ ok: true; json: T } | { ok: false; error: string }> {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  const key = process.env.AI_API_KEY;
  if (!key) return { ok: false, error: "AI_API_KEY is not set." };

  if (provider === "anthropic") {
    const model = process.env.AI_MODEL ?? "claude-3-5-sonnet-20241022";
    const system = messages.find((m) => m.role === "system")?.content ?? "You are a helpful assistant.";
    const userMsgs = messages.filter((m) => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.2,
        system,
        messages: userMsgs.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) return { ok: false, error: `Anthropic error ${res.status}: ${await res.text()}` };
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text;
    if (!text) return { ok: false, error: "Empty Anthropic response." };
    try {
      return { ok: true, json: JSON.parse(text) as T };
    } catch {
      return { ok: false, error: "Anthropic returned non-JSON." };
    }
  }

  const baseUrl = (process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) return { ok: false, error: `OpenAI-compatible error ${res.status}: ${await res.text()}` };
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content;
  if (!text) return { ok: false, error: "Empty AI response." };
  try {
    return { ok: true, json: JSON.parse(text) as T };
  } catch {
    return { ok: false, error: "AI returned non-JSON." };
  }
}
