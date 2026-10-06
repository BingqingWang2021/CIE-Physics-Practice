import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, userNotes } from "@db/schema";

/* 学模块：在线笔记本 + 学习阶段（AS/A2）档案。 */

export const notesRouter = createRouter({
  /* 取某板块笔记（topic='' 为通用笔记本） */
  get: authedQuery
    .input(z.object({ topic: z.string().max(32).default("") }))
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(userNotes)
        .where(and(eq(userNotes.userId, ctx.user.id), eq(userNotes.topic, input.topic)))
        .limit(1);
      const r = rows.at(0);
      return { content: r?.content ?? "", updatedAt: r?.updatedAt.getTime() ?? 0 };
    }),

  /* 保存（自动保存由前端触发，按 user+topic 覆盖） */
  save: authedQuery
    .input(z.object({
      topic: z.string().max(32).default(""),
      content: z.string().max(200000),
    }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .insert(userNotes)
        .values({ userId: ctx.user.id, topic: input.topic, content: input.content })
        .onDuplicateKeyUpdate({ set: { content: input.content, updatedAt: new Date() } });
      return { ok: true };
    }),

  /* 笔记本目录：哪些板块已有内容 + 更新时间 */
  list: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select()
      .from(userNotes)
      .where(eq(userNotes.userId, ctx.user.id));
    return rows.map((r) => ({ topic: r.topic, updatedAt: r.updatedAt.getTime(), len: r.content.length }));
  }),

  /* 设置学习阶段（新用户问答环节 / 个人页可改） */
  setLevel: authedQuery
    .input(z.object({ level: z.enum(["AS", "A2"]) }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .update(users)
        .set({ level: input.level })
        .where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),
});
