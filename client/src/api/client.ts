import axios from "axios";
import type { AxiosResponse } from "axios";
import type { ApiResponse } from "../types/auth";

const TOKEN_KEY = "englishai_token";
export const UNAUTHORIZED_EVENT = "auth:unauthorized";

export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* bỏ qua: trình duyệt chặn localStorage */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
  },
};

export const api = axios.create({ baseURL: "/api/v1" });

// Tự gắn JWT vào mọi request (backend dùng header Bearer, không dùng cookie)
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 = token hết hạn/không hợp lệ: xóa token và báo cho useAuth
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  }
);

/** Bóc { data, error }: trả về data, hoặc ném lỗi với message của backend. */
export async function unwrap<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  const { data: body } = await request;
  if (body.error) throw new Error(body.error.message);
  return body.data as T;
}

export function getErrorMessage(error: unknown, fallback = "Đã có lỗi xảy ra, vui lòng thử lại."): string {
  if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
    if (!error.response) return "Không kết nối được máy chủ. Hãy kiểm tra mạng rồi thử lại.";
    return error.response.data?.error?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
