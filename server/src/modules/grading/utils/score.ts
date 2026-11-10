import { MAX_SCORE } from "../types";

/** Làm tròn 2 chữ số thập phân (vd 6.666... -> 6.67). */
export const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Điểm thang 10 = đúng/tổng × 10, làm tròn 2 chữ số.
 * total = 0 (không có câu nào) -> 0, tránh chia cho 0.
 */
export const calcScore = (correct: number, total: number): number =>
  total > 0 ? round2((correct / total) * MAX_SCORE) : 0;
