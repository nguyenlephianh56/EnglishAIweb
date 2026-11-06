import { randomInt } from "crypto";
import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
 import {CreateClassInput,JoinClassInput,AddStudentInput,} from "./classes.schema";


// Mã lớp gồm 6 ký tự lấy từ bộ chữ HOA + số (khớp CHECK trong database)
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

// Số lần thử tối đa khi mã bị trùng (tránh vòng lặp vô hạn)
const MAX_CODE_ATTEMPTS = 5;

// Sinh mã ngẫu nhiên. Dùng crypto.randomInt (an toàn hơn Math.random)
// vì mã lớp là thứ "ai biết mã là vào được lớp"
const generateClassCode = (): string => {
  let code = "";

  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  }

  return code;
};

// P2002 = Prisma báo vi phạm ràng buộc UNIQUE (ở đây là mã lớp bị trùng)
const isUniqueViolation = (error: unknown): boolean => {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
};

// GV tạo lớp: tự sinh mã, nếu trùng thì sinh lại
export const createClass = async (
  teacherId: number,
  input: CreateClassInput
) => {
  for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
    try {
      // Không "kiểm tra mã có trùng không rồi mới tạo" vì giữa hai việc đó
      // có thể có người khác tạo mã giống. Cứ tạo luôn, để DB (UNIQUE) quyết định
      return await prisma.class.create({
        data: {
          name: input.name,
          code: generateClassCode(),
          teacherId,
        },
        select: {
          id: true,
          name: true,
          code: true,
          teacherId: true,
          createdAt: true,
        },
      });
    } catch (error) {
      // Trùng mã -> vòng lặp thử mã khác; lỗi khác -> ném ra ngoài
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  throw Object.assign(
    new Error("Không thể tạo mã lớp lúc này, vui lòng thử lại"),
    {
      statusCode: 503,
      code: "CLASS_CODE_GENERATION_FAILED",
    }
  );
};

  // HS tham gia lớp bằng mã
  export const joinClass = async (
    studentId: number,
    input: JoinClassInput
  ) => {
    // input.code đã được Zod trim + viết HOA ở bước validate
    const foundClass = await prisma.class.findUnique({
      where: { code: input.code },
      select: {
        id: true,
        name: true,
        teacher: { select: { id: true, name: true } },
      },
    });

    // Sai mã -> chỉ báo "không tìm thấy", không tiết lộ gì thêm
    if (!foundClass) {
      throw Object.assign(new Error("Mã lớp không đúng"), {
        statusCode: 404,
        code: "CLASS_NOT_FOUND",
      });
    }

    try {
      // Tạo luôn, để khóa chính (classId, studentId) của DB chặn trùng.
      // Cách này an toàn hơn "kiểm tra đã là thành viên chưa rồi mới tạo"
      // khi có 2 request gửi cùng lúc
      const member = await prisma.classMember.create({
        data: {
          classId: foundClass.id,
          studentId,
        },
        select: { joinedAt: true },
      });

      return {
        id: foundClass.id,
        name: foundClass.name,
        teacher: foundClass.teacher,
        joinedAt: member.joinedAt,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw Object.assign(new Error("Bạn đã tham gia lớp này rồi"), {
          statusCode: 409,
          code: "ALREADY_MEMBER",
        });
      }

      throw error;
    }
  };
  
    // Người đang thao tác (lấy từ req.user)
  type Actor = { id: number; role: Role };

  // Tìm lớp mà người này được QUẢN LÝ:
  // - GV: chỉ lớp có teacher_id = id của mình
  // - ADMIN: mọi lớp
  // Không thấy -> 404 (không phân biệt "lớp không tồn tại" và "lớp của người khác",
  // để không lộ việc lớp đó có tồn tại)
  // Hàm này sẽ được dùng lại ở bước xóa HS và xem chi tiết lớp
  const findManagedClass = async (actor: Actor, classId: number) => {
    const found = await prisma.class.findFirst({
      where: {
        id: classId,
        ...(actor.role === Role.ADMIN ? {} : { teacherId: actor.id }),
      },
      select: { id: true, name: true },
    });

    if (!found) {
      throw Object.assign(new Error("Không tìm thấy lớp"), {
        statusCode: 404,
        code: "CLASS_NOT_FOUND",
      });
    }

    return found;
  };

  // GV/ADMIN thêm HS vào lớp bằng email
  export const addStudent = async (
    actor: Actor,
    classId: number,
    input: AddStudentInput
  ) => {
    // Kiểm tra quyền với lớp TRƯỚC, để GV khác không dò được email nào có trong hệ thống
    await findManagedClass(actor, classId);

    const student = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    // Không tồn tại hoặc không phải HS -> cùng một lỗi 404,
    // để không tiết lộ email đó là của GV hay admin
    if (!student || student.role !== Role.STUDENT) {
      throw Object.assign(
        new Error("Không tìm thấy học sinh với email này"),
        {
          statusCode: 404,
          code: "STUDENT_NOT_FOUND",
        }
      );
    }

    if (student.status !== UserStatus.ACTIVE) {
      throw Object.assign(
        new Error("Tài khoản học sinh không hoạt động"),
        {
          statusCode: 400,
          code: "STUDENT_NOT_ACTIVE",
        }
      );
    }

    try {
      // Tạo luôn, để khóa chính (classId, studentId) của DB chặn trùng
      const member = await prisma.classMember.create({
        data: { classId, studentId: student.id },
        select: { joinedAt: true },
      });

      // Chỉ trả id, name, email (không có passwordHash, role, status)
      return {
        id: student.id,
        name: student.name,
        email: student.email,
        joinedAt: member.joinedAt,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw Object.assign(new Error("Học sinh đã có trong lớp"), {
          statusCode: 409,
          code: "ALREADY_MEMBER",
        });
      }

      throw error;
    }
  };

// DELETE class
  // GV chủ lớp / ADMIN xóa HS khỏi lớp
export const removeStudent = async (
  actor: Actor,
  classId: number,
  studentId: number
) => {
  // Kiểm tra quyền với lớp trước (GV khác -> 404 CLASS_NOT_FOUND)
  await findManagedClass(actor, classId);

  // deleteMany trả về số dòng đã xóa. Dùng nó thay vì "tìm rồi mới xóa"
  // để chỉ cần MỘT truy vấn và không bị lệch nếu có request khác chen vào
  const result = await prisma.classMember.deleteMany({
    where: { classId, studentId },
  });

  // 0 dòng bị xóa = HS này không thuộc lớp (hoặc id HS không tồn tại)
  if (result.count === 0) {
    throw Object.assign(new Error("Học sinh không thuộc lớp này"), {
      statusCode: 404,
      code: "STUDENT_NOT_IN_CLASS",
    });
  }

  return { classId, studentId };
};

//List class
// Lớp không tồn tại hoặc người này không có quyền xem -> cùng một lỗi 404
const classNotFound = () =>
  Object.assign(new Error("Không tìm thấy lớp"), {
    statusCode: 404,
    code: "CLASS_NOT_FOUND",
  });

// Danh sách lớp theo vai trò
export const listClasses = async (actor: Actor) => {
  // HS: lớp đã tham gia, chỉ thông tin lớp (không mã lớp, không danh sách HS)
  if (actor.role === Role.STUDENT) {
    return prisma.class.findMany({
      where: { members: { some: { studentId: actor.id } } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        teacher: { select: { id: true, name: true } },
      },
    });
  }

  // GV: lớp của mình. ADMIN: tất cả lớp
  const classes = await prisma.class.findMany({
    where: actor.role === Role.ADMIN ? {} : { teacherId: actor.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      code: true,
      createdAt: true,
      teacher: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
  });

  // Đổi _count.members thành studentCount cho dễ đọc
  return classes.map(({ _count, ...rest }) => ({
    ...rest,
    studentCount: _count.members,
  }));
};

// Chi tiết một lớp
export const getClass = async (actor: Actor, classId: number) => {
  // HS: phải là thành viên; chỉ thấy thông tin lớp
  if (actor.role === Role.STUDENT) {
    const found = await prisma.class.findFirst({
      where: { id: classId, members: { some: { studentId: actor.id } } },
      select: {
        id: true,
        name: true,
        createdAt: true,
        teacher: { select: { id: true, name: true } },
      },
    });

    if (!found) throw classNotFound();

    return found;
  }

  // GV: phải là chủ lớp. ADMIN: mọi lớp
  const found = await prisma.class.findFirst({
    where: {
      id: classId,
      ...(actor.role === Role.ADMIN ? {} : { teacherId: actor.id }),
    },
    select: {
      id: true,
      name: true,
      code: true,
      createdAt: true,
      teacher: { select: { id: true, name: true } },
      members: {
        orderBy: { joinedAt: "asc" },
        select: {
          joinedAt: true,
          // Chỉ lấy id, name, email của HS (tuyệt đối không lấy passwordHash)
          student: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!found) throw classNotFound();

  // Làm phẳng danh sách HS: [{id, name, email, joinedAt}]
  const { members, ...classInfo } = found;
  const students = members.map((m) => ({
    id: m.student.id,
    name: m.student.name,
    email: m.student.email,
    joinedAt: m.joinedAt,
  }));

  return { ...classInfo, studentCount: students.length, students };
};