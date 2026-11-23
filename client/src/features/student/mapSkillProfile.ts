import type { CefrLevel, SkillAxis, SkillKey } from "../../types/student";
import type { ErrorType, ProfileRange, ProgressPoint, SkillProfileData, SkillScore, Weakness } from "../../types/profile";
import type { ApiSkillEntry, SkillProfileResponse } from "../../types/skillProfile";

const SKILL_KEYS: SkillKey[] = ["LISTENING", "SPEAKING", "READING", "WRITING"];
const RANGE_DAYS: Record<ProfileRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 24 * 60 * 60 * 1000;
const WEAK_BELOW = 60; // điểm 0..100 dưới mức này mới coi là điểm yếu
const MAX_WEAKNESSES = 3;
const MAX_ERROR_TYPES = 5;

const LEVEL_LABEL: Record<CefrLevel, string> = { A1: "Sơ cấp", A2: "Cơ bản", B1: "Trung cấp", B2: "Trung cao cấp" };

/** Cấp độ chung theo điểm trung bình (thang 0..10): B2 ≥ 8, B1 ≥ 6, A2 ≥ 4, còn lại A1 */
export const levelFromAverage = (avg: number): CefrLevel => (avg >= 8 ? "B2" : avg >= 6 ? "B1" : avg >= 4 ? "A2" : "A1");

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
/** Điểm 0..10 → 0..100 (làm tròn) */
const to100 = (score: number) => Math.round(clamp(score, 0, 10) * 10);
const pad2 = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Tên tiếng Việt của loại lỗi ("nhóm:chi tiết"). Không có trong bảng thì hiện nguyên chuỗi gốc.
// ---------------------------------------------------------------------------
const GROUP_LABEL: Record<string, string> = {
  grammar: "Ngữ pháp",
  vocabulary: "Từ vựng",
  spelling: "Chính tả",
  punctuation: "Dấu câu",
  pronunciation: "Phát âm",
  word_order: "Trật tự từ",
  "word order": "Trật tự từ",
};
const DETAIL_LABEL: Record<string, string> = {
  tense: "Thì của động từ",
  preposition: "Giới từ",
  article: "Mạo từ",
  word_order: "Trật tự từ",
  subject_verb_agreement: "Hòa hợp chủ ngữ và động từ",
  plural: "Số nhiều",
  comma: "Dấu phẩy",
};

