import type { GradeHistoryEntry, GradingListItem, GradingSubmission, SaveGradePayload, WritingCriteria } from "../../../types/grading";
import { averageScore } from "../grading/gradingMeta";

/**
 * DỮ LIỆU GIẢ cho màn Chấm bài viết.
 * TODO(backend): CHƯA có API cho giáo viên đọc bài làm và sửa điểm. Khi có, thay các hàm dưới bằng gọi API thật
 * (đọc danh sách/chi tiết bài làm dạng writing; lưu điểm giáo viên), giữ nguyên kiểu trong types/grading.ts
 * (điểm cuối của backend = COALESCE(teacher_score, score)).
 */

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();

const aiEntry = (id: number, submittedHoursAgo: number, criteria: WritingCriteria): GradeHistoryEntry => ({
  id: `ai-${id}`,
  by: "AI",
  total: averageScore(criteria),
  at: iso(submittedHoursAgo - 0.02),
});

const C = (content: number, coherence: number, vocabulary: number, grammar: number): WritingCriteria => ({ content, coherence, vocabulary, grammar });

const SEED: GradingSubmission[] = [
  {
    id: 1,
    studentName: "Nguyễn Minh Anh",
    exerciseTitle: "Describe your daily routine",
    className: "10A1",
    submittedAt: iso(5),
    dueAt: iso(-19),
    status: "PENDING",
    durationMin: 18,
    text: "I wake up at 6 o'clock every morning. After that, I brush my teeth and have breakfast with my family. Yesterday I go to school by bike because the weather was nice. My school start at 7 AM and finish at 4 PM. I like English very much, and I am study it every day. In the evening, I do my homework and watch TV. I go to bed at 10 o'clock.",
    ai: {
      criteria: C(7.5, 7, 6.5, 5.5),
      comment: "Bài viết đủ ý và dễ hiểu, các hoạt động trong ngày được sắp xếp theo trình tự hợp lý. Em cần chú ý chia động từ đúng thì và đúng ngôi, đặc biệt khi có từ chỉ thời gian như “Yesterday”. Hãy thử thêm vài từ nối như “then”, “after school” để bài mạch lạc hơn.",
      errors: [
        { type: "grammar:tense", text: "Yesterday I go to school", correction: "Yesterday I went to school", explanation: "Có “Yesterday” nên động từ phải ở thì quá khứ đơn: go → went." },
        { type: "grammar:subject-verb-agreement", text: "My school start", correction: "My school starts", explanation: "Chủ ngữ số ít “My school” thì động từ thêm -s: starts." },
        { type: "grammar:subject-verb-agreement", text: "finish", correction: "finishes", explanation: "“finish” cùng chủ ngữ “My school” nên phải là “finishes”." },
        { type: "grammar:verb-form", text: "I am study", correction: "I study", explanation: "Không dùng “am” trước động từ nguyên mẫu; dùng “I study” hoặc “I am studying”." },
        { type: "vocabulary:collocation", text: "on the weekend", correction: "at the weekend", explanation: "Trong tiếng Anh-Anh thường dùng “at the weekend”." },
      ],
    },
    history: [aiEntry(1, 5, C(7.5, 7, 6.5, 5.5))],
  },
  {
    id: 2,
    studentName: "Trần Gia Bảo",
    exerciseTitle: "My favourite holiday",
    className: "10A2",
    submittedAt: iso(8),
    dueAt: iso(-16),
    status: "PENDING",
    durationMin: 25,
    text: "My favourite holiday is Tet because all my family members gather together. Last year we travelled to my grandparents' house in Hue. The food was delicious and there were many peoples in the village. I have wore the new ao dai and received lucky money. However, I think it is more better to stay at home than going out in the cold weather. Therefore, I really looking forward to the next Tet.",
    ai: {
      criteria: C(8, 7.5, 7, 6),
      comment: "Em chọn được chủ đề gần gũi và kể có cảm xúc. Từ vựng khá phong phú, tuy nhiên vẫn còn một số lỗi ngữ pháp cơ bản về danh từ số nhiều, thì quá khứ và so sánh. Hãy đọc lại bài trước khi nộp để tự sửa những lỗi này.",
      errors: [
        { type: "grammar:plural-noun", text: "many peoples", correction: "many people", explanation: "“people” đã là danh từ số nhiều, không thêm -s." },
        { type: "grammar:tense", text: "I have wore", correction: "I wore", explanation: "Dùng quá khứ đơn “wore” (hoặc “I have worn”), không dùng “have wore”." },
        { type: "grammar:comparative", text: "more better", correction: "better", explanation: "“better” đã là dạng so sánh hơn của “good”, không thêm “more”." },
        { type: "grammar:parallelism", text: "than going out", correction: "than to go out", explanation: "Hai vế so sánh cần cùng dạng: to stay … than to go out." },
        { type: "grammar:verb-form", text: "I really looking forward", correction: "I am really looking forward", explanation: "Thiếu trợ động từ “am” trước “looking forward”." },
      ],
    },
    history: [aiEntry(2, 8, C(8, 7.5, 7, 6))],
  },
  {
    id: 3,
    studentName: "Lê Thu Hà",
    exerciseTitle: "Describe your daily routine",
    className: "10A1",
    submittedAt: iso(26),
    dueAt: iso(2),
    status: "PENDING",
    durationMin: 12,
    text: "Every day I get up early. I eating breakfast at 6:30 and then I go to school. I have five lesson in the morning. At lunch I eat rice with my friend. After school I play football with my friends. I am tired but happy.",
    ai: {
      criteria: C(6.5, 6, 6, 5),
      comment: "Bài ngắn nhưng rõ ràng và đúng chủ đề. Em cần chú ý dạng của động từ sau chủ ngữ và dùng số nhiều cho danh từ đếm được. Hãy viết thêm vài câu về buổi chiều và buổi tối để bài đầy đủ hơn.",
      errors: [
        { type: "grammar:verb-form", text: "I eating", correction: "I eat", explanation: "Thì hiện tại đơn dùng động từ nguyên mẫu: I eat." },
        { type: "grammar:plural-noun", text: "five lesson", correction: "five lessons", explanation: "Sau số lớn hơn 1 danh từ đếm được phải ở dạng số nhiều." },
        { type: "grammar:plural-noun", text: "with my friend", correction: "with my friends", explanation: "Ăn trưa với nhiều bạn nên dùng số nhiều: friends." },
      ],
    },
    history: [aiEntry(3, 26, C(6.5, 6, 6, 5))],
  },
  {
    id: 4,
    studentName: "Phạm Quốc Huy",
    exerciseTitle: "My favourite holiday",
    className: "10A2",
    submittedAt: iso(30),
    dueAt: iso(24),
    status: "GRADED",
    durationMin: 22,
    text: "Summer is my favourite season of the year. I usually go to Da Nang with my parents. We swim in the sea, build sand castles and eat fresh seafood. The most memorable trip was in 2023, when we got lost on the way to the hotel. Fortunately, a kind man showed us the right way. I will never forget that day.",
    ai: {
      criteria: C(8.5, 8.5, 8, 9),
      comment: "Bài viết mạch lạc, từ vựng tự nhiên và gần như không có lỗi ngữ pháp. Câu chuyện bị lạc đường làm bài sinh động. Em có thể thêm một chi tiết cảm xúc để bài sâu sắc hơn.",
      errors: [{ type: "vocabulary:word-choice", text: "showed us the right way", correction: "showed us the way", explanation: "Có thể bỏ “right” để câu tự nhiên hơn." }],
    },
    teacher: { criteria: C(9, 8.5, 8, 9), total: 8.8, comment: "Bài viết rất tốt, em kể chuyện có cảm xúc. Cố gắng phát huy nhé!", gradedAt: iso(20) },
    history: [aiEntry(4, 30, C(8.5, 8.5, 8, 9)), { id: "t-4", by: "TEACHER", total: 8.8, at: iso(20) }],
  },
  {
    id: 5,
    studentName: "Đỗ Khánh Linh",
    exerciseTitle: "Describe your daily routine",
    className: "10A1",
    submittedAt: iso(1),
    dueAt: iso(2),
    status: "PENDING",
    durationMin: 15,
    text: "My daily routine is simple. I wakes up at 5:30 and exercise for twenty minutes. Then I have a shower and go to school. I come back home at 5 and cooking dinner for my family. I go to bed late because I like play games.",
    ai: {
      criteria: C(6.5, 6.5, 6, 5),
      comment: "Em nêu được các hoạt động chính trong ngày. Cần sửa chia động từ theo ngôi và dạng động từ sau “like”. Hãy dùng thêm từ nối như “first”, “after that” để tăng tính liên kết.",
      errors: [
        { type: "grammar:subject-verb-agreement", text: "I wakes up", correction: "I wake up", explanation: "Chủ ngữ “I” đi với động từ nguyên mẫu, không thêm -s." },
        { type: "grammar:parallelism", text: "and cooking dinner", correction: "and cook dinner", explanation: "Hai động từ nối bằng “and” phải cùng dạng: come … and cook." },
        { type: "grammar:verb-form", text: "like play games", correction: "like playing games", explanation: "Sau “like” dùng V-ing (hoặc to V): like playing games." },
      ],
    },
    history: [aiEntry(5, 1, C(6.5, 6.5, 6, 5))],
  },
  {
    id: 6,
    studentName: "Vũ Hoàng Nam",
    exerciseTitle: "My favourite holiday",
    className: "10A2",
    submittedAt: iso(3),
    dueAt: iso(-21),
    status: "PENDING",
    durationMin: 28,
    text: "Christmas is a special time for my family although we are not Christians. We decorate the tree, cook a big dinner and exchange gifts. My brother always give me books because he knows I love reading. This year I want to travel somewhere warm, but my parents disagree with me. They said that money is not enough.",
    ai: {
      criteria: C(7.5, 7.5, 7.5, 7),
      comment: "Bài viết có ý riêng và từ vựng tốt. Lỗi chính là chia động từ theo ngôi và thống nhất thì khi kể lại. Em nên kiểm tra lại các câu có chủ ngữ số ít.",
      errors: [
        { type: "grammar:subject-verb-agreement", text: "My brother always give", correction: "My brother always gives", explanation: "Chủ ngữ số ít “My brother” nên động từ thêm -s: gives." },
        { type: "grammar:tense", text: "They said that money is not enough", correction: "They said that money was not enough", explanation: "Câu tường thuật ở quá khứ nên lùi thì: is → was." },
      ],
    },
    history: [aiEntry(6, 3, C(7.5, 7.5, 7.5, 7))],
  },
];

