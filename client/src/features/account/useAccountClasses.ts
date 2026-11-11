import { useQuery } from "@tanstack/react-query";
import { listJoinedClasses } from "../../api/classes";

export const STUDENT_CLASSES_KEY = ["student", "classes"] as const;

/** Học sinh: các lớp đã tham gia (GET /classes), dữ liệu THẬT */
export const useStudentClasses = () => useQuery({ queryKey: STUDENT_CLASSES_KEY, queryFn: listJoinedClasses, staleTime: 30 * 1000 });
