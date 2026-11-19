import { z } from "zod";
import {
  ATTEMPT_LIST_DEFAULT_LIMIT,
  ATTEMPT_LIST_MAX_LIMIT,
  WRITING_TEXT_MAX,
  AUDIO_ID_RE,
} from "./attempts.constants";
import { SPEAKING_TRANSCRIPT_MAX_CHARS } from "../../ai/speaking.constants";
// Số nguyên lớn nhất của cột INT trong PostgreSQL; vượt quá thì Prisma sẽ báo lỗi 500.
const MAX_EXERCISE_ID = 2147483647;

/** Chế độ nộp được nhận. "exam" (thi thử) là P1 nên chưa mở. */
export const ATTEMPT_MODES = ["practice"] as const;
export type AttemptMode = (typeof ATTEMPT_MODES)[number];

const positiveIdField = (name: string, label: string) =>
  z
    .number({
      invalid_type_error: `${name}: ${label} phải là số nguyên dương`,
    })
    .int(`${name}: ${label} phải là số nguyên dương`)
    .min(1, `${name}: ${label} phải là số nguyên dương`)
    .max(MAX_EXERCISE_ID, `${name}: ${label} không hợp lệ`);

export const createAttemptSchema = z
  .object(
    {
      // Tự luyện: bắt buộc. Bài giao: tùy chọn, nếu có phải khớp assignment.exercise_id
      // (việc so khớp làm ở service vì cần đọc DB).
      exerciseId: positiveIdField("exerciseId", "Mã bài tập").optional(),

      // Không gửi = tự luyện (assignment_id NULL). Có gửi = nộp bài giao.
      // null, chuỗi, số âm/số thập phân... đều bị từ chối (400).
      assignmentId: positiveIdField("assignmentId", "Mã bài giao").optional(),

      // Hình dạng/độ dài do registry chấm kiểm; ở đây chỉ bắt buộc phải có gửi.
      answer: z
        .unknown()
        .refine((value) => value !== undefined, "answer: Bài làm là bắt buộc"),

      // Không gửi = "practice". Giá trị khác (kể cả "exam") -> 400.
      mode: z
        .enum(ATTEMPT_MODES, {
          errorMap: () => ({
            message: `mode: Chế độ không hợp lệ. Chỉ chấp nhận: ${ATTEMPT_MODES.join(", ")}`,
          }),
        })
        .default("practice"),
    },
    {
      required_error: "Body là bắt buộc",
      invalid_type_error: "Body phải là một object JSON",
    }
  )
  // Field thừa (studentId, is_late, submitted_at, score...) bị zod bỏ khi parse.
  .superRefine((data, ctx) => {
    if (data.assignmentId === undefined && data.exerciseId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exerciseId"],
        message: "exerciseId: Mã bài tập là bắt buộc",
      });
    }
  });

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;

/**
 * Bài làm dạng writing: đúng một field `text`. `.strict()` nên field thừa
 * (score, is_late, student_id...) BÊN TRONG answer bị từ chối (400).
 * trim chạy trước min/max nên "   " bị coi là rỗng và trần đếm sau khi trim.
 * Thông báo lỗi không chép lại nội dung bài viết (bài làm là dữ liệu riêng tư).
 */
export const writingAnswerSchema = z
  .object(
    {
      text: z
        .string({
          required_error: "text: Nội dung bài viết là bắt buộc",
          invalid_type_error: "text: Nội dung bài viết phải là chuỗi",
        })
        .trim()
        .min(1, "text: Nội dung bài viết không được để trống")
        .max(
          WRITING_TEXT_MAX,
          `text: Bài viết tối đa ${WRITING_TEXT_MAX} ký tự`
        ),
    },
    {
      required_error: "Bài làm là bắt buộc",
      invalid_type_error: "Bài làm phải là một object dạng { text }",
    }
  )
  .strict("Bài làm chỉ được có field text");

export type WritingAnswer = z.infer<typeof writingAnswerSchema>;

/**
 * Dạng LƯU của attempts.answer cho bài speaking: { text } = bản chữ hóa đã trim
 * (từ Gemini hoặc từ Web Speech API của FE). KHÔNG lưu audio_id/đường dẫn/âm thanh.
 * Chỉ trim đầu/cuối, không đổi hoa/thường, không bỏ dấu câu (bước chấm phát âm cần bản nguyên trạng).
 * Đây KHÔNG phải dạng request: request { audio_id } hoặc { transcript } định nghĩa riêng.
 * Thông báo lỗi không chép lại nội dung (bản chữ là dữ liệu riêng tư).
 */
export const speakingAttemptAnswerSchema = z
  .object(
    {
      text: z
        .string({
          required_error: "text: Bản chữ hóa là bắt buộc",
          invalid_type_error: "text: Bản chữ hóa phải là chuỗi",
        })
        .trim()
        .min(1, "text: Bản chữ hóa không được để trống")
        .max(
          SPEAKING_TRANSCRIPT_MAX_CHARS,
          `text: Bản chữ hóa tối đa ${SPEAKING_TRANSCRIPT_MAX_CHARS} ký tự`
        ),
    },
    {
      required_error: "Bài làm là bắt buộc",
      invalid_type_error: "Bài làm phải là một object dạng { text }",
    }
  )
  .strict("Bài làm chỉ được có field text");

export type SpeakingAttemptAnswer = z.infer<typeof speakingAttemptAnswerSchema>;

