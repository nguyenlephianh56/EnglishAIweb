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
    content: { script: "My name is Anna. I live in London with my parents. Every morning I take the bus to school. I like Mondays because we have art class.", blanks: 3 },
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
};
