import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { Role, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { app } from "../app";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { expectNoLeaks } from "./authorization-leaks";

export async function createAuthorizationFixtures() {
  const suffix = randomUUID();
  const password = `t22-password-${suffix}`;
  const passwordHash = await bcrypt.hash(password, 4);

  const { actors, classes } = await prisma.$transaction(async (tx) => {
    const createActor = (name: string, role: Role, status: UserStatus = UserStatus.ACTIVE) =>
      tx.user.create({
        data: {
          name,
          email: `t22-${name.toLowerCase().replaceAll(" ", "-")}-${suffix}@example.test`,
          passwordHash,
          role,
          status,
        },
        select: { id: true, email: true, role: true, status: true },
      });

    const [teacherA, teacherB, studentA, studentB, admin, pendingTeacher, lockedTeacher] =
      await Promise.all([
        createActor("Teacher A", Role.TEACHER),
        createActor("Teacher B", Role.TEACHER),
        createActor("Student A", Role.STUDENT),
        createActor("Student B", Role.STUDENT),
        createActor("Admin", Role.ADMIN),
        createActor("Pending Teacher", Role.TEACHER, UserStatus.PENDING),
        createActor("Locked Teacher", Role.TEACHER, UserStatus.LOCKED),
      ]);

    const createClass = (name: string, teacherId: number, studentId: number) =>
      tx.class.create({
        data: {
          name,
          code: randomBytes(4).readUInt32BE().toString(36).padStart(6, "0").slice(-6).toUpperCase(),
          teacherId,
          members: { create: { studentId } },
        },
        select: { id: true, code: true, teacherId: true },
      });

    const [classA, classB] = await Promise.all([
      createClass("T22 Class A", teacherA.id, studentA.id),
      createClass("T22 Class B", teacherB.id, studentB.id),
    ]);

    return {
      actors: { teacherA, teacherB, studentA, studentB, admin, pendingTeacher, lockedTeacher },
      classes: { classA, classB },
    };
  });

  const userIds = Object.values(actors).map((actor) => actor.id);
  const classIds = Object.values(classes).map((classroom) => classroom.id);
  const forbiddenValues = [env.JWT_SECRET, env.GEMINI_API_KEY, env.DATABASE_URL, password, passwordHash];

  return {
    actors,
    classes,
    password,
    forbiddenValues,
    cleanup: () => prisma.$transaction([
      prisma.class.deleteMany({ where: { id: { in: classIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]),
  };
}

export function authorizationHeaders(actor: { id: number }, expiresIn = 3600) {
  const token = jwt.sign({ userId: actor.id }, env.JWT_SECRET, { expiresIn });
  return { Authorization: `Bearer ${token}` };
}

export async function startAuthorizationApp(forbiddenValues: readonly string[]) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Authorization test server did not bind to a TCP port");
  }
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

  return {
    async request(
      path: string,
      init?: RequestInit,
      checks?: Parameters<typeof expectNoLeaks>[1]
    ) {
      const response = await fetch(`${baseUrl}${path}`, init);
      const text = await response.text();
      const leakChecks = {
        ...checks,
        forbiddenValues: [...forbiddenValues, ...(checks?.forbiddenValues ?? [])],
      };
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        expectNoLeaks(text, leakChecks);
        throw new Error(`Expected JSON in test response (HTTP ${response.status})`);
      }
      expectNoLeaks(body, leakChecks);
      return { status: response.status, body };
    },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections();
    }),
  };
}