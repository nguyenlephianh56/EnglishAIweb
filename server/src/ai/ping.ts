import { GeminiProvider } from "./gemini.provider";
import { AIProviderError } from "./provider";

// Chỉ chạy thủ công bằng npm.cmd run ai:ping.
// Không import file này vào app, route hoặc test.
async function main(): Promise<void> {
  const provider = new GeminiProvider();
  const startedAt = Date.now();

  try {
    const result = await provider.generate({
      prompt: "Reply with exactly OK.",
    });

    console.info("Kết nối Gemini thành công.", {
      provider: provider.name,
      model: result.model,
      tokens: result.tokens,
      durationMs: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    // Không in nguyên error, stack hoặc cause vì có thể chứa bí mật.
    console.error("Kiểm tra Gemini thất bại.", {
      provider: provider.name,
      kind: error instanceof AIProviderError ? error.kind : "UNKNOWN",
      durationMs: Date.now() - startedAt,
    });

    process.exitCode = 1;
  }
}

void main();