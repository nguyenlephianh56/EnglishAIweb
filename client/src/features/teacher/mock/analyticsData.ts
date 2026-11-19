import type { ClassSummary } from "../../../types/teacher";
import type { ClassAnalytics } from "../../../types/analytics";
import { MAX_HEATMAP_CLASSES, shortClassName } from "../analytics/analyticsMeta";

/**
 * DỮ LIỆU GIẢ cho trang Phân tích lớp học.
 * TODO(backend): chưa có API thống kê theo lớp (năng lực trung bình, xu hướng điểm, lỗi thường gặp).
 * Giá trị sinh từ id lớp bằng bộ sinh số giả ngẫu nhiên có hạt giống, nên cùng một lớp luôn ra cùng số liệu.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Số nguyên trong [min, max] cố định theo (seed) */
const between = (rand: () => number, min: number, max: number) => Math.round(min + rand() * (max - min));

const ERROR_ROWS = ["Thì động từ", "Giới từ", "Phát âm", "Từ vựng"];
const ERROR_TOPICS = ["ngữ pháp quá khứ", "giới từ chỉ nơi chốn và thời gian", "phát âm âm cuối", "từ vựng theo chủ đề"];
const RADAR_AXES = ["Nền tảng", "Nghe", "Nói", "Viết", "Đọc"];
const MINUTES = [10, 15, 20, 25];

function levelOf(avg: number): { code: string; label: string } {
  if (avg < 35) return { code: "A1", label: "Sơ cấp" };
  if (avg < 55) return { code: "A2", label: "Cơ bản" };
  if (avg < 75) return { code: "B1", label: "Trung cấp" };
  return { code: "B2", label: "Trên trung cấp" };
}

/** Tỉ lệ lỗi (0–100) của một lớp theo từng hàng; chỉ phụ thuộc id lớp */
function errorColumn(classId: number): number[] {
  const rand = mulberry32(classId * 7919 + 13);
  return ERROR_ROWS.map(() => between(rand, 12, 92));
}

/** Các lớp hiện trong bản đồ lỗi: tối đa 6, luôn có lớp đang chọn */
function pickColumns(classes: ClassSummary[], selectedId: number): ClassSummary[] {
  const head = classes.slice(0, MAX_HEATMAP_CLASSES);
  if (head.some((c) => c.id === selectedId)) return head;
  const selected = classes.find((c) => c.id === selectedId);
  return selected ? [...head.slice(0, MAX_HEATMAP_CLASSES - 1), selected] : head;
}

export function getClassAnalyticsMock(classes: ClassSummary[], classId: number): ClassAnalytics | undefined {
  const cls = classes.find((c) => c.id === classId);
  if (!cls) return undefined;

  const rand = mulberry32(classId * 104729 + 7);
  const radar = RADAR_AXES.map((axis) => ({ axis, value: between(rand, 48, 86) }));
  const avg = radar.reduce((s, p) => s + p.value, 0) / radar.length;

  // Xu hướng 12 tuần: đi lên dần theo hạt giống, có dao động nhẹ
  const start = between(rand, 42, 58);
  const end = Math.min(95, start + between(rand, 8, 30));
  const trend = Array.from({ length: 12 }, (_, i) => {
    const base = start + ((end - start) * i) / 11;
    return { label: `T${i + 1}`, value: Math.round(Math.min(100, Math.max(0, base + (rand() - 0.5) * 6))) };
  });
  const trendDeltaPercent = Math.round(((trend[11].value - trend[0].value) / trend[0].value) * 1000) / 10;

  // Bản đồ lỗi: cột = các lớp của giáo viên + "TB"
  const columns = pickColumns(classes, classId);
  const perClass = columns.map((c) => errorColumn(c.id));
  const tb = ERROR_ROWS.map((_, r) => Math.round(perClass.reduce((s, col) => s + col[r], 0) / perClass.length));
  const values = ERROR_ROWS.map((_, r) => [...perClass.map((col) => col[r]), tb[r]]);
  const selectedCol = columns.findIndex((c) => c.id === classId);

  // Điểm yếu nổi bật nhất của lớp đang chọn
  const mine = errorColumn(classId);
  const worst = mine.indexOf(Math.max(...mine));
  const studentsNeedingPractice = cls.studentCount > 0 ? Math.min(cls.studentCount, Math.max(1, Math.round((cls.studentCount * mine[worst]) / 100))) : 0;

  return {
    classId,
    level: levelOf(avg),
    radar,
    trend,
    trendDeltaPercent,
    heatmap: { rows: ERROR_ROWS, cols: [...columns.map((c) => shortClassName(c.name)), "TB"], selectedCol, values },
    insight: {
      topic: ERROR_TOPICS[worst],
      errorPercent: mine[worst],
      diffVsGrade: mine[worst] - tb[worst],
      studentsNeedingPractice,
      suggestedMinutes: MINUTES[between(rand, 0, MINUTES.length - 1)],
    },
  };
}
