import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import * as cookie from "cookie";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { createRouter, publicQuery } from "./middleware";
import { signSessionToken } from "./kimi/session";
import { getSessionCookieOptions } from "./lib/cookies";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { users, type User } from "@db/schema";

/* ── 内置管理员账号：首次用该用户名+密码登录时自动创建 ─────────────── */
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "jingshijiaoyu";

/* scrypt 加盐哈希，格式 scrypt:<salt>:<hash>（均为 hex） */
function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}
function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const calc = scryptSync(pw, salt, 64);
  const want = Buffer.from(hash, "hex");
  return calc.length === want.length && timingSafeEqual(calc, want);
}

const usernameSchema = z
  .string()
  .min(2, "用户名至少 2 个字符")
  .max(32, "用户名最多 32 个字符")
  .regex(/^[\w一-龥-]+$/, "用户名只能包含中英文、数字、下划线和短横线");
const passwordSchema = z.string().min(4, "密码至少 4 位").max(64, "密码最多 64 位");

async function findByUsername(username: string) {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return rows.at(0);
}

/* 登录成功后签发与 Kimi OAuth 完全相同的会话 cookie */
async function issueSession(
  resHeaders: Headers,
  reqHeaders: Headers,
  user: User,
) {
  const token = await signSessionToken({
    unionId: user.unionId,
    clientId: env.appId,
  });
  const opts = getSessionCookieOptions(reqHeaders);
  resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, token, {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: Session.maxAgeMs / 1000,
    }),
  );
}

async function touchLastSignIn(id: number) {
  await getDb()
    .update(users)
    .set({ lastSignInAt: new Date() })
    .where(eq(users.id, id));
}

export const localAuthRouter = createRouter({
  /* 注册：用户名全站唯一；admin 为保留账号，不可注册 */
  register: publicQuery
    .input(z.object({ username: usernameSchema, password: passwordSchema, name: z.string().max(32).optional() }))
    .mutation(async ({ ctx, input }) => {
      const username = input.username.trim();
      if (username === ADMIN_USERNAME) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该用户名为保留账号，请换一个" });
      }
      if (await findByUsername(username)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "用户名已被使用，请换一个" });
      }
      await getDb().insert(users).values({
        unionId: `local:${username}`,
        username,
        passwordHash: hashPassword(input.password),
        name: input.name?.trim() || username,
        lastSignInAt: new Date(),
      });
      const user = await findByUsername(username);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "注册失败，请重试" });
      await issueSession(ctx.resHeaders, ctx.req.headers, user);
      return user;
    }),

  /* 登录：校验用户名+密码；管理员账号首次登录时按内置密码创建 */
  login: publicQuery
    .input(z.object({ username: usernameSchema, password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const username = input.username.trim();
      let user = await findByUsername(username);

      if (!user && username === ADMIN_USERNAME && input.password === ADMIN_PASSWORD) {
        await getDb().insert(users).values({
          unionId: `local:${ADMIN_USERNAME}`,
          username: ADMIN_USERNAME,
          passwordHash: hashPassword(ADMIN_PASSWORD),
          name: "管理员",
          role: "admin",
          lastSignInAt: new Date(),
        });
        user = await findByUsername(ADMIN_USERNAME);
      }

      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "用户名或密码不正确" });
      }
      await touchLastSignIn(user.id);
      await issueSession(ctx.resHeaders, ctx.req.headers, user);
      return user;
    }),
});
