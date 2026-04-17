// Local-LLM pre-step: given user task + changed-files list, pick the small set
// of files Claude should look at first. Reduces wandering Read calls.

export type FileFocusConfig = {
  url: string;
  model?: string;
  timeoutMs?: number;
  maxFiles?: number;
};

const FILE_FOCUS_RESPONSE_FORMAT = {
  type: "json_object",
  schema: {
    type: "object",
    properties: {
      files: { type: "array", items: { type: "string" } },
    },
    required: ["files"],
  },
};

export async function selectRelevantFiles(
  userMessage: string,
  filesList: string,
  config: FileFocusConfig,
): Promise<string[]> {
  const maxFiles = config.maxFiles ?? 5;
  const files = filesList.split("\n").map((l) => l.split(" ")[0]).filter(Boolean);
  if (files.length <= maxFiles) return files;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 2000);
  try {
    const response = await fetch(`${config.url.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.model ?? "LFM2-350M",
        messages: [{
          role: "user",
          content: `Pick up to ${maxFiles} most relevant file paths for this task.\nTask: ${JSON.stringify(userMessage)}\nFiles:\n${files.join("\n")}\nReturn {"files":["path","..."]} with exact paths from the list.`,
        }],
        stream: false,
        temperature: 0,
        max_tokens: 256,
        response_format: FILE_FOCUS_RESPONSE_FORMAT,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "";
    // Same markdown-fence tolerance as other parsers — small models love wrapping.
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonStart = (fenced ? fenced[1] : content).indexOf("{");
    const rawJson = jsonStart >= 0 ? (fenced ? fenced[1] : content).slice(jsonStart) : content;
    let parsed: { files?: unknown };
    try { parsed = JSON.parse(rawJson.trim()); } catch { return []; }
    if (!parsed.files || !Array.isArray(parsed.files)) return [];
    const known = new Set(files);
    // Only trust paths the LLM actually saw (avoid hallucinated paths).
    return parsed.files.filter((p): p is string => typeof p === "string" && known.has(p)).slice(0, maxFiles);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