export function errorLabel(type: string): string {
  const [rawGroup, ...rest] = type.split(":");
  const group = GROUP_LABEL[rawGroup.trim().toLowerCase()];
  if (!group) return type;
  const detail = rest.join(":").trim().toLowerCase();
  if (!detail) return group;
  const detailLabel = DETAIL_LABEL[detail] ?? (() => {
    const s = detail.replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  return `${group}: ${detailLabel}`;
}

/** Làm tròn phần trăm theo phương pháp phần dư lớn nhất, để tổng các thanh bằng đúng tổng làm tròn */
function roundedPercents(counts: number[], total: number): number[] {
  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map(Math.floor);
  let left = Math.round(exact.reduce((a, b) => a + b, 0)) - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

function mapErrors(entries: ApiSkillEntry[]): { errorTypes: ErrorType[]; errorSampleSize: number } {
  const merged = new Map<string, number>();
  for (const e of entries) {
    for (const [type, count] of Object.entries(e.error_stats ?? {})) {
      if (typeof count === "number" && Number.isFinite(count) && count > 0) merged.set(type, (merged.get(type) ?? 0) + count);
    }
  }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return { errorTypes: [], errorSampleSize: 0 };
  const top = [...merged.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_ERROR_TYPES);
  const percents = roundedPercents(top.map(([, c]) => c), total);
  return { errorTypes: top.map(([type], i) => ({ id: type, label: errorLabel(type), percent: percents[i] })), errorSampleSize: total };
}

// ---------------------------------------------------------------------------
// Tiến bộ theo ngày trong khoảng đã chọn
// ---------------------------------------------------------------------------
interface Pt {
  t: number;
  score: number;
}

function pointsInRange(entry: ApiSkillEntry | undefined, from: number, to: number): Pt[] {
  return (entry?.progress ?? [])
    .map((p) => ({ t: Date.parse(p.date), score: p.score }))
    .filter((p) => Number.isFinite(p.t) && typeof p.score === "number" && Number.isFinite(p.score) && p.t >= from && p.t <= to)
    .sort((a, b) => a.t - b.t);
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function buildProgress(perSkill: Record<SkillKey, Pt[]>): ProgressPoint[] {
  // Mỗi ngày (theo lịch địa phương) có điểm của bất kỳ kỹ năng nào là một mốc
  const days = new Map<string, number>();
  for (const key of SKILL_KEYS) for (const p of perSkill[key]) if (!days.has(dayKey(p.t))) days.set(dayKey(p.t), p.t);
  const ordered = [...days.entries()].sort((a, b) => a[1] - b[1]);

  const series = {} as Record<SkillKey, (number | null)[]>;
  for (const key of SKILL_KEYS) {
    const pts = perSkill[key];
    if (pts.length === 0) {
      series[key] = ordered.map(() => null);
      continue;
    }
    const byDay = new Map<string, number>();
    for (const p of pts) byDay.set(dayKey(p.t), p.score); // nhiều mốc trong ngày: lấy mốc cuối
    let current = pts[0].score; // trước mốc đầu tiên dùng giá trị đầu tiên; sau đó giữ giá trị mốc trước
    series[key] = ordered.map(([k]) => {
      if (byDay.has(k)) current = byDay.get(k) as number;
      return to100(current);
    });
  }

  return ordered.map(([, t], i) => {
    const d = new Date(t);
    const point = { label: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` } as ProgressPoint;
    for (const key of SKILL_KEYS) point[key] = series[key][i];
    return point;
  });
}

const WEAK_TITLE: Record<SkillKey, string> = {
  LISTENING: "Kỹ năng Nghe cần luyện thêm",
  SPEAKING: "Kỹ năng Nói cần luyện thêm",
  READING: "Kỹ năng Đọc cần luyện thêm",
  WRITING: "Kỹ năng Viết cần luyện thêm",
};

/**
 * Chuyển dữ liệu backend (điểm 0..10, theo từng kỹ năng) thành dữ liệu trang Hồ sơ kỹ năng.
 * Hàm thuần: `range` chỉ lọc ở client, `now` để test.
 */
export function mapSkillProfile(response: SkillProfileResponse, range: ProfileRange, now: Date = new Date()): SkillProfileData {
  const entries = response.skills ?? [];
  const by = new Map(entries.map((e) => [e.skill, e]));
  const scoreOf = (skill: string) => {
    const s = by.get(skill as ApiSkillEntry["skill"])?.score;
    return typeof s === "number" && Number.isFinite(s) ? s : null;
  };

  const hasAnyScore = entries.some((e) => typeof e.score === "number");
  const hasAnyPoint = entries.some((e) => (e.progress ?? []).length > 0);

  // Điểm chung: trung bình các kỹ năng đã có điểm
  const known = entries.map((e) => e.score).filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  const avg = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 0;
  const level = levelFromAverage(avg);

  const to = now.getTime();
  const from = to - RANGE_DAYS[range] * DAY_MS;
  const perSkill = {} as Record<SkillKey, Pt[]>;
  for (const key of SKILL_KEYS) perSkill[key] = pointsInRange(by.get(key), from, to);

  const skills: SkillScore[] = SKILL_KEYS.map((skill) => {
    const pts = perSkill[skill];
    const score = scoreOf(skill);
    return {
      skill,
      score: score === null ? 0 : to100(score),
      hasData: score !== null,
      delta: pts.length < 2 ? 0 : Math.round((pts[pts.length - 1].score - pts[0].score) * 10),
    };
  });

  const foundation = scoreOf("FOUNDATION");
  const radar: SkillAxis[] = [
    { axis: "Nền tảng", value: foundation === null ? 0 : to100(foundation) },
    ...(["LISTENING", "SPEAKING", "WRITING", "READING"] as const).map((k) => ({ axis: { LISTENING: "Nghe", SPEAKING: "Nói", WRITING: "Viết", READING: "Đọc" }[k], value: skills.find((s) => s.skill === k)?.score ?? 0 })),
  ];

  const weaknesses: Weakness[] = skills
    .filter((s) => s.hasData && s.score < WEAK_BELOW)
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_WEAKNESSES)
    .map((s, i) => ({ id: i + 1, skill: s.skill, title: WEAK_TITLE[s.skill], description: `Điểm hiện tại: ${s.score}/100`, actionLabel: i === 0 ? "Luyện ngay" : "Ôn tập" }));

  return {
    hasData: hasAnyScore || hasAnyPoint,
    level,
    levelLabel: LEVEL_LABEL[level],
    deltaPoints: Math.round(skills.reduce((sum, s) => sum + s.delta, 0) / skills.length),
    overall: Math.round(avg * 10),
    radar,
    skills,
    progress: buildProgress(perSkill),
    ...mapErrors(entries),
    weaknesses,
  };
}
