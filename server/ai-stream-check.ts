import { env } from "./src/config/env";

async function main() {
  const startedAt = Date.now();
  let stage = "WAIT_HEADERS";
  let chunks = 0;
  let bytes = 0;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(env.GEMINI_MODEL) +
        ":streamGenerateContent?alt=sse",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{ text: "Reply with exactly OK." }],
          }],
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    console.log({
      stage: "HEADERS_RECEIVED",
      status: response.status,
      durationMs: Date.now() - startedAt,
    });

    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return;
    }

    stage = "READ_BODY";
    const reader = response.body.getReader();

    while (true) {
      const part = await reader.read();
      if (part.done) break;

      chunks++;
      bytes += part.value.byteLength;

      if (chunks === 1) {
        console.log({
          stage: "FIRST_CHUNK",
          durationMs: Date.now() - startedAt,
        });
      }
    }

    console.log({
      stage: "STREAM_ENDED",
      chunks,
      bytes,
      durationMs: Date.now() - startedAt,
    });
  } catch {
    console.log({
      stage,
      result: "FAILED_OR_TIMEOUT",
      chunks,
      bytes,
      durationMs: Date.now() - startedAt,
    });
  }
}

void main();
