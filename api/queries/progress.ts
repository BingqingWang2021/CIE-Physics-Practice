import { createHash } from "node:crypto";
import { getDb } from "./connection";
import { wrongItems, practiceSessions } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";

export const skeyOf = (stem: string) =>
  createHash("sha256").update(stem).digest("hex");

export async function listWrong(userId: number) {
  const rows = await getDb()
    .select()
    .from(wrongItems)
    .where(eq(wrongItems.userId, userId))
    .orderBy(desc(wrongItems.createdAt));
  return rows.map((r) => JSON.parse(r.payload));
}

export async function addWrong(userId: number, payloadJson: string) {
  const stem = (JSON.parse(payloadJson) as { s: string }).s;
  const skey = skeyOf(stem);
  await getDb()
    .insert(wrongItems)
    .values({ userId, skey, payload: payloadJson })
    .onDuplicateKeyUpdate({ set: { payload: payloadJson, createdAt: new Date() } });
}

export async function removeWrong(userId: number, stem: string) {
  await getDb()
    .delete(wrongItems)
    .where(and(eq(wrongItems.userId, userId), eq(wrongItems.skey, skeyOf(stem))));
}

export async function clearWrong(userId: number) {
  await getDb().delete(wrongItems).where(eq(wrongItems.userId, userId));
}

export async function listSessions(userId: number) {
  const rows = await getDb()
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.userId, userId))
    .orderBy(desc(practiceSessions.createdAt))
    .limit(200);
  /* 前端按时间正序累计统计，返回时翻回正序 */
  return rows.reverse().map((r) => ({
    at: r.createdAt.getTime(),
    topic: r.topic,
    mode: r.mode as "mcq" | "sq",
    pct: r.pct,
    right: r.rightCount,
    total: r.total,
  }));
}

export async function addSession(
  userId: number,
  s: {
    topic: string; mode: string; pct: number; got: number; maxScore: number;
    rightCount: number; total: number; spentSec: number; kp: string;
  },
) {
  await getDb().insert(practiceSessions).values({ userId, ...s });
}
