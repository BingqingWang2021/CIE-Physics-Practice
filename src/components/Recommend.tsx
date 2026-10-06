import { useMemo, useState } from 'react'
import Tool from '../lib/tool.js'
import { TOPICS } from '../lib/topics.js'
import type { HistoryItem, WrongItem } from '../lib/types'
import { trpc } from '@/providers/trpc'

/* ── 推荐训练：按学习阶段 + 正确率 + 错题分布，推荐下一个该练的章节 ────── */
export function useRecommend(level: string | null | undefined, hist: HistoryItem[], wrongAll: WrongItem[]) {
  return useMemo(() => {
    const lv = level === 'A2' ? 'A2' : 'AS'
    const scope = TOPICS.filter(t => t.level === lv)
    const stat = new Map<string, { n: number; sum: number }>()
    for (const h of hist) {
      const t = TOPICS.find(x => x.cn === h.topic)
      if (!t || t.level !== lv) continue
      const s = stat.get(t.id) ?? { n: 0, sum: 0 }
      s.n++; s.sum += h.pct
      stat.set(t.id, s)
    }
    const wrongOf = (id: string) => wrongAll.filter(w => w.topic === id).length
    /* 自报薄弱（问答环节记录），优先推荐 */
    let weak: string[] = []
    try { weak = JSON.parse(localStorage.getItem('alphy-weak') ?? '[]') } catch { /* ignore */ }

    const practiced = scope
      .map(t => ({ t, n: stat.get(t.id)?.n ?? 0, avg: stat.get(t.id) ? Math.round(stat.get(t.id)!.sum / stat.get(t.id)!.n) : null, wrong: wrongOf(t.id) }))
      .filter(x => x.n > 0)
    const weakPracticed = practiced.filter(x => x.avg !== null && x.avg < 70)
      .sort((a, b) => (a.avg! - b.avg!) || (b.wrong - a.wrong))
    const unpracticed = scope.filter(t => !(stat.get(t.id)?.n))

    let pick = weakPracticed[0]
    let reason = ''
    if (pick) {
      reason = pick.wrong > 0
        ? `你最近在「${pick.t.cn}」正确率 ${pick.avg}%，错题本里还压着 ${pick.wrong} 道，先攻下它。`
        : `「${pick.t.cn}」目前正确率 ${pick.avg}%，低于 70% 达标线，建议再练一组。`
    } else {
      const w = weak.filter(id => scope.some(t => t.id === id))
      const first = w[0] ? scope.find(t => t.id === w[0])! : unpracticed[0]
      if (first) {
        pick = { t: first, n: 0, avg: null, wrong: wrongOf(first.id) }
        reason = weak.includes(first.id)
          ? `你在入门问答里提到「${first.cn}」比较薄弱，从这里开始针对性训练。`
          : `「${first.cn}」还没练过，按章节顺序从这里开始。`
      } else {
        const best: (typeof practiced)[number] | undefined = [...practiced].sort((a, b) => (a.avg ?? 100) - (b.avg ?? 100))[0]
        if (best) {
          pick = best
          reason = `全部章节都已练过，正确率最低的是「${best.t.cn}」（${best.avg}%），做一组巩固。`
        }
      }
    }
    return { topic: pick?.t ?? null, reason, level: lv, unpracticedCount: unpracticed.length }
  }, [level, hist, wrongAll])
}

export function RecommendCard({ rec, onTrain }: {
  rec: { topic: { id: string; cn: string; en: string } | null; reason: string }
  onTrain: (topicId: string) => void
}) {
  if (!rec.topic) return null
  return (
    <div className="reccard">
      <div className="rec-lbl">推荐训练</div>
      <div className="rec-main">
        <div>
          <div className="rec-topic">{rec.topic.cn}</div>
          <div className="rec-reason">{rec.reason}</div>
        </div>
        <button type="button" className="btn primary" onClick={() => { onTrain(rec.topic!.id); Tool.sound.tick() }}>
          开始训练
        </button>
      </div>
    </div>
  )
}

/* ── 新用户问答环节：匹配阶段与薄弱板块，用于针对性训练 ─────────────── */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [lv, setLv] = useState<'AS' | 'A2' | null>(null)
  const [weak, setWeak] = useState<string[]>([])
  const setLevelM = trpc.notes.setLevel.useMutation()

  const scope = TOPICS.filter(t => t.level === (lv ?? 'AS'))
  const toggleWeak = (id: string) => setWeak(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id])

  const finish = () => {
    if (lv) setLevelM.mutate({ level: lv })
    localStorage.setItem('alphy-weak', JSON.stringify(weak))
    Tool.sound.pop()
    onDone()
  }

  return (
    <div className="onb-scrim">
      <div className="onb-card">
        <div className="onb-step">新手匹配 · {step + 1} / 2</div>
        {step === 0 && (
          <>
            <h2>你现在处于哪个阶段？</h2>
            <p className="onb-sub">我们会据此只推荐对应阶段的章节与试卷。</p>
            <div className="onb-opts">
              <button type="button" className={lv === 'AS' ? 'on' : ''} onClick={() => setLv('AS')}>
                AS 阶段<span>第一年 · 考 P1 / P2 / P3</span>
              </button>
              <button type="button" className={lv === 'A2' ? 'on' : ''} onClick={() => setLv('A2')}>
                A2 阶段<span>第二年 · 考 P4 / P5</span>
              </button>
            </div>
            <div className="onb-btns">
              <button type="button" className="btn wide primary" disabled={!lv}
                      onClick={() => setStep(1)}>下一步</button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2>哪些章节你觉得比较薄弱？</h2>
            <p className="onb-sub">可多选也可以跳过——推荐训练会优先安排它们。之后可以在「练」页面随时改。</p>
            <div className="onb-chips">
              {scope.map(t => (
                <button key={t.id} type="button" className={'weakchip' + (weak.includes(t.id) ? ' on' : '')}
                        onClick={() => toggleWeak(t.id)}>{t.cn}</button>
              ))}
            </div>
            <div className="onb-btns">
              <button type="button" className="btn" onClick={() => setStep(0)}>上一步</button>
              <button type="button" className="btn wide primary" onClick={finish}>完成，开始训练</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