// Bản sao trong bộ nhớ: lưu điểm xong vẫn còn cho đến khi tải lại trang
let store: GradingSubmission[] = structuredClone(SEED);
const delay = <T,>(value: T, ms = 350) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const toListItem = ({ id, studentName, exerciseTitle, className, submittedAt, dueAt, status }: GradingSubmission): GradingListItem => ({ id, studentName, exerciseTitle, className, submittedAt, dueAt, status });

/** Mới nộp trước (cần chấm lên đầu nếu cùng lúc, nhưng sắp theo giờ nộp giảm dần) */
export const fetchGradingList = () => delay(store.map(toListItem).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));

export async function fetchGradingSubmission(id: number): Promise<GradingSubmission> {
  const found = store.find((s) => s.id === id);
  if (!found) throw new Error("Không tìm thấy bài làm này.");
  return delay(structuredClone(found));
}

export async function saveGradingScores(id: number, payload: SaveGradePayload): Promise<GradingSubmission> {
  const index = store.findIndex((s) => s.id === id);
  if (index === -1) throw new Error("Không tìm thấy bài làm này.");
  const at = new Date().toISOString();
  const current = store[index];
  const updated: GradingSubmission = {
    ...current,
    status: "GRADED",
    teacher: { ...payload, gradedAt: at },
    history: [...current.history, { id: `t-${id}-${current.history.length}`, by: "TEACHER", total: payload.total, at }],
  };
  store = store.map((s, i) => (i === index ? updated : s));
  return delay(structuredClone(updated));
}
