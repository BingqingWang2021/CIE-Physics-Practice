import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  listWrong, addWrong, removeWrong, clearWrong, listSessions, addSession,
} from "./queries/progress";

/* 学生进度：错题本与练习历史都绑定到登录用户，换设备不丢。 */
export const progressRouter = createRouter({
  state: authedQuery.query(async ({ ctx }) => ({
    wrong: await listWrong(ctx.user.id),
    hist: await listSessions(ctx.user.id),
  })),

  addWrong: authedQuery
    .input(z.object({ payload: z.string().max(20000) }))
    .mutation(({ ctx, input }) => addWrong(ctx.user.id, input.payload)),

  removeWrong: authedQuery
    .input(z.object({ s: z.string().min(1) }))
    .mutation(({ ctx, input }) => removeWrong(ctx.user.id, input.s)),

  clearWrong: authedQuery.mutation(({ ctx }) => clearWrong(ctx.user.id)),

  addSession: authedQuery
    .input(z.object({
      topic: z.string().min(1).max(128),
      mode: z.enum(["mcq", "sq"]),
      pct: z.number().int().min(0).max(100),
      got: z.number().int().min(0),
      maxScore: z.number().int().min(0),
      rightCount: z.number().int().min(0),
      total: z.number().int().min(0),
      spentSec: z.number().int().min(0),
      kp: z.string().max(4000),
    }))
    .mutation(({ ctx, input }) => addSession(ctx.user.id, input)),
});
