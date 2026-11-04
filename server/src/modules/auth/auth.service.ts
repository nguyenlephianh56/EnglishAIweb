
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { RegisterInput, LoginInput } from "./auth.schema";

// Đăng ký tài khoản
export const register = async (input: RegisterInput) => {
  const email = input.email.toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw Object.assign(new Error("Email đã được sử dụng"), {
      statusCode: 409,
      code: "EMAIL_ALREADY_EXISTS",
    });
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const role =
    input.role === "TEACHER" ? Role.TEACHER : Role.STUDENT;

  const status =
    role === Role.TEACHER
      ? UserStatus.PENDING
      : UserStatus.ACTIVE;

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email,
      passwordHash,
      role,
      status,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return user;
};

// Đăng nhập
export const login = async (input: LoginInput) => {
  const email = input.email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw Object.assign(new Error("Email hoặc mật khẩu không chính xác"), {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  const isPasswordValid = await bcrypt.compare(
    input.password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    throw Object.assign(new Error("Email hoặc mật khẩu không chính xác"), {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  if (user.status === UserStatus.PENDING) {
    throw Object.assign(new Error("Tài khoản đang chờ quản trị viên phê duyệt"), {
      statusCode: 403,
      code: "ACCOUNT_PENDING",
    });
  }

  if (user.status === UserStatus.LOCKED) {
    throw Object.assign(new Error("Tài khoản đã bị khóa"), {
      statusCode: 403,
      code: "ACCOUNT_LOCKED",
    });
  }

  const token = jwt.sign(
    {
      userId: user.id,
    },
    env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    },
    token,
  };
};

// Lấy thông tin tài khoản hiện tại
export const getMe = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw Object.assign(new Error("Không tìm thấy tài khoản"), {
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  }

  return user;
};
