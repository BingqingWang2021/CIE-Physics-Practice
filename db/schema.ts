import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  /* 用户名密码登录：username 全局唯一；Kimi 登录的用户这两项为 NULL。
     本地账号的 unionId 约定为 "local:<username>"。 */
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /* 学习阶段：AS / A2（新用户问答环节设置），用于练模块的章节推荐 */
  level: varchar("level", { length: 8 }),
  /* 管理员分组与备注名 */
  grp: varchar("grp", { length: 64 }),
  alias: varchar("alias", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ── A-Level 物理刷题：按学生保存进度 ─────────────────────────────── */

/* 错题本：每行一道错题，payload 是题目完整 JSON（WrongItem）。
   skey 是题干的 sha256，用于去重与「做对后移除」。 */
export const wrongItems = mysqlTable(
  "wrong_items",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    skey: varchar("skey", { length: 64 }).notNull(),
    payload: text("payload").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("wrong_user_skey").on(t.userId, t.skey)],
);
export type WrongItemRow = typeof wrongItems.$inferSelect;

/* 练习场次：每次「结束练习」写一行摘要。 */
export const practiceSessions = mysqlTable("practice_sessions", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  topic: varchar("topic", { length: 128 }).notNull(),
  mode: varchar("mode", { length: 8 }).notNull(),
  pct: int("pct").notNull(),
  got: int("got").notNull(),
  maxScore: int("maxScore").notNull(),
  rightCount: int("rightCount").notNull(),
  total: int("total").notNull(),
  spentSec: int("spentSec").notNull(),
  kp: text("kp"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PracticeSession = typeof practiceSessions.$inferSelect;

/* 单词本：学生划词收藏的物理词汇。word 为小写原形，meaning 为物理场景释义，
   topic 记录来源板块（便于回链复习），context 记录出自哪道题的题干片段。 */
export const vocabWords = mysqlTable(
  "vocab_words",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    word: varchar("word", { length: 128 }).notNull(),
    meaning: text("meaning").notNull(),
    topic: varchar("topic", { length: 128 }),
    context: varchar("context", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("vocab_user_word").on(t.userId, t.word)],
);
export type VocabWordRow = typeof vocabWords.$inferSelect;

/* 在线笔记本：每位学生每个板块一页笔记（topic='' 为通用笔记），自动保存。 */
export const userNotes = mysqlTable(
  "user_notes",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    topic: varchar("topic", { length: 32 }).notNull().default(""),
    content: text("content").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("notes_user_topic").on(t.userId, t.topic)],
);
export type UserNoteRow = typeof userNotes.$inferSelect;
