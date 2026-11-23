import type { AnswerableExerciseType, ExerciseContentMap, ExerciseValueMap } from "../../../types/exercise";

/** Dữ liệu mẫu cho trang xem thử /dev/exercises. `review` là bài làm giả của học sinh (có chỗ sai) và đáp án đúng. */
interface Sample<T extends AnswerableExerciseType> {
  content: ExerciseContentMap[T];
  review: { value: ExerciseValueMap[T]; correctAnswer: ExerciseValueMap[T]; explanation: string };
}

export const SAMPLES: { [T in AnswerableExerciseType]: Sample<T> } = {
  multiple_choice: {
    content: {
      passage: "Lan usually gets up at six o'clock. She has breakfast with her family and goes to school by bike. After school, she plays badminton with her friends and does her homework in the evening.",
      questions: [
        { q: "What time does Lan usually get up?", options: ["At five o'clock", "At six o'clock", "At seven o'clock", "At eight o'clock"] },
        { q: "How does Lan go to school?", options: ["By bus", "By car", "By bike", "On foot"] },
        { q: "What does Lan do after school?", options: ["She watches TV", "She plays badminton", "She goes shopping"] },
      ],
    },
    review: { value: [1, 0, 1], correctAnswer: [1, 2, 1], explanation: "Đoạn văn nói “goes to school by bike” nên câu 2 chọn “By bike”." },
  },
  fill_blank: {
    content: { text: "Yesterday I ___ to the market and ___ some fresh fruit. My mother ___ very happy.", hint: "Dùng thì quá khứ đơn của go, buy, be." },
    review: { value: ["went", "buyed", "was"], correctAnswer: ["went", "bought", "was"], explanation: "“buy” là động từ bất quy tắc: buy → bought." },
  },
  matching: {
    content: { left: ["Apple", "Dog", "Teacher", "Book"], right: ["Giáo viên", "Quyển sách", "Quả táo", "Con chó"] },
    review: {
      value: [
        [0, 2],
        [1, 1],
        [2, 0],
      ],
      correctAnswer: [
        [0, 2],
        [1, 3],
        [2, 0],
        [3, 1],
      ],
      explanation: "Dog = con chó, Book = quyển sách.",
    },
  },
  error_correction: {
    content: { sentence: "She don't like playing football on Sundays.", wrong: "don't like" },
    review: { value: ["do not likes"], correctAnswer: ["doesn't like"], explanation: "Chủ ngữ “She” là ngôi thứ ba số ít nên dùng “doesn't” + động từ nguyên mẫu." },
  },
  listening_fill: {
    content: {
      script: "My name is ___. I live in ___ with my parents. Every morning I take the bus to school. I like ___ because we have art class.",
      blanks: 3,
      spoken: "My name is Anna. I live in London with my parents. Every morning I take the bus to school. I like Mondays because we have art class.",
    },
    review: { value: ["Anna", "London", "tuesdays"], correctAnswer: ["Anna", "London", "Mondays"], explanation: "Nghe lại đoạn cuối: “I like Mondays because we have art class”." },
  },
  writing: {
    content: { prompt: "Write about your favourite hobby. Say what it is, how often you do it and why you like it.", minWords: 30 },
    review: {
      value: { text: "My favourite hobby is playing football. I play it with my friends every weekend at the park near my house." },
      correctAnswer: { text: "" },
      explanation: "Bài viết được AI chấm điểm sau khi nộp.",
    },
  },
  speaking: {
    content: { prompt: "Talk about your favourite hobby. Say what it is, how often you do it and why you like it." },
    review: { value: { blob: null, durationSec: 0 }, correctAnswer: { blob: null, durationSec: 0 }, explanation: "Bài Nói được AI chấm điểm sau khi nộp." },
  },
};

/** Bài Nghe mẫu để thử các tình huống: thiếu spoken, số "___" không khớp blanks */
export const LISTENING_EXTRAS: { title: string; content: ExerciseContentMap["listening_fill"] }[] = [
  {
    title: "Thiếu spoken (phải hiện cảnh báo và khóa nút phát)",
    content: { script: "We have lunch at ___ every day.", blanks: 1 },
  },
  {
    title: "Số “___” khác blanks (ô nhập xếp bên dưới)",
    content: {
      script: "Tom gets up at ___ and goes to school by ___.",
      blanks: 3,
      spoken: "Tom gets up at six and goes to school by bus. He studies English every day. It is his favourite subject.",
    },
  },
];

/** Kết quả bài Viết mẫu: có lỗi tìm thấy, lỗi lặp hai lần trong bài ("I goes") và lỗi không tìm thấy ("freinds") */
export const WRITING_RESULT_SAMPLE = {
  text: "Last weekend I goes to the park with my freind. We plays football for two hours.\nMy friend Nam is very kind person. After that I goes home and I was tired.",
  score: 6.5,
  maxScore: 10,
  criteria: { content: 7, coherence: 6.5, vocabulary: 6, grammar: 5.5 },
  comment: "Bài viết có ý rõ ràng và đủ yêu cầu. Em cần chú ý chia động từ theo chủ ngữ và dùng mạo từ trước danh từ đếm được.",
  errors: [
    { type: "grammar:subject_verb_agreement", text: "I goes", correction: "I went", explanation: "Kể chuyện đã xảy ra nên dùng quá khứ: went." },
    { type: "grammar:subject_verb_agreement", text: "I goes", correction: "I went", explanation: "Cùng lỗi như trên: dùng quá khứ đơn." },
    { type: "grammar:subject_verb_agreement", text: "We plays", correction: "We played", explanation: "Chủ ngữ We đi với động từ nguyên mẫu, ở đây dùng quá khứ." },
    { type: "grammar:article", text: "very kind person", correction: "a very kind person", explanation: "Danh từ đếm được số ít cần mạo từ a." },
    { type: "spelling:typo", text: "freinds", correction: "friends", explanation: "Sai chính tả: friends." },
    { type: "punctuation:comma", text: "After that", correction: "After that,", explanation: "Thêm dấu phẩy sau cụm mở đầu câu." },
    { type: "style", text: "was tired", correction: "was very tired", explanation: "Có thể nhấn mạnh hơn." },
  ],
};
