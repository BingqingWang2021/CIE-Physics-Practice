import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { listVocab, addWord, removeWord, clearVocab } from "./queries/vocab";

/* 单词本：划词收藏的物理词汇，绑定登录用户。 */
export const vocabRouter = createRouter({
  list: authedQuery.query(({ ctx }) => listVocab(ctx.user.id)),

  add: authedQuery
    .input(
      z.object({
        word: z.string().min(1).max(128),
        meaning: z.string().min(1).max(2000),
        topic: z.string().max(128).default(""),
        context: z.string().max(255).default(""),
      }),
    )
    .mutation(({ ctx, input }) => addWord(ctx.user.id, input)),

  remove: authedQuery
    .input(z.object({ word: z.string().min(1).max(128) }))
    .mutation(({ ctx, input }) => removeWord(ctx.user.id, input.word)),

  clear: authedQuery.mutation(({ ctx }) => clearVocab(ctx.user.id)),
});
