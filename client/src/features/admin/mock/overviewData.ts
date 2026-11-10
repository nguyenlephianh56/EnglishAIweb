import type { ActivityPoint, OverviewMock, OverviewRange } from "../../../types/admin";

// ============================================================================
// DỮ LIỆU GIẢ cho trang Tổng quan quản trị.
// TODO: nối API thật khi backend có thống kê. Cần: lượt gọi AI hôm nay + hạn mức,
// số báo lỗi đang mở (và số ưu tiên cao), chuỗi hoạt động theo ngày (người dùng, lượt AI),
// phân bổ lượt AI (chấm bài / tạo bài / phân tích). Chỉ cần thay thân getOverviewMock().
// (Tổng người dùng, người dùng hoạt động, giáo viên chờ duyệt đã là dữ liệu THẬT.)
// ============================================================================

const WEEK_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const WEEK_USERS = [5200, 5600, 6100, 6000, 7200, 7900, 8900];
const WEEK_AI = [14200, 15800, 17100, 19000, 21300, 23000, 24861];

function weekData(): ActivityPoint[] {
  return WEEK_LABELS.map((label, i) => ({ label, users: WEEK_USERS[i], aiCalls: WEEK_AI[i] }));
}

/** 30 ngày gần nhất, nhãn dd/MM, số liệu tăng dần có dao động nhẹ (xác định, không ngẫu nhiên) */
function monthData(): ActivityPoint[] {
  const today = new Date();
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    const users = Math.round(4800 + i * 141 + Math.sin(i * 1.3) * 350);
    const aiCalls = i === 29 ? 24861 : Math.round(12000 + i * 420 + Math.sin(i * 0.9) * 700);
    return { label, users, aiCalls };
  });
}

export function getOverviewMock(range: OverviewRange): OverviewMock {
  return {
    aiCallsToday: 24861,
    openReports: 18,
    highPriorityReports: 5,
    activity: range === "7d" ? weekData() : monthData(),
    aiUsage: {
      used: 24861,
      limit: 36000,
      breakdown: { grading: 12420, generation: 8216, analysis: 4225 },
    },
  };
}
