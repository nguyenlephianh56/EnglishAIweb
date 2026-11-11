/**
 * Cờ bật/tắt các chức năng cần backend.
 * Backend CHƯA có PATCH /users/me và POST /users/me/password (xem api/users.ts).
 * Khi backend xong từng API, đổi cờ tương ứng thành true; giao diện tự mở nút và gọi API thật.
 */
export const BACKEND_READY = { updateProfile: false, changePassword: false };
