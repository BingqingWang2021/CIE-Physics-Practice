import { useEffect, useRef, useState } from 'react'
import Kit from './lib/kit.js'
import Tool from './lib/tool.js'
import { BANK, LETTERS, draw, isRight } from './lib/banks.js'
import { TOPICS, topicById } from './lib/topics.js'
import { buildMarkdown } from './lib/report.js'
import { McqView, ReportBody, RoundDone, SqView, Strip, WrongBook, type Ans, type SqGrade } from './components/Quiz'
import { AdminPanel } from './components/Admin'
import { VocabBook, trUsed } from './components/Vocab'
import { StudyHome, StudyTopic } from './components/Study'
import { ExamHome, P1Runner, PpRunner, type ExamTarget } from './components/Exam'
import { Onboarding, RecommendCard, useRecommend } from './components/Recommend'
import type { Item, LogItem, Mode, Report, WrongItem, HistoryItem } from './lib/types'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/hooks/useAuth'
import Login from '@/pages/Login'

/* 旧版本地缓存：仅用于首次登录时把历史数据迁移进账号，之后以云端为准。 */
const wrongStore = Tool.store('alphy-wrong', [] as WrongItem[])
const histStore = Tool.store('alphy-hist', [] as HistoryItem[])

const BACK = <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>

const TTL: Record<string, string> = {
  home: '菁仕·格物研习社', practice: '练 · 章节训练', study: '学 · 课程内容', studytopic: '章节学习',
  exam: '考 · 真题模考', p1run: 'P1 模考', p2run: '结构化模考',
  result: '练习报告', wrong: '错题本', vocab: '单词本', admin: '管理后台',
}
const SUB: Record<string, string> = {
  home: 'CIE 9702 · 学 · 练 · 考', practice: 'PRACTICE', study: 'LEARN', studytopic: 'CHAPTER',
  exam: 'EXAM', p1run: 'PAPER 1', p2run: 'STRUCTURED', result: 'REPORT', wrong: 'MISTAKES', vocab: 'VOCABULARY', admin: 'STUDENTS',
}

interface Session { src: 'topic' | 'wrong'; topicId: string; qmode: Mode }

export default function App() {
  /* ── 账号：登录后每位学生有独立的错题本与成绩记录 ── */
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth()
  const stateQ = trpc.progress.state.useQuery(undefined, { enabled: isAuthenticated, retry: false })
  const utils = trpc.useUtils()
  const addWrongM = trpc.progress.addWrong.useMutation()
  const removeWrongM = trpc.progress.removeWrong.useMutation()
  const clearWrongM = trpc.progress.clearWrong.useMutation()
  const addSessionM = trpc.progress.addSession.useMutation()

  const [topicId, setTopicId] = useState<string | null>(null)
  const [qmode, setQmode] = useState<Mode>('mcq')
  const [screen, setScreen] = useState('home')

  /* 一轮答题：选择题一轮 5 道，大题一轮 1 道。log 跨轮累计整场练习。 */
  const [session, setSession] = useState<Session | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Ans[]>([])
  const [graded, setGraded] = useState<(boolean | null)[]>([])
  const [grades, setGrades] = useState<(SqGrade | null)[]>([])
  /* 结构题：是否已「显示答案」（学生在纸上写完后才点开） */
  const [revealed, setRevealed] = useState<boolean[]>([])
  const [log, setLog] = useState<LogItem[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [wrongAll, setWrongAll] = useState<WrongItem[]>([])
  const [hist, setHist] = useState<HistoryItem[]>([])
  const [ready, setReady] = useState(false)
  const [quizOn, setQuizOn] = useState(false)
  /* 单词本入口：学生用过「一键翻译」之后才显示（本机标记 + 云端正有词） */
  const [trOn, setTrOn] = useState(trUsed())
  const vocabQ = trpc.vocab.list.useQuery(undefined, { enabled: isAuthenticated, retry: false })
  useEffect(() => {
    const on = () => setTrOn(true)
    addEventListener('alphy:tr-used', on)
    return () => removeEventListener('alphy:tr-used', on)
  }, [])
  const showVocab = trOn || (vocabQ.data?.length ?? 0) > 0

  /* ── 三模块导航参数 ── */
  const [studyTopic, setStudyTopic] = useState('pqu')
  const [examTarget, setExamTarget] = useState<ExamTarget | null>(null)
  const [onbDone, setOnbDone] = useState(false)
  /* 推荐训练（依赖练习历史 + 错题 + 阶段） */
  const rec = useRecommend(user?.level, hist, wrongAll)

  const screens = useRef<HTMLDivElement>(null)
  const acts = useRef<HTMLSpanElement>(null)
  const clockEl = useRef<HTMLSpanElement>(null)
  const clock = useRef<{ stop: () => number } | null>(null)
  const nav = useRef<{ go: (id: string, o?: { replace?: boolean }) => void; back: () => void } | null>(null)
  /* 每个板块+题型记住本次刷过哪些题，优先出没见过的 */
  const usedRef = useRef(new Map<string, Set<number>>())
  const usedOf = (t: string, m: Mode) => {
    const k = t + ':' + m
    if (!usedRef.current.has(k)) usedRef.current.set(k, new Set())
    return usedRef.current.get(k)!
  }

  useEffect(() => {
    if (!screens.current) return
    nav.current = Tool.screens(screens.current)
    const onScreen = (e: Event) => setScreen((e as CustomEvent).detail)
    addEventListener('tool:screen', onScreen)
    return () => removeEventListener('tool:screen', onScreen)
  }, [ready, isAuthenticated])
  useEffect(() => { Kit.reveal() }, [])

  /* 首次拿到云端进度后初始化本地状态；若云端为空而本地有旧数据，自动迁移进账号。 */
  const migrated = useRef(false)
  useEffect(() => {
    if (!stateQ.data || migrated.current) return
    migrated.current = true
    const localWrong = wrongStore.get()
    const localHist = histStore.get()
    if (stateQ.data.wrong.length === 0 && localWrong.length) {
      localWrong.forEach((w: WrongItem) => addWrongM.mutate({ payload: JSON.stringify(w) }))
      setWrongAll(localWrong)
      Kit.toast('已把本机错题迁移到你的账号')
    } else setWrongAll(stateQ.data.wrong as WrongItem[])
    if (stateQ.data.hist.length === 0 && localHist.length) {
      localHist.forEach((h: HistoryItem) => addSessionM.mutate({
        topic: h.topic, mode: h.mode, pct: h.pct, got: 0, maxScore: 0,
        rightCount: h.right, total: h.total, spentSec: 0, kp: '[]',
      }))
      setHist(localHist)
    } else setHist(stateQ.data.hist as HistoryItem[])
    wrongStore.set([]); histStore.set([])
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateQ.data])

  const topic = topicId ? topicById(topicId) : null
  const quizTitle = session
    ? (session.src === 'wrong' ? '错题重练' : (topicById(session.topicId)?.cn ?? ''))
    : ''

  /* ── 出题 ─────────────────────────────────────────────────────────────── */
  const startSession = (s: Session) => {
    setSession(s); setLog([]); setReport(null)
    clock.current?.stop()
    clock.current = Tool.timer(clockEl.current, { mode: 'up' })
    setQuizOn(true)
    nextRoundFor(s)
  }

  const nextRoundFor = (s: Session) => {
    let list: Item[]
    if (s.src === 'wrong') {
      list = wrongAll.map((w: WrongItem) => {
        const b = BANK[w.topic]
        const arr = b ? (w.kind === 'mcq' ? b.mcq : b.sq) : []
        return {
          kind: w.kind, topic: w.topic,
          qi: arr.findIndex((q: { s: string }) => q.s === w.s),
          q: w.kind === 'mcq'
            ? { s: w.s, o: w.o!, a: w.a!, e: w.e, kp: w.kp, img: w.img }
            : { s: w.s, marks: w.max, points: w.points!, model: w.model!, kp: w.kp, tip: w.tip },
        }
      })
    } else {
      const b = BANK[s.topicId]
      if (s.qmode === 'mcq') {
        const idxs = draw(b.mcq, Math.min(5, b.mcq.length), usedOf(s.topicId, 'mcq'))
        list = idxs.map(i => ({ kind: 'mcq' as const, topic: s.topicId, q: b.mcq[i], qi: i }))
      } else {
        const idxs = draw(b.sq, 1, usedOf(s.topicId, 'sq'))
        list = idxs.map(i => ({ kind: 'sq' as const, topic: s.topicId, q: b.sq[i], qi: i }))
      }
    }
    setItems(list); setIdx(0)
    setAnswers(list.map(() => null)); setGraded(list.map(() => null)); setGrades(list.map(() => null))
    setRevealed(list.map(() => false))
    if (screen !== 'quiz') nav.current?.go('quiz')
  }

  const nextRound = () => session && nextRoundFor(session)

  /* ── 判分 ─────────────────────────────────────────────────────────────── */
  const pushLog = (entry: LogItem, raw: { o?: string[]; a?: number; points?: unknown; model?: string }) => {
    setLog(l => [...l, entry])
    if (!entry.ok) {
      if (!wrongAll.some((w: WrongItem) => w.s === entry.s)) {
        const w = { ...entry, ...raw, at: Date.now() } as WrongItem
        setWrongAll(v => [w, ...v].slice(0, 200))
        addWrongM.mutate({ payload: JSON.stringify(w) })
      }
    } else if (session?.src === 'wrong') {
      /* 错题重练做对 → 从错题本移除，本子只留「还不会的」。 */
      setWrongAll(v => v.filter((w: WrongItem) => w.s !== entry.s))
      removeWrongM.mutate({ s: entry.s })
    }
  }

  const pickMcq = (a: number) => {
    if (graded[idx] != null) return
    setAnswers(v => v.map((x, i) => i === idx ? a : x))
    setTimeout(() => {
      const it = items[idx]
      const q = it.q as { s: string; o: string[]; a: number; e: string; kp: string[]; img?: string }
      const ok = isRight(q, a)
      ok ? Tool.sound.pop() : Tool.sound.err()
      pushLog({ kind: 'mcq', topic: it.topic, s: q.s, ok, got: ok ? 1 : 0, max: 1, your: LETTERS[a], e: q.e, kp: q.kp, img: q.img }, { o: q.o, a: q.a })
      setGraded(g => g.map((v, i) => i === idx ? ok : v))
    }, 180)
  }

  /* 结构题新流程：纸上作答 → 显示答案 → 学生自评对错（做错自动进错题本） */
  const revealSq = () => {
    setRevealed(v => v.map((x, i) => i === idx ? true : x))
    Tool.sound.tick()
  }

  const markSq = (ok: boolean) => {
    if (grades[idx] != null) return
    const it = items[idx]
    const q = it.q as { s: string; marks: number; points: { m: number; hint: string }[]; model: string; kp: string[]; tip?: string }
    const g: SqGrade = {
      got: ok ? q.marks : 0, max: q.marks,
      hits: q.points.map(p => ({ m: p.m, ok, hint: p.hint })),
    }
    ok ? Tool.sound.pop() : Tool.sound.err()
    pushLog(
      { kind: 'sq', topic: it.topic, s: q.s, ok, got: g.got, max: g.max, your: ok ? '自评：做对' : '自评：做错', e: q.model, kp: q.kp, tip: q.tip },
      { points: q.points, model: q.model },
    )
    setGrades(gs => gs.map((v, i) => i === idx ? g : v))
    setGraded(gs => gs.map((v, i) => i === idx ? ok : v))
  }

  /* ── 结束练习 → 报告 ──────────────────────────────────────────────────── */
  const finish = () => {
    if (!log.length) { Kit.toast('先做一道题再结束练习'); Tool.sound.err(); return }
    const spent = clock.current ? clock.current.stop() : 0
    const got = log.reduce((s, l) => s + l.got, 0)
    const max = log.reduce((s, l) => s + l.max, 0)
    const right = log.filter(l => l.ok).length
    const pct = Math.round(100 * got / Math.max(1, max))
    const r: Report = { pct, got, max, right, total: log.length, spent, log, topic: quizTitle, mode: session?.qmode ?? 'mcq' }
    setReport(r)
    const h = [...hist, { at: Date.now(), topic: quizTitle, mode: r.mode, pct, right, total: log.length }]
    setHist(h)
    const kp = [...new Set(log.flatMap(l => l.kp))]
    addSessionM.mutate({
      topic: quizTitle || '错题重练', mode: r.mode, pct, got, maxScore: max,
      rightCount: right, total: log.length, spentSec: Math.round(spent), kp: JSON.stringify(kp),
    })
    setQuizOn(false); setSession(null)
    nav.current?.go('result', { replace: true })
    if (pct >= 80) { Tool.sound.win(); Tool.confetti({ n: 120 }) } else Tool.sound.ding()
  }

  const abandon = () => {
    clock.current?.stop()
    setQuizOn(false); setSession(null); setLog([])
    nav.current?.back()
  }

  /* ── 导出条（海报 / 声音 / 明暗） ─────────────────────────────────────── */
  const live = useRef({ report, quizTitle })
  live.current = { report, quizTitle }
  useEffect(() => {
    const host = acts.current
    if (!host) return
    Tool.exportBar(host, {
      name: 'alevel-physics-report',
      link: null,
      poster: () => {
        const { report: r, quizTitle: t } = live.current
        return Tool.poster({
          brand: '菁仕·格物研习社 · A-Level 物理',
          title: r ? t : '还没有成绩',
          subtitle: r ? new Date().toLocaleDateString('zh-CN') + ' · ' + (r.mode === 'mcq' ? '选择题' : '结构化大题') + ' · CIE 9702' : '先完成一组练习',
          hero: r ? { value: String(r.pct), unit: '%', caption: '得分 ' + r.got + ' / ' + r.max } : null,
          bars: r ? r.log.slice(0, 8).map((l, i) => ({
            label: '第 ' + (i + 1) + ' 题', value: Math.round(l.got / l.max * 100), max: 100, text: l.got + '/' + l.max,
          })) : [],
          rows: r ? [['用时', Tool.mmss(r.spent)], ['满分题数', r.right + ' / ' + r.total]] : [],
          note: r && r.pct < 100 ? '错题已收入错题本，可随时重做。' : '',
          footer: "KING'S ACADEMY · GEWU PHYSICS",
        })
      },
    })
    const mute = Tool.el('button', { class: 'ib', title: '声音', html: Tool.ICON.sound })
    mute.onclick = () => { const m = Tool.sound.toggle(); mute.innerHTML = m ? Tool.ICON.mute : Tool.ICON.sound }
    if (Tool.sound.muted) mute.innerHTML = Tool.ICON.mute
    host.appendChild(mute)
    Kit.themeToggle(null, host)
    return () => { host.innerHTML = '' }
  }, [])

  const roundDone = items.length > 0 && graded.every(g => g != null)
  const nDone = graded.filter(g => g != null).length
  /* 组间小结：选择题显示「对几题」，大题显示「拿了几分」。 */
  const roundLog = log.slice(-items.length)
  const roundRight = session?.qmode === 'sq'
    ? roundLog.reduce((s, l) => s + l.got, 0)
    : roundLog.filter(l => l.ok).length
  const roundTotal = session?.qmode === 'sq'
    ? roundLog.reduce((s, l) => s + l.max, 0)
    : items.length

  /* 累计统计 */
  const totalQ = hist.reduce((s, h) => s + h.total, 0)
  const totalR = hist.reduce((s, h) => s + h.right, 0)
  const avgPct = hist.length ? Math.round(hist.reduce((s, h) => s + h.pct, 0) / hist.length) : 0

  /* ── 登录门：未登录只显示登录页；登录后等云端进度就绪再进入 ─────────────── */
  if (authLoading) {
    return <div className="stage"><div className="login-splash">正在检查登录状态…</div></div>
  }
  if (!isAuthenticated) {
    return <div className="stage"><Login /></div>
  }
  if (!ready) {
    return <div className="stage"><div className="login-splash">正在载入你的练习进度…</div></div>
  }
  /* 新用户问答环节：从未设置阶段且还没有任何练习记录时弹出 */
  const showOnb = !!user && user.role !== 'admin' && !user.level && hist.length === 0 && !onbDone

  return (
    <div className="stage">

      <div className="topbar">
        <button className="ib" id="back" title="返回" hidden={screen === 'home'}
                onClick={() => screen === 'quiz' ? abandon() : nav.current?.back()}>{BACK}</button>
        <img src="/logo-blue.svg" alt="菁仕" className="topbar-logo" />
        <div>
          <div className="title" id="ttl">{screen === 'quiz' ? quizTitle : (TTL[screen] || '菁仕·格物研习社')}</div>
          <div className="sub" id="sub">{screen === 'quiz'
            ? (session?.src === 'wrong'
                ? '错题重练 · 做对自动移除'
                : session?.qmode === 'mcq' ? '选择题 · 每组 5 道' : '结构化大题 · 纸上作答后自评')
            : (SUB[screen] ?? '')}</div>
        </div>
        <span className="spacer" />
        <span className="timer" id="clock" hidden={!quizOn} ref={clockEl}>00:00</span>
        <span className="acts" id="acts" ref={acts} />
        {user?.role === 'admin' && screen !== 'admin' && screen !== 'quiz' && (
          <button className="admin-entry" onClick={() => nav.current?.go('admin')}>管理后台</button>
        )}
        <span className="user-chip" title="当前账号">
          <span className="user-name">{user?.name || '同学'}</span>
          <button className="logout-btn" onClick={() => logout()}>退出</button>
        </span>
      </div>

      <div className="screens" id="screens" ref={screens}>

        {/* ── 首页：三模块枢纽 ─────────────────────────────────────────── */}
        <section className="screen" data-screen="home">
          <div className="scroll home">
            <div className="homehero">
              <h1 className="paper">菁仕·格物研习社</h1>
              <p>CIE 9702 A-Level 物理 · 学、练、考一体。<b>学</b>——25 章课件、中英笔记、思维导图与在线笔记本；
                 <b>练</b>——按知识板块刷题，智能推荐下一个该练的章节；<b>考</b>——P1 / P2 / P4 历年真题线上模考，
                 错题自动入库。格物致知，循序渐进。</p>
            </div>

            {hist.length > 0 && (
              <div className="tally" style={{ marginTop: 0 }}>
                <div><div className="n">{totalQ}</div><div className="l">累计练题</div></div>
                <div><div className="n">{avgPct + '%'}</div><div className="l">平均正确率</div></div>
                <div><div className="n">{wrongAll.length}</div><div className="l">错题待清</div></div>
              </div>
            )}

            <div className="seclbl">三大模块</div>
            <div className="modgrid">
              <button type="button" className="modcard mod-study" onClick={() => { nav.current?.go('study'); Tool.sound.tick() }}>
                <span className="mod-glyph">学</span>
                <span className="mod-name">课程内容</span>
                <span className="mod-desc">课件 · 中英笔记 · 思维导图 · 我的笔记本</span>
              </button>
              <button type="button" className="modcard mod-practice" onClick={() => { nav.current?.go('practice'); Tool.sound.tick() }}>
                <span className="mod-glyph">练</span>
                <span className="mod-name">章节训练</span>
                <span className="mod-desc">智能推荐 · 选择/大题 · 错题本 · 单词本</span>
              </button>
              <button type="button" className="modcard mod-exam" onClick={() => { nav.current?.go('exam'); Tool.sound.tick() }}>
                <span className="mod-glyph">考</span>
                <span className="mod-name">真题模考</span>
                <span className="mod-desc">P1 自动判分 · P2/P4 自评 · P3/P5 资源</span>
              </button>
            </div>

            <a className="teachercard" href="https://jsjy.asia/teachers" target="_blank" rel="noreferrer">
              <img src="/logo-blue.svg" alt="菁仕教育" className="teacher-logo" />
              <span className="teacher-info">
                <span className="teacher-title">找老师教我</span>
                <span className="teacher-sub">菁仕教育 · 牛津剑桥名师团队 · 一对一定制辅导</span>
              </span>
              <span className="teacher-arrow">›</span>
            </a>

            {(rec.topic || showVocab) && <div className="seclbl">继续</div>}
            {rec.topic && user?.role !== 'admin' && (
              <div style={{ padding: '0 16px' }}>
                <RecommendCard rec={rec} onTrain={id => {
                  setQmode('mcq')
                  startSession({ src: 'topic', topicId: id, qmode: 'mcq' })
                }} />
              </div>
            )}
            <div style={{ height: 14 }} />
          </div>
          <div className="bottombar">
            <button className="btn" id="gowrong" onClick={() => nav.current?.go('wrong')}>错题本</button>
            {showVocab && (
              <button className="btn" id="govocab" onClick={() => nav.current?.go('vocab')}>单词本</button>
            )}
            <button className="btn wide primary" onClick={() => nav.current?.go('practice')}>开始训练</button>
          </div>
        </section>

        {/* ── 练：选板块 + 选题型（含推荐训练） ─────────────────────────── */}
        <section className="screen" data-screen="practice">
          <div className="scroll home">
            {rec.topic && user?.role !== 'admin' && (
              <div style={{ padding: '14px 16px 0' }}>
                <RecommendCard rec={rec} onTrain={id => {
                  setQmode('mcq')
                  startSession({ src: 'topic', topicId: id, qmode: 'mcq' })
                }} />
              </div>
            )}

            <div className="seclbl">题型</div>
            <div style={{ padding: '0 16px' }}>
              <div className="kindseg modeseg">
                <button type="button" className={qmode === 'mcq' ? 'on' : ''}
                        onClick={() => { setQmode('mcq'); Tool.sound.tick() }}>
                  选择题<span className="msub">每组 5 道 · P1 风格</span>
                </button>
                <button type="button" className={qmode === 'sq' ? 'on' : ''}
                        onClick={() => { setQmode('sq'); Tool.sound.tick() }}>
                  结构化大题<span className="msub">纸笔作答 · 自评判分 · P2 / P4</span>
                </button>
              </div>
            </div>

            {(['AS', 'A2'] as const).map(lv => (
              <div key={lv}>
                <div className="seclbl">
                  {lv === 'AS' ? 'AS · 对应 P1（选择）与 P2（结构化）' : 'A2 · 对应 P4（结构化）'}
                  <span className="spacer" />
                </div>
                <div className="tgrid">
                  {TOPICS.filter(t => t.level === lv).map(t => {
                    const b = BANK[t.id]
                    const on = topicId === t.id
                    return (
                      <button type="button" key={t.id}
                              className={'tcard' + (on ? ' on' : '')}
                              onClick={() => { setTopicId(t.id); Tool.sound.tick() }}>
                        <span className="tcn">{t.cn}</span>
                        <span className="ten">{t.en}</span>
                        <span className="tmeta">
                          <span className="tpaper">{t.papers.join(' · ')}</span>
                          <span>{qmode === 'mcq' ? b.mcq.length + ' 道选择' : b.sq.length + ' 道大题'}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div style={{ height: 20 }} />
          </div>
          <div className="bottombar">
            <button className="btn wide primary" id="start" disabled={!topicId}
                    onClick={() => topicId && startSession({ src: 'topic', topicId, qmode })}>
              {topicId ? '开始练习 · ' + (topicById(topicId)?.cn ?? '') : '先在上方选择一个板块'}
            </button>
            <button className="btn" id="gowrong2" onClick={() => nav.current?.go('wrong')}>错题本</button>
            {showVocab && (
              <button className="btn" id="govocab2" onClick={() => nav.current?.go('vocab')}>单词本</button>
            )}
          </div>
        </section>

        {/* ── 学：课程内容 ─────────────────────────────────────────────── */}
        <section className="screen" data-screen="study">
          <div className="scroll">
            <StudyHome onOpen={id => { setStudyTopic(id); nav.current?.go('studytopic') }} />
          </div>
        </section>

        <section className="screen" data-screen="studytopic">
          <div className="scroll">
            <StudyTopic tid={studyTopic} />
          </div>
        </section>

        {/* ── 考：真题模考 ─────────────────────────────────────────────── */}
        <section className="screen" data-screen="exam">
          <div className="scroll">
            <ExamHome onStart={t => {
              setExamTarget(t)
              nav.current?.go(t.kind === 'p1' ? 'p1run' : 'p2run')
            }} />
          </div>
        </section>

        <section className="screen" data-screen="p1run">
          <div className="scroll" style={{ display: 'flex', flexDirection: 'column' }}>
            {examTarget?.kind === 'p1' && (
              <P1Runner paper={examTarget} onExit={() => nav.current?.back()}
                onWrong={(items) => {
                  items.forEach(it => {
                    const w = {
                      kind: 'mcq' as const, topic: 'p1', s: it.s, ok: false, got: 0, max: 1,
                      your: 'ABCD'[it.a], e: it.e, kp: [] as string[], img: it.img,
                      o: ['选项 A', '选项 B', '选项 C', '选项 D'], a: it.a, at: Date.now(),
                    }
                    if (!wrongAll.some(x => x.s === w.s)) {
                      setWrongAll(v => [w, ...v].slice(0, 200))
                      addWrongM.mutate({ payload: JSON.stringify(w) })
                    }
                  })
                  utils.progress.state.invalidate()
                }} />
            )}
          </div>
        </section>

        <section className="screen" data-screen="p2run">
          <div className="scroll">
            {examTarget && examTarget.kind !== 'p1' && (
              <PpRunner target={examTarget} onExit={() => nav.current?.back()} />
            )}
          </div>
        </section>

        {/* ── 答题 ────────────────────────────────────────────────────── */}
        <section className="screen" data-screen="quiz">
          {items.length > 1 && (
            <div className="card-strip" id="strip">
              <Strip qs={items} done={graded} idx={idx} onPick={setIdx} />
            </div>
          )}
          <div className="bar" style={{ borderRadius: 0 }}>
            <i id="prog" style={{ width: items.length ? (nDone / items.length * 100) + '%' : 0 }} />
          </div>
          <div className="scroll" id="qbody">
            {items.length > 0 && (items[idx].kind === 'mcq'
              ? (
                <McqView q={items[idx].q as never} idx={idx} answer={answers[idx]}
                         locked={graded[idx] != null} ok={graded[idx]}
                         onAnswer={pickMcq}
                         zh={{ topic: items[idx].topic, qi: items[idx].qi ?? -1, topicName: topicById(items[idx].topic)?.cn ?? '' }} />
              ) : (
                <SqView q={items[idx].q as never} revealed={revealed[idx] ?? false}
                        grade={grades[idx]}
                        onReveal={revealSq}
                        onMark={markSq}
                        zh={{ topic: items[idx].topic, qi: items[idx].qi ?? -1, topicName: topicById(items[idx].topic)?.cn ?? '' }} />
              ))}
            {roundDone && <RoundDone right={roundRight} total={roundTotal} mode={session?.qmode ?? 'mcq'} />}
          </div>
          <div className="bottombar">
            {roundDone ? (
              <>
                {session?.src !== 'wrong' && (
                  <button className="btn" id="moreround" onClick={nextRound}>
                    {session?.qmode === 'mcq' ? '再来 5 题' : '下一题'}
                  </button>
                )}
                <button className="btn wide primary" id="endquiz" onClick={finish}>结束练习 · 生成报告</button>
              </>
            ) : (
              <>
                <button className="btn" id="quit" onClick={finish}>结束练习</button>
                {items.length > 1 && (
                  <button className="btn" id="prev" disabled={idx === 0}
                          onClick={() => setIdx(i => Math.max(0, i - 1))}>上一题</button>
                )}
                {items.length > 1 && (
                  <button className="btn wide primary" id="next" onClick={() => {
                    if (idx === items.length - 1) {
                      if (nDone < items.length) { Kit.toast('还有题没答完'); Tool.sound.err(); return }
                    } else setIdx(idx + 1)
                  }}>{idx === items.length - 1 ? '完成本组' : '下一题'}</button>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── 练习报告 ──────────────────────────────────────────────────── */}
        <section className="screen" data-screen="result">
          <div className="scroll" id="rbody">
            {report && <ReportBody r={report} />}
          </div>
          <div className="bottombar">
            <button className="btn" id="home2" onClick={() => nav.current?.back()}>返回首页</button>
            <button className="btn" id="dl" onClick={() => {
              if (!report) return
              Kit.download('物理练习报告-' + report.topic + '.md', buildMarkdown(report, report.topic), 'text/markdown;charset=utf-8')
              Kit.toast('知识点总结已下载')
            }}>下载知识点总结</button>
            <button className="btn wide primary" id="again" onClick={() => {
              const t = TOPICS.find(x => x.cn === report?.topic)
              if (report && t) startSession({ src: 'topic', topicId: t.id, qmode: report.mode })
              else nav.current?.back()
            }}>{TOPICS.some(x => x.cn === report?.topic) ? '继续练习本板块' : '再练一次'}</button>
          </div>
        </section>

        {/* ── 错题本 ──────────────────────────────────────────────────── */}
        <section className="screen" data-screen="wrong">
          <div className="scroll" id="wbody">
            <WrongBook all={wrongAll} topicName={id => topicById(id)?.cn ?? id} />
          </div>
          <div className="bottombar">
            <button className="btn" id="clear-wrong" onClick={() => {
              clearWrongM.mutate(); setWrongAll([]); Kit.toast('错题本已清空')
            }}>清空</button>
            <button className="btn wide primary" id="drill-wrong" disabled={!wrongAll.length}
                    onClick={() => startSession({ src: 'wrong', topicId: '', qmode: 'mcq' })}>重做错题（做对自动移除）</button>
          </div>
        </section>

        {/* ── 单词本（用过「一键翻译」后才有入口） ─────────────────────── */}
        <section className="screen" data-screen="vocab">
          <div className="scroll" id="vbody">
            <VocabBook />
          </div>
        </section>

        {/* ── 管理后台（仅管理员可见入口） ─────────────────────────────── */}
        {user?.role === 'admin' && (
          <section className="screen" data-screen="admin">
            <div className="scroll">
              <AdminPanel />
            </div>
          </section>
        )}
      </div>

      {/* 新用户问答环节：匹配阶段与薄弱章节 */}
      {showOnb && <Onboarding onDone={() => { setOnbDone(true); utils.auth.me.invalidate() }} />}
    </div>
  )
}
