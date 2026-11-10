export type Role = "STUDENT" | "TEACHER" | "ADMIN";
export type UserStatus = "PENDING" | "ACTIVE" | "LOCKED";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
}

/** Mọi response của backend đều có dạng { data, error } */
export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}