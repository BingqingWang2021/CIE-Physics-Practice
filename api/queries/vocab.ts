import { getDb } from "./connection";
import { vocabWords } from "@db/schema";
import { eq, and, desc } from "drizzle-orm";

/* 单词本：每位学生独立收藏物理词汇，换设备不丢。 */

export async function listVocab(userId: number) {
  const rows = await getDb()
    .select()
    .from(vocabWords)
    .where(eq(vocabWords.userId, userId))
    .orderBy(desc(vocabWords.createdAt))
    .limit(500);
  return rows.map((r) => ({
    word: r.word,
    meaning: r.meaning,
    topic: r.topic ?? "",
    context: r.context ?? "",
    at: r.createdAt.getTime(),
  }));
}

export async function addWord(
  userId: number,
  w: { word: string; meaning: string; topic: string; context: string },
) {
  await getDb()
    .insert(vocabWords)
    .values({
      userId,
      word: w.word,
      meaning: w.meaning,
      topic: w.topic || null,
      context: w.context || null,
    })
    .onDuplicateKeyUpdate({
      set: { meaning: w.meaning, topic: w.topic || null, context: w.context || null, createdAt: new Date() },
    });
}

export async function removeWord(userId: number, word: string) {
  await getDb()
    .delete(vocabWords)
    .where(and(eq(vocabWords.userId, userId), eq(vocabWords.word, word)));
}

export async function clearVocab(userId: number) {
  await getDb().delete(vocabWords).where(eq(vocabWords.userId, userId));
}
