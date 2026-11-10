import type { ClassSummary, OnTimeStats, TeacherOverviewMock } from "../../../types/teacher";

// ============================================================================
// DỮ LIỆU GIẢ cho trang Tổng quan giáo viên.
// TODO: nối API thật khi backend có: bài chờ chấm, tỷ lệ hoàn thành, thống kê nộp bài
// đúng hạn/trễ/chưa nộp (30 ngày, theo lớp), học sinh cần chú ý (AI phát hiện) và
// bài tập gần đây (tiến độ nộp, trạng thái), số thông báo chưa đọc.
// Các số được gắn vào LỚP THẬT (tên lớp, sĩ số) để trang nhìn nhất quán.
// (Số lớp, số học sinh, danh sách lớp đã là dữ liệu THẬT từ GET /classes.)
// ============================================================================

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Giả định mỗi học sinh có khoảng 4 bài trong 30 ngày; tỷ lệ đúng hạn 80-94% tùy lớp */
function onTimeFor(c: ClassSummary): OnTimeStats {
  const total = c.studentCount * 4;
  const pct = 0.8 + ((c.id * 7) % 15) / 100;
  const onTime = Math.round(total * pct);
  const late = Math.round((total - onTime) * 0.6);
  return { onTime, late, missing: total - onTime - late };
}

function sumStats(list: OnTimeStats[]): OnTimeStats {
  return list.reduce((a, s) => ({ onTime: a.onTime + s.onTime, late: a.late + s.late, missing: a.missing + s.missing }), { onTime: 0, late: 0, missing: 0 });
}

function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function getTeacherOverviewMock(classes: ClassSummary[], classId: number | "all"): TeacherOverviewMock {
  const selected = classId === "all" ? classes : classes.filter((c) => c.id === classId);
  const nameOf = (i: number) => classes[i % classes.length].name;
  const sizeOf = (i: number) => classes[i % classes.length].studentCount;
  const has = classes.length > 0;

  const recent = [
    { id: 1, title: "A memorable journey", skill: "WRITING" as const, dueAt: todayAt(20), ratio: 0.78, status: "DUE_SOON" as const, ungradedRatio: 0.5 },
    { id: 2, title: "At the weekend", skill: "LISTENING" as const, dueAt: new Date(Date.now() + 3 * DAY).toISOString(), ratio: 0.9, status: "ONGOING" as const, ungradedRatio: 0 },
    { id: 3, title: "Talking about hobbies", skill: "SPEAKING" as const, dueAt: new Date(Date.now() - 2 * DAY).toISOString(), ratio: 1, status: "CLOSED" as const, ungradedRatio: 0.3 },
    { id: 4, title: "Reading: City life", skill: "READING" as const, dueAt: new Date(Date.now() + 5 * DAY).toISOString(), ratio: 0.45, status: "ONGOING" as const, ungradedRatio: 0 },
  ];

  return {
    pendingGrading: 18,
    todayGrading: 6,
    completionRate: 86,
    completionDelta: 4.2,
    onTime: sumStats(selected.map(onTimeFor)),
    attentionStudents: has
      ? [
          { id: 1, name: "Phạm Hoàng", className: nameOf(0), kind: "MISSING", reason: "Chưa nộp 3 bài" },
          { id: 2, name: "Ngọc Lan", className: nameOf(1), kind: "SCORE_DROP", reason: "Điểm giảm 12%" },
          { id: 3, name: "Minh Tú", className: nameOf(0), kind: "WEAK_SKILL", reason: "Yếu kỹ năng Nói" },
        ]
      : [],
    recentAssignments: has
      ? recent.map((r, i) => {
          const total = sizeOf(i);
          const submitted = Math.round(total * r.ratio);
          return { id: r.id, title: r.title, skill: r.skill, className: nameOf(i), dueAt: r.dueAt, submitted, total, status: r.status, ungraded: Math.round(submitted * r.ungradedRatio) };
        })
      : [],
  };
}

/** Số thông báo chưa đọc (giả lập độ trễ mạng) */
export async function fetchTeacherUnread(): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return 3;
}
