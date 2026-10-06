import { authRouter } from "./auth-router";
import { localAuthRouter } from "./local-auth-router";
import { progressRouter } from "./progress-router";
import { adminRouter } from "./admin-router";
import { vocabRouter } from "./vocab-router";
import { notesRouter } from "./notes-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  localAuth: localAuthRouter,
  progress: progressRouter,
  admin: adminRouter,
  vocab: vocabRouter,
  notes: notesRouter,
});

export type AppRouter = typeof appRouter;