/**
 * Dạng REQUEST của `answer` khi nộp bài speaking (T18): đúng MỘT trong hai nguồn, loại trừ nhau.
 *   { audio_id }   : id file đã upload ở POST /attempts/audio; server chữ hóa bằng Gemini.
 *   { transcript } : bản chữ FE tự lấy (Web Speech API); không gọi chữ hóa.
 * KHÁC dạng LƯU ({ text }) ở trên: audio_id/transcript không bao giờ được lưu vào attempts.answer.
 *
 * `.strict()` nên field lạ (score, is_late, student_id, errors...) bên trong answer bị 400.
 * Chỉ kiểm HÌNH DẠNG ở đây (không đụng DB); lỗi nghiệp vụ như "dưới 3 từ" (422 TRANSCRIPT_TOO_SHORT)
 * và "không thấy file" (404) do service xử lý. Thông báo lỗi không chép lại nội dung người dùng gửi.
 */
export const speakingSubmitRequestSchema = z
  .object(
    {
      audio_id: z
        .string({ invalid_type_error: "audio_id: Mã âm thanh phải là chuỗi" })
        .regex(AUDIO_ID_RE, "audio_id: Mã âm thanh không hợp lệ")
        .optional(),
      transcript: z
        .string({ invalid_type_error: "transcript: Bản chữ phải là chuỗi" })
        .trim()
        .min(1, "transcript: Bản chữ không được để trống")
        .max(
          SPEAKING_TRANSCRIPT_MAX_CHARS,
          `transcript: Bản chữ tối đa ${SPEAKING_TRANSCRIPT_MAX_CHARS} ký tự`
        )
        .optional(),
    },
    {
      required_error: "Bài làm là bắt buộc",
      invalid_type_error: "Bài làm phải là một object dạng { audio_id } hoặc { transcript }",
    }
  )
  .strict("Bài làm chỉ được có audio_id hoặc transcript")
  .superRefine((data, ctx) => {
    const hasAudio = data.audio_id !== undefined;
    const hasTranscript = data.transcript !== undefined;
    if (hasAudio === hasTranscript) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bài làm phải có đúng một trong hai: audio_id hoặc transcript",
      });
    }
  })
  // Sau khi qua superRefine, chắc chắn đúng một nguồn: thu hẹp kiểu cho nơi dùng.
  .transform(
    (data): { audio_id: string } | { transcript: string } =>
      data.audio_id !== undefined
        ? { audio_id: data.audio_id }
        : { transcript: data.transcript as string }
  );

export type SpeakingSubmitRequest = z.infer<typeof speakingSubmitRequestSchema>;

// ---------------------------------------------------------------------------
// GET /attempts và GET /attempts/:id
// Query string và path param luôn là CHUỖI, nên đọc bằng regex số nguyên không dấu
// rồi đổi sang số. Cách này từ chối: "abc", "", "-1", "1.5", "1e3", " 5", và
// tham số lặp (?page=1&page=2, express đưa thành mảng).
// ---------------------------------------------------------------------------

/** Lọc theo mode: đọc được cả "exam" (dữ liệu về sau), dù POST hiện mới nhận "practice". */
export const ATTEMPT_FILTER_MODES = ["practice", "exam"] as const;

// Chặn trang quá lớn: (page - 1) * limit phải nằm trong số nguyên 32-bit để Prisma không lỗi 500.
const MAX_PAGE = 100000;

const intQueryField = (
  name: string,
  label: string,
  min: number,
  max: number,
  maxMessage?: string
) => {
  const invalid = `${name}: ${label} phải là số nguyên dương`;
  return z
    .string({ invalid_type_error: invalid })
    .regex(/^\d+$/, invalid)
    .transform(Number)
    .pipe(
      z
        .number()
        .int(invalid)
        .min(min, invalid)
        .max(max, maxMessage ?? `${name}: ${label} không hợp lệ`)
    );
};

export const listAttemptsQuerySchema = z.object({
  assignmentId: intQueryField(
    "assignmentId",
    "Mã bài giao",
    1,
    MAX_EXERCISE_ID
  ).optional(),
  exerciseId: intQueryField(
    "exerciseId",
    "Mã bài tập",
    1,
    MAX_EXERCISE_ID
  ).optional(),
  mode: z
    .enum(ATTEMPT_FILTER_MODES, {
      errorMap: () => ({
        message: `mode: Chế độ không hợp lệ. Chỉ chấp nhận: ${ATTEMPT_FILTER_MODES.join(", ")}`,
      }),
    })
    .optional(),
  page: intQueryField("page", "Số trang", 1, MAX_PAGE)
    .optional()
    .transform((value) => value ?? 1),
  limit: intQueryField(
    "limit",
    "Số dòng mỗi trang",
    1,
    ATTEMPT_LIST_MAX_LIMIT,
    `limit: Tối đa ${ATTEMPT_LIST_MAX_LIMIT} dòng mỗi trang`
  )
    .optional()
    .transform((value) => value ?? ATTEMPT_LIST_DEFAULT_LIMIT),
});
// Query thừa (vd studentId=...) bị zod bỏ: student_id luôn lấy từ JWT, không nhận từ client.

export type ListAttemptsQuery = z.infer<typeof listAttemptsQuerySchema>;

export const attemptIdParamSchema = z.object({
  id: intQueryField("id", "Mã bài nộp", 1, MAX_EXERCISE_ID),
});

export type AttemptIdParam = z.infer<typeof attemptIdParamSchema>;