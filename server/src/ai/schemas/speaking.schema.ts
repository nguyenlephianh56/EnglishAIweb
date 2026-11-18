import { z } from "zod";

export const speakingTranscriptSchema = z
  .object({ text: z.string().trim() })
  .strict();

export type SpeakingTranscript =
  z.infer<typeof speakingTranscriptSchema>;