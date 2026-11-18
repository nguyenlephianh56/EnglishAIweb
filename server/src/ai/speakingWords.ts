const WORD_PATTERN = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu;

export function tokenizeSpeakingWords(text: string): string[] {
  return text.normalize("NFC").toLowerCase().replace(/['’]/g, "").match(WORD_PATTERN) ?? [];
}

/** Mỗi lần xuất hiện trong bản chữ khớp tối đa một lần trong câu mẫu. */
export function compareWithSample(transcript: string, sample?: string): number | null {
  const sampleWords = tokenizeSpeakingWords(sample ?? "");
  if (sampleWords.length === 0) return null;

  const remaining = new Map<string, number>();
  for (const word of tokenizeSpeakingWords(transcript)) {
    remaining.set(word, (remaining.get(word) ?? 0) + 1);
  }

  let matched = 0;
  for (const word of sampleWords) {
    const count = remaining.get(word) ?? 0;
    if (count > 0) {
      matched += 1;
      remaining.set(word, count - 1);
    }
  }

  return matched / sampleWords.length;
}