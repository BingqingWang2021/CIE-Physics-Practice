import { z } from "zod";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { createRouter, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, practiceSessions, wrongItems, vocabWords, userNotes } from "@db/schema";
import { listWrong } from "./queries/progress";

/* ── 管理端：查看所有学生的进度与诊断数据 ─────────────────────────── */

export const adminRouter = createRouter({
  /* 学生总览：每人一行聚合统计（场次 / 题量 / 正确率 / 错题数 / 最近活跃） */
  students: adminQuery.query(async () => {
    const db = getDb();
    const allUsers = await db.select().from(users).orderBy(desc(users.lastSignInAt));
    const allSessions = await db.select().from(practiceSessions);
    const allWrong = await db
      .select({ userId: wrongItems.userId })
      .from(wrongItems);

    const wrongCount = new Map<number, number>();
    for (const w of allWrong) wrongCount.set(w.userId, (wrongCount.get(w.userId) ?? 0) + 1);

    /* 单词与笔记数量，一起并入总览 */
    const vocabRows = await db
      .select({ userId: vocabWords.userId, n: sql<number>`count(*)` })
      .from(vocabWords)
      .groupBy(vocabWords.userId);
    const vocabCount = new Map(vocabRows.map((r) => [r.userId, Number(r.n)]));
    const noteRows = await db
      .select({ userId: userNotes.userId, n: sql<number>`count(*)` })
      .from(userNotes)
      .groupBy(userNotes.userId);
    const noteCount = new Map(noteRows.map((r) => [r.userId, Number(r.n)]));

    const byUser = new Map<number, typeof allSessions>();
    for (const s of allSessions) {
      if (!byUser.has(s.userId)) byUser.set(s.userId, []);
      byUser.get(s.userId)!.push(s);
    }

    return allUsers.map((u) => {
      const ss = byUser.get(u.id) ?? [];
      const totalQ = ss.reduce((a, s) => a + s.total, 0);
      const rightQ = ss.reduce((a, s) => a + s.rightCount, 0);
      const last = ss.reduce<number>((a, s) => Math.max(a, s.createdAt.getTime()), 0);
      return {
        id: u.id,
        name: u.name ?? u.username ?? "同学",
        username: u.username,
        role: u.role,
        level: u.level ?? null,
        grp: u.grp ?? "",
        alias: u.alias ?? "",
        sessions: ss.length,
        totalQ,
        accuracy: totalQ ? Math.round((rightQ / totalQ) * 100) : null,
        wrong: wrongCount.get(u.id) ?? 0,
        vocab: vocabCount.get(u.id) ?? 0,
        notes: noteCount.get(u.id) ?? 0,
        lastSignInAt: u.lastSignInAt.getTime(),
        lastActive: last || u.lastSignInAt.getTime(),
      };
    });
  }),

  /* 学生管理：分组 / 备注名 / 删除账号（连带清空其全部数据） */
  setGroup: adminQuery
    .input(z.object({ userId: z.number().int().positive(), grp: z.string().max(64) }))
    .mutation(async ({ input }) => {
      await getDb().update(users).set({ grp: input.grp || null }).where(eq(users.id, input.userId));
      return { ok: true };
    }),

  setAlias: adminQuery
    .input(z.object({ userId: z.number().int().positive(), alias: z.string().max(64) }))
    .mutation(async ({ input }) => {
      await getDb().update(users).set({ alias: input.alias || null }).where(eq(users.id, input.userId));
      return { ok: true };
    }),

  deleteStudent: adminQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const u = await db.query.users.findFirst({ where: (t, { eq: e }) => e(t.id, input.userId) });
      if (!u) throw new Error("学生不存在");
      if (u.role === "admin") throw new Error("不能删除管理员账号");
      await db.delete(practiceSessions).where(eq(practiceSessions.userId, input.userId));
      await db.delete(wrongItems).where(eq(wrongItems.userId, input.userId));
      await db.delete(vocabWords).where(eq(vocabWords.userId, input.userId));
      await db.delete(userNotes).where(eq(userNotes.userId, input.userId));
      await db.delete(users).where(eq(users.id, input.userId));
      return { ok: true };
    }),

  /* 单个学生详情：完整练习记录 + 错题，供诊断分析 */
  studentDetail: adminQuery
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const u = await db.query.users.findFirst({
        where: (t, { eq }) => eq(t.id, input.userId),
      });
      if (!u) return null;
      /* 管理端需要完整字段（得分/用时/知识点），按时间正序返回 */
      const rows = await getDb()
        .select()
        .from(practiceSessions)
        .where(eq(practiceSessions.userId, input.userId))
        .orderBy(desc(practiceSessions.createdAt))
        .limit(300);
      const sessions = rows.reverse().map((r) => ({
        at: r.createdAt.getTime(),
        topic: r.topic,
        mode: r.mode as "mcq" | "sq",
        pct: r.pct,
        got: r.got,
        max: r.maxScore,
        right: r.rightCount,
        total: r.total,
        spentSec: r.spentSec,
        kp: r.kp ?? "[]",
      }));
      const wrong = await listWrong(input.userId);
      const vocabN = await getDb()
        .select({ n: sql<number>`count(*)` })
        .from(vocabWords)
        .where(eq(vocabWords.userId, input.userId));
      const noteN = await getDb()
        .select({ n: sql<number>`count(*)` })
        .from(userNotes)
        .where(eq(userNotes.userId, input.userId));
      /* 总体学习情况报告：板块覆盖 / 强弱板块 / 最近趋势 */
      const byTopic = new Map<string, { n: number; sumPct: number; last: number }>();
      for (const s of sessions) {
        const t = byTopic.get(s.topic) ?? { n: 0, sumPct: 0, last: 0 };
        t.n++; t.sumPct += s.pct; t.last = Math.max(t.last, s.at);
        byTopic.set(s.topic, t);
      }
      const topics = [...byTopic.entries()]
        .map(([topic, v]) => ({ topic, n: v.n, avgPct: Math.round(v.sumPct / v.n), last: v.last }))
        .sort((a, b) => b.last - a.last);
      const recent = sessions.slice(-10);
      const trend = recent.length
        ? Math.round(recent.reduce((a, s) => a + s.pct, 0) / recent.length)
        : null;
      return {
        user: {
          id: u.id,
          name: u.name ?? u.username ?? "同学",
          username: u.username,
          role: u.role,
          level: u.level ?? null,
          grp: u.grp ?? "",
          alias: u.alias ?? "",
          createdAt: u.createdAt.getTime(),
          lastSignInAt: u.lastSignInAt.getTime(),
        },
        sessions,
        wrong,
        stats: {
          vocab: Number(vocabN.at(0)?.n ?? 0),
          notes: Number(noteN.at(0)?.n ?? 0),
          topicCount: topics.length,
          topics,
          trend,
        },
      };
    }),

  /* 全部学生的练习报告（含报告 id，供管理/删除），按时间倒序 */
  allSessions: adminQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: practiceSessions.id,
        userId: practiceSessions.userId,
        student: users.name,
        username: users.username,
        topic: practiceSessions.topic,
        mode: practiceSessions.mode,
        pct: practiceSessions.pct,
        got: practiceSessions.got,
        max: practiceSessions.maxScore,
        total: practiceSessions.total,
        spentSec: practiceSessions.spentSec,
        at: practiceSessions.createdAt,
      })
      .from(practiceSessions)
      .leftJoin(users, eq(practiceSessions.userId, users.id))
      .orderBy(desc(practiceSessions.createdAt))
      .limit(1000);
    return rows.map((r) => ({
      ...r,
      at: r.at.getTime(),
      student: r.student ?? r.username ?? "同学",
    }));
  }),

  /* 删除单条报告 */
  deleteSession: adminQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await getDb().delete(practiceSessions).where(eq(practiceSessions.id, input.id));
      return { ok: true };
    }),

  /* 批量删除（按 id 列表，前端分组删除时一次提交） */
  deleteSessions: adminQuery
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }))
    .mutation(async ({ input }) => {
      await getDb().delete(practiceSessions).where(inArray(practiceSessions.id, input.ids));
      return { ok: true, count: input.ids.length };
    }),
});
