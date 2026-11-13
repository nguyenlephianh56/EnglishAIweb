import { PrismaClient, Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedPromptTemplates } from "../src/ai/prompts/seed-prompts";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting EnglishAI database seed...");

  // Mat khau demo, chi su dung trong moi truong development
  const plainPassword = "Demo@123456";

  // Bam mat khau bang bcrypt
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  // 5 tai khoan theo yeu cau WORKS.md
  const users = [
    {
      name: "System Administrator",
      email: "admin@englishai.com",
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
    {
      name: "Demo Teacher",
      email: "teacher@englishai.com",
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
    },
    {
      name: "Demo Student 1",
      email: "student1@englishai.com",
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
    },
    {
      name: "Demo Student 2",
      email: "student2@englishai.com",
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
    },
    {
      name: "Demo Student 3",
      email: "student3@englishai.com",
      role: Role.STUDENT,
      status: UserStatus.ACTIVE,
    },
  ];

  // Tao hoac cap nhat tai khoan theo email
  for (const user of users) {
    const result = await prisma.user.upsert({
      where: {
        email: user.email,
      },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        status: user.status,
      },
      create: {
        ...user,
        passwordHash,
      },
    });

    console.log(
      `Seeded: ${result.email} | ${result.role} | ${result.status}`
    );
  }

  // Mau prompt mac dinh (chi tao mau con thieu, khong ghi de mau da co)
  const promptKeys = await seedPromptTemplates(prisma);
  console.log(`Seeded prompt templates: ${promptKeys.join(", ")}`);

  // Kiem tra so luong tai khoan sau khi seed
  const totalUsers = await prisma.user.count();

  console.log("--------------------------------");
  console.log("Database seed completed!");
  console.log(`Total users in database: ${totalUsers}`);
  console.log("--------------------------------");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });