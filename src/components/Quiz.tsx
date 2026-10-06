import Tool from '../lib/tool.js'
import { BANK, LETTERS, answerText } from '../lib/banks.js'
import { ZhTools } from './Vocab'
import type { LogItem, McqQ, Mode, Report, SqQ, WrongItem } from '../lib/types'

export type Ans = number | string | null

/* 一键翻译需要的定位信息：板块 + 题库下标 + 板块中文名 */
export interface ZhLoc { topic: string; qi: number; topicName: string }

/* 错题本里的题按题干回找题库下标（题库题干不变，可稳定匹配） */
function bankIdx(topic: string, kind: Mode, s: string): number {
  const b = (BANK as Record<string, { mcq: McqQ[]; sq: SqQ[] }>)[topic]
  const arr = b ? (kind === 'mcq' ? b.mcq : b.sq) : []
  return arr.findIndex(q => q.s === s)
}

/* ── 答题卡格子 ─────────────────────────────────────────────────────────── */
export function Strip({ qs, done, idx, onPick }: {
  qs: unknown[]; done: (boolean | null)[]; idx: number; onPick: (i: number) => void
}) {
  return (
    <>
      {qs.map((_, i) => (
        <button key={i} type="button" onClick={() => onPick(i)}
          className={'bub' + (done[i] != null ? ' done' : '') + (i === idx ? ' now' : '')
            + (done[i] === false ? ' wrong' : '')}
          data-e2e={i === idx ? 'noop' : undefined}>{i + 1}</button>
      ))}
    </>
  )
}

/* ── 选择题 ─────────────────────────────────────────────────────────────── */
function McqMark({ q, ok }: { q: McqQ; ok: boolean }) {
  return (
    <div className={'mark' + (ok ? '' : ' bad')}>
      <div className="verdict"
           dangerouslySetInnerHTML={{
             __html: (ok ? Tool.ICON.check : Tool.ICON.x)
               + '<span>' + (ok ? '答对了' : '答错了') + '</span>',
           }} />
      <div className="ans">{'正确答案：' + answerText(q)}</div>
      {q.e ? <div className="why">{q.e}</div> : null}
      <div className="kpline">{q.kp.map(k => <span className="kpchip" key={k}>{k}</span>)}</div>
    </div>
  )
}

export function McqView({ q, idx, answer, locked, ok, onAnswer, zh }: {
  q: McqQ; idx: number; answer: Ans; locked: boolean; ok: boolean | null
  onAnswer: (a: number) => void; zh: ZhLoc
}) {
  return (
    <>
      <div className="qhead">
        <span className="qno">{String(idx + 1).padStart(2, '0')}</span>
        <span className="qkind">选择题</span>
        <span className="qchap">1 分</span>
      </div>
      <ZhTools key={idx} className="stem" topic={zh.topic} kind="mcq" qi={zh.qi}
               stem={q.s} options={q.o} topicName={zh.topicName} />
      {q.img ? <img className="qimg" src={q.img} alt="题目图片" /> : null}
      <div className="opts">
        {q.o.map((text, i) => {
          const picked = answer === i
          let cls = 'opt' + (picked ? ' pick' : '')
          if (locked) {
            cls += ' locked'
            if (i === q.a) cls += ' right'
            else if (picked) cls += ' miss'
          }
          return (
            <button key={i} className={cls} type="button" onClick={() => {
              if (locked) return
              onAnswer(i)
              Tool.sound.tick(); Tool.haptic(6)
            }}>
              <span className="k">{LETTERS[i]}</span>
              <span>{text}</span>
            </button>
          )
        })}
      </div>
      {ok != null && <McqMark q={q} ok={ok} />}
    </>
  )
}

/* ── 结构化大题 ─────────────────────────────────────────────────────────── */
export interface SqGrade { got: number; max: number; hits: { m: number; ok: boolean; hint: string }[] }

function SqMark({ q, g }: { q: SqQ; g: SqGrade }) {
  const full = g.got === g.max
  return (
    <div className={'mark' + (full ? '' : ' bad')}>
      <div className="verdict"
           dangerouslySetInnerHTML={{
             __html: (full ? Tool.ICON.check : Tool.ICON.x)
               + '<span>' + (full ? '自评：做对了，满分' : '自评：做错了，已收入错题本') + '</span>',
           }} />
      <div className="ans">{'得分：' + g.got + ' / ' + g.max + ' 分'}</div>
      {!full && q.tip ? <div className="why"><b>解题技巧：</b>{q.tip}</div> : null}
      <div className="kpline">{q.kp.map(k => <span className="kpchip" key={k}>{k}</span>)}</div>
    </div>
  )
}

/* 纸笔作答模式：网站只出题，学生在纸上写，对照答案后自评对错 */
export function SqView({ q, revealed, grade, onReveal, onMark, zh }: {
  q: SqQ; revealed: boolean; grade: SqGrade | null
  onReveal: () => void; onMark: (ok: boolean) => void; zh: ZhLoc
}) {
  const total = q.points.reduce((s, p) => s + p.m, 0)
  return (
    <>
      <div className="qhead">
        <span className="qkind">结构化大题</span>
        <span className="qchap">{q.marks + ' 分'}</span>
      </div>
      <ZhTools className="stem sqstem" topic={zh.topic} kind="sq" qi={zh.qi}
               stem={q.s} topicName={zh.topicName} />
      <div className="paperwork">✎ 请在练习册或草稿纸上作答，写完后点击下方按钮对照答案。</div>
      {!revealed && (
        <div className="opts">
          <button className="btn primary" id="reveal" type="button" onClick={onReveal}>
            我已完成作答 · 显示答案
          </button>
        </div>
      )}
      {revealed && (
        <div className="mark">
          <div className="ans">{'评分标准 · 共 ' + (total || q.marks) + ' 个得分点'}</div>
          <div className="pts">
            {q.points.map((p, i) => (
              <div className="ptrow ok" key={i}>
                <span className="ptm">{p.m + ' 分'}</span>
                <span className="ptt">{p.hint}</span>
              </div>
            ))}
          </div>
          <div className="ans" style={{ marginTop: 10 }}>参考作答</div>
          <div className="why">{q.model}</div>
          {q.tip ? <div className="why"><b>解题技巧：</b>{q.tip}</div> : null}
          <div className="kpline">{q.kp.map(k => <span className="kpchip" key={k}>{k}</span>)}</div>
          {grade == null && (
            <div className="selfmark">
              <div className="sm-q">对照答案，你这道题做对了吗？</div>
              <div className="sm-btns">
                <button className="btn primary" id="mark-right" type="button" onClick={() => onMark(true)}>✓ 做对了</button>
                <button className="btn danger" id="mark-wrong" type="button" onClick={() => onMark(false)}>✗ 做错了</button>
              </div>
              <div className="sm-note">做错了会自动收入错题本，方便之后重练。</div>
            </div>
          )}
        </div>
      )}
      {grade && <SqMark q={q} g={grade} />}
    </>
  )
}

/* ── 组间小结 ───────────────────────────────────────────────────────────── */
export function RoundDone({ right, total, mode }: { right: number; total: number; mode: string }) {
  return (
    <div className="rounddone">
      <div className="rd-score">{right + ' / ' + total + (mode === 'sq' ? ' 分' : '')}</div>
      <div className="rd-line">{mode === 'mcq'
        ? '本组 5 题完成。继续可以保持手感，结束可以生成练习报告。'
        : '本题已完成。继续下一题，或结束并生成练习报告。'}</div>
    </div>
  )
}

/* ── 练习报告 ───────────────────────────────────────────────────────────── */
export function ReportBody({ r }: { r: Report }) {
  const wrong = r.log.filter(l => !l.ok)
  /* 错误重点：把答错题目的知识点按出现次数聚合，谁出现得多谁先补。 */
  const weakMap: Record<string, number> = {}
  wrong.forEach(l => l.kp.forEach(k => weakMap[k] = (weakMap[k] || 0) + 1))
  const weak = Object.entries(weakMap).sort((a, b) => b[1] - a[1])
  const kpAll: string[] = []
  r.log.forEach(l => l.kp.forEach(k => { if (!kpAll.includes(k)) kpAll.push(k) }))
  const verdict = r.pct >= 90 ? '掌握得很好，可以换下一个板块了。'
    : r.pct >= 70 ? '整体不错，把下面的错误重点再过一遍。'
    : r.pct >= 40 ? '基础在成形，薄弱知识点需要回看课本再练。'
    : '这个板块还比较吃力，建议先复习知识点总结，再来一组。'
  return (
    <>
      <div className="report">
        <div className="score">{r.pct}<small>%</small></div>
        <div className="verdict-line paper">{verdict}</div>
      </div>
      <div className="tally">
        <div><div className="n">{r.got + '/' + r.max}</div><div className="l">得分</div></div>
        <div><div className="n">{r.right + '/' + r.total}</div><div className="l">满分的题</div></div>
        <div><div className="n">{Tool.mmss(r.spent)}</div><div className="l">用时</div></div>
      </div>

      {weak.length > 0 && (
        <>
          <div className="seclbl">错误重点 · 按出现频率</div>
          <div className="weaklist">
            {weak.map(([k, n]) => (
              <span className="weakchip" key={k}>{k}<b>×{n}</b></span>
            ))}
          </div>
        </>
      )}

      <div className="seclbl">本次练习涉及的知识点</div>
      <div className="weaklist">
        {kpAll.map(k => <span className="kpchip lg" key={k}>{k}</span>)}
      </div>

      {wrong.length > 0 && (
        <>
          <div className="seclbl">{'错题回顾 · ' + wrong.length + ' 题'}</div>
          {wrong.map((l, i) => (
            <div className="wrongitem" key={i}>
              <div className="q">{l.s}</div>
              <div className="meta">
                <span>{l.kind === 'mcq' ? '选择题' : '大题'}</span>
                <span>{'得分 ' + l.got + '/' + l.max}</span>
                {l.kind === 'mcq' && l.your ? <span>{'你选了 ' + l.your}</span> : null}
              </div>
              <div className="why" style={{ marginTop: 6 }}>{l.kind === 'sq' ? '参考作答：' + l.e : l.e}</div>
              {l.tip ? <div className="why"><b>解题技巧：</b>{l.tip}</div> : null}
            </div>
          ))}
        </>
      )}
      <div style={{ height: 18 }} />
    </>
  )
}

/* ── 错题本 ─────────────────────────────────────────────────────────────── */
/* 真题模考的题不属于 25 章，给个人情化的板块名 */
const PAPER_TOPICS: Record<string, string> = { p1: 'P1 真题', p2paper: 'P2 真题', p4paper: 'P4 真题' }

export function WrongBook({ all, topicName }: { all: WrongItem[]; topicName: (id: string) => string }) {
  const nameOf = (id: string) => PAPER_TOPICS[id] ?? topicName(id)
  return (
    <>
      <div className="seclbl">{'错题本 · ' + all.length + ' 题'}</div>
      {!all.length && (
        <div className="empty" dangerouslySetInnerHTML={{
          __html: Tool.ICON.check + '<div>还没有错题。<br>开始一组练习，答错的题会自动收进来。</div>',
        }} />
      )}
      {all.map((w, i) => (
        <div className="wrongitem" key={i}>
          {w.img ? <img className="qimg" src={w.img} alt="题目图片" /> : null}
          <ZhTools className="q" topic={w.topic} kind={w.kind}
                   qi={bankIdx(w.topic, w.kind, w.s)}
                   stem={w.s} options={w.kind === 'mcq' ? w.o : undefined}
                   topicName={nameOf(w.topic)} />
          <div className="meta">
            <span>{nameOf(w.topic)}</span>
            <span>{w.kind === 'mcq' ? '选择题' : '大题'}</span>
            <span>{'得分 ' + w.got + '/' + w.max}</span>
          </div>
          <div className="why" style={{ marginTop: 6 }}>{w.kind === 'sq' ? '参考作答：' + w.e : w.e}</div>
          {w.tip ? <div className="why"><b>解题技巧：</b>{w.tip}</div> : null}
          <div className="kpline">{w.kp.map(k => <span className="kpchip" key={k}>{k}</span>)}</div>
        </div>
      ))}
    </>
  )
}
