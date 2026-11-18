import Textarea from "../../../../components/ui/Textarea";
import { LIMITS } from "./types";
import type { EditorProps, SpeakingState } from "./types";

/** Nói: đề bài và bài nói mẫu (không bắt buộc). Không có đáp án. */
export default function SpeakingPromptEditor({ state, onChange, errors }: EditorProps<SpeakingState>) {
  return (
    <div className="space-y-6">
      <Textarea
        label="Đề bài"
        placeholder="Talk about your daily routine for one minute."
        limit={LIMITS.prompt}
        rows={4}
        value={state.prompt}
        error={errors.prompt}
        onChange={(e) => onChange({ ...state, prompt: e.target.value })}
      />
      <Textarea
        label="Bài nói mẫu (không bắt buộc)"
        limit={LIMITS.prompt}
        rows={4}
        value={state.sample}
        error={errors.sample}
        onChange={(e) => onChange({ ...state, sample: e.target.value })}
      />
    </div>
  );
}
