import { constants } from "node:os";

/** Chỉ ghi mã Prisma hoặc mã lỗi hệ thống do Node biết. */
export function errorCodeForLog(error: unknown): string {
  if (typeof error !== "object" || error === null) return "UNKNOWN";
  const code: unknown = Object.getOwnPropertyDescriptor(error, "code")?.value;
  if (typeof code === "string" && (/^P\d{4}$/.test(code) || Object.hasOwn(constants.errno, code))) {
    return code;
  }
  return "UNKNOWN";
}
