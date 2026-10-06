/**
 * 解析 OpenAI 兼容 chat/completions SSE 流
 * 行格式：data: {...} / data: [DONE]
 */
export async function* parseOpenAIChatSSE(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (!res.body) {
    throw new Error('响应无 body，无法流式读取');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          /* 忽略残缺 JSON 行 */
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
