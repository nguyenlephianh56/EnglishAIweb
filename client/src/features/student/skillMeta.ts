import { BookOpen, Headphones, Mic, PenLine } from "lucide-react";
import type { SkillKey } from "../../types/student";

/** Nhãn, icon và màu theo kỹ năng (Nghe tím, Nói cam, Đọc xanh, Viết hồng) */
export const SKILL_META: Record<SkillKey, { label: string; icon: typeof Mic; text: string; tint: string; bar: string }> = {
  LISTENING: { label: "Nghe", icon: Headphones, text: "text-skill-listening", tint: "bg-skill-listening/10", bar: "bg-skill-listening" },
  SPEAKING: { label: "Nói", icon: Mic, text: "text-skill-speaking", tint: "bg-skill-speaking/10", bar: "bg-skill-speaking" },
  READING: { label: "Đọc", icon: BookOpen, text: "text-skill-reading", tint: "bg-skill-reading/10", bar: "bg-skill-reading" },
  WRITING: { label: "Viết", icon: PenLine, text: "text-skill-writing", tint: "bg-skill-writing/10", bar: "bg-skill-writing" },
};
