import type { CefrLevel } from "../../../types/student";
import type { ExerciseSummary, ExerciseType, LibraryFilters, LibraryResult, LibrarySkill } from "../../../types/library";

// ============================================================================
// DỮ LIỆU GIẢ cho Thư viện luyện tập.
// TODO: nối API thật. Backend hiện CHƯA có GET danh sách bài luyện tập cho học sinh
// (lọc theo kỹ năng/cấp độ/dạng/chủ đề, tìm kiếm, sắp xếp, phân trang). Khi có, thay
// fetchLibrary() bằng lời gọi api/unwrap và truyền filters thành query string;
// hook useLibrary() và các component không phải sửa.
// ============================================================================

export const PAGE_SIZE = 9;

const L: LibrarySkill = "LISTENING";
const S: LibrarySkill = "SPEAKING";
const R: LibrarySkill = "READING";
const W: LibrarySkill = "WRITING";
const F: LibrarySkill = "FOUNDATION";
const MC: ExerciseType = "MULTIPLE_CHOICE";
const AI: ExerciseType = "AI_GRADED";

// id, tiêu đề, mô tả, kỹ năng, cấp độ, dạng, số phút, số câu, chủ đề (id nhỏ = mới hơn)
type Row = [number, string, string, LibrarySkill, CefrLevel, ExerciseType, number, number | undefined, string];
const ROWS: Row[] = [
  [1, "At the weekend", "Nghe hội thoại và chọn đáp án đúng", L, "A2", MC, 10, 8, "Cuộc sống hằng ngày"],
  [2, "The future of cities", "Đọc bài báo ngắn và trả lời câu hỏi", R, "B1", MC, 15, 10, "Công nghệ"],
  [3, "Describe your hometown", "Ghi âm bài nói theo chủ đề", S, "A2", AI, 8, undefined, "Du lịch"],
  [4, "Email xin nghỉ học", "Viết một email ngắn gửi giáo viên và nhận nhận xét từ AI", W, "A2", AI, 20, undefined, "Trường học"],
  [5, "Thì hiện tại hoàn thành", "Ôn lại cấu trúc và cách dùng qua các câu điền từ", F, "B1", MC, 12, 15, "Ngữ pháp"],
  [6, "Ordering at a café", "Nghe đoạn hội thoại gọi đồ uống và chọn đáp án", L, "A1", MC, 8, 6, "Ăn uống"],
  [7, "My daily routine", "Ghi âm phần nói về thói quen mỗi ngày", S, "A1", AI, 6, undefined, "Cuộc sống hằng ngày"],
  [8, "A letter to a friend", "Viết một bức thư thân mật kể về chuyến đi gần đây", W, "B1", AI, 25, undefined, "Gia đình & bạn bè"],
  [9, "Environmental problems", "Đọc bài về các vấn đề môi trường và trả lời câu hỏi", R, "B2", MC, 20, 12, "Môi trường"],
  [10, "Từ vựng chủ đề gia đình", "Học và kiểm tra từ vựng về các thành viên trong gia đình", F, "A1", MC, 10, 12, "Gia đình & bạn bè"],
  [11, "Airport announcements", "Nghe thông báo ở sân bay và chọn thông tin đúng", L, "B1", MC, 12, 8, "Du lịch"],
  [12, "Debate: School uniforms", "Trình bày quan điểm về đồng phục học sinh", S, "B2", AI, 12, undefined, "Trường học"],
  [13, "Opinion essay: Social media", "Viết bài luận nêu ý kiến về mạng xã hội", W, "B2", AI, 35, undefined, "Công nghệ"],
  [14, "Giới từ chỉ nơi chốn", "Luyện in, on, at và các giới từ chỉ vị trí", F, "A2", MC, 10, 14, "Ngữ pháp"],
  [15, "A trip to Da Nang", "Đọc bài giới thiệu chuyến đi và trả lời câu hỏi", R, "A2", MC, 12, 8, "Du lịch"],
  [16, "Weather forecast", "Nghe bản tin thời tiết và điền thông tin còn thiếu", L, "A2", MC, 9, 7, "Cuộc sống hằng ngày"],
  [17, "Talking about hobbies", "Ghi âm bài nói về sở thích của bạn", S, "B1", AI, 10, undefined, "Sở thích"],
  [18, "Describe your favourite place", "Viết đoạn văn miêu tả nơi bạn yêu thích", W, "A2", AI, 20, undefined, "Du lịch"],
  [19, "Mạo từ a/an/the", "Phân biệt và dùng đúng mạo từ qua các câu trắc nghiệm", F, "A2", MC, 12, 16, "Ngữ pháp"],
  [20, "Healthy eating habits", "Đọc bài về thói quen ăn uống lành mạnh", R, "B1", MC, 14, 10, "Sức khỏe"],
  [21, "A job interview", "Luyện trả lời các câu hỏi phỏng vấn xin việc", S, "B2", AI, 15, undefined, "Công việc"],
  [22, "Podcast: Learning online", "Nghe đoạn podcast về học trực tuyến và trả lời câu hỏi", L, "B2", MC, 15, 10, "Công nghệ"],
  [23, "Thì quá khứ đơn", "Ôn cách chia động từ quá khứ qua các câu sửa lỗi", F, "A2", MC, 12, 15, "Ngữ pháp"],
  [24, "Writing a product review", "Viết bài đánh giá một sản phẩm công nghệ", W, "B1", AI, 25, undefined, "Công nghệ"],
];

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

export const EXERCISES: ExerciseSummary[] = ROWS.map(([id, title, description, skill, level, type, durationMin, questionCount, topic]) => ({
  id,
  title,
  description,
  skill,
  level,
  type,
  durationMin,
  questionCount,
  aiGraded: type === "AI_GRADED",
  topic,
  createdAt: new Date(NOW - id * DAY).toISOString(),
}));

/** Danh sách chủ đề (cho hộp thoại Bộ lọc) */
export const LIBRARY_TOPICS = [...new Set(EXERCISES.map((e) => e.topic))].sort((a, b) => a.localeCompare(b, "vi"));

const LEVEL_RANK: Record<CefrLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4 };

/** Bỏ dấu, hạ chữ thường để tìm kiếm tiếng Việt không phân biệt dấu */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

/** Lọc, sắp xếp, phân trang TRÊN MÁY (thay bằng API thật sau này). */
export function queryLibrary(f: LibraryFilters): LibraryResult {
  const q = normalize(f.q.trim());
  const filtered = EXERCISES.filter(
    (e) =>
      (!f.skill || e.skill === f.skill) &&
      (!f.level || e.level === f.level) &&
      (!f.type || e.type === f.type) &&
      (!f.topic || e.topic === f.topic) &&
      (!q || normalize(`${e.title} ${e.description} ${e.topic}`).includes(q))
  );

  const byNewest = (a: (typeof filtered)[number], b: (typeof filtered)[number]) => b.createdAt.localeCompare(a.createdAt);
  filtered.sort(f.sort === "level" ? (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || byNewest(a, b) : byNewest);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, f.page), pageCount);
  return { items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total, page, pageCount, pageSize: PAGE_SIZE };
}

export async function fetchLibrary(filters: LibraryFilters): Promise<LibraryResult> {
  await new Promise((resolve) => setTimeout(resolve, 350)); // giả lập độ trễ mạng
  return queryLibrary(filters);
}
