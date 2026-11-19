/**
 * Dữ liệu trang Phân tích lớp học của giáo viên.
 * TODO(backend): CHƯA có API thống kê theo lớp. Hiện dữ liệu GIẢ (features/teacher/mock/analyticsData.ts);
 * khi có API, giữ nguyên các kiểu này và đổi useClassAnalytics sang gọi API.
 */
export interface AnalyticsRadarPoint {
  axis: string;
  value: number;
}

export interface AnalyticsTrendPoint {
  label: string;
  value: number;
}

export interface ClassInsight {
  /** Chủ điểm lớp cần củng cố, ví dụ "thì quá khứ" */
  topic: string;
  /** % học sinh trong lớp mắc lỗi ở chủ điểm này */
  errorPercent: number;
  /** Chênh lệch so với mức chung của khối (điểm %), có thể âm */
  diffVsGrade: number;
  studentsNeedingPractice: number;
  suggestedMinutes: number;
}

export interface ClassAnalytics {
  classId: number;
  level: { code: string; label: string };
  radar: AnalyticsRadarPoint[];
  trend: AnalyticsTrendPoint[];
  /** % thay đổi điểm giữa tuần đầu và tuần cuối (có thể âm) */
  trendDeltaPercent: number;
  heatmap: {
    rows: string[];
    /** Tên viết tắt các lớp, cuối cùng là "TB" */
    cols: string[];
    /** Chỉ số cột của lớp đang chọn */
    selectedCol: number;
    values: number[][];
  };
  insight: ClassInsight;
}
