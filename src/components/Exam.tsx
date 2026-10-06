import { useEffect, useMemo, useRef, useState } from 'react'
import Kit from '../lib/kit.js'
import Tool from '../lib/tool.js'
import { LETTERS } from '../lib/banks.js'
import { trpc } from '@/providers/trpc'

/* ── 数据类型 ─────────────────────────────────────────────────────────── */
export interface P1Paper { dir: string; name: string; year: number; n: number; answers: Record<number, string> }
interface P1Manifest { papers: { dir: string; name: string; year: number; n: number; answers: Record<string, string> }[] }
interface PPManifest { papers: { key: string; name: string; qp: string; ms: string; hasQp: boolean; hasMs: boolean }[] }
export interface ExamTarget { kind: 'p1' | 'p2' | 'p4'; dir?: string; key?: string; name: string }

const J = (u: unknown) => (u as { json: unknown })?.json ?? u
async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(url)
  return J(await r.json()) as T
}

let p1Cache: Promise<P1Manifest> | null = null
export const loadP1 = () => (p1Cache ??= fetchJson<P1Manifest>('/files/p1/manifest.json'))
const ppCache: Record<string, Promise<PPManifest>> = {}
const loadPP = (p: 'p2' | 'p4') => (ppCache[p] ??= fetchJson<PPManifest>(`/files/papers/${p}/manifest.json`))

/* PDF 页数：从文件字节里抓 /Count N */
async function pdfPages(url: string): Promise<number> {
  try {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer())
    const txt = new TextDecoder('latin1').decode(buf.slice(0, Math.min(buf.length, 400000)))
    let max = 0
    for (const m of txt.matchAll(/\/Count\s+(\d+)/g)) max = Math.max(max, parseInt(m[1], 10))
    return max || 12
  } catch { return 12 }
}

/* P2/P4 每题满分表（marks.json 由构建脚本从 mark scheme 解析） */
interface MarksFile { [key: string]: { n: string; max: number }[] }
let marksCache: Promise<MarksFile> | null = null
const loadMarks = () => (marksCache ??= fetchJson<MarksFile>('/files/papers/marks.json').catch(() => ({}) as MarksFile))

/* ── 模考首页 ─────────────────────────────────────────────────────────── */
function PaperGrid({ items, onPick }: { items: { id: string; name: string; sub?: string; disabled?: boolean }[]; onPick: (id: string) => void }) {
  return (
    <div className="tgrid examgrid">
      {items.map(p => (
        <button type="button" key={p.id} className="tcard" disabled={p.disabled}
                onClick={() => { onPick(p.id); Tool.sound.tick() }}>
          <span className="tcn">{p.name}</span>
          {p.sub ? <span className="ten">{p.sub}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function ExamHome({ onStart }: { onStart: (t: ExamTarget) => void }) {
  const [p1, setP1] = useState<P1Manifest | null>(null)
  const [pp, setPp] = useState<Record<'p2' | 'p4', PPManifest | null>>({ p2: null, p4: null })
  const [sec, setSec] = useState<'p1' | 'p2' | 'p4'>('p1')
  useEffect(() => { loadP1().then(setP1).catch(() => Kit.toast('P1 试卷清单载入失败')) }, [])
  useEffect(() => { loadPP('p2').then(m => setPp(v => ({ ...v, p2: m }))).catch(() => {}) }, [])
  useEffect(() => { loadPP('p4').then(m => setPp(v => ({ ...v, p4: m }))).catch(() => {}) }, [])

  const years = useMemo(() => {
    if (!p1) return []
    const map = new Map<number, P1Manifest['papers']>()
    for (const p of p1.papers) {
      if (!map.has(p.year)) map.set(p.year, [])
      map.get(p.year)!.push(p)
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [p1])

  return (
    <>
      <div className="homehero">
        <h1 className="paper">考 · 真题模考</h1>
        <p>P1 选择题线上作答、自动判分；P2 / P4 真题卷翻页作答、对照评分标准自评；
           答错的题自动收入错题本。P3 / P5 提供官方真题资源入口。</p>
      </div>
      <div className="seclbl">选择试卷</div>
      <div style={{ padding: '0 16px' }}>
        <div className="kindseg modeseg">
          {([['p1', 'P1 选择题'], ['p2', 'P2 结构化 · AS'], ['p4', 'P4 结构化 · A2']] as const).map(([k, label]) => (
            <button key={k} type="button" className={sec === k ? 'on' : ''}
                    onClick={() => { setSec(k); Tool.sound.tick() }}>{label}<span className="msub" /></button>
          ))}
        </div>
      </div>
      {sec === 'p1' && (
        <>
          <div className="seclbl" style={{padding:'0 16px'}}>真题卷 · 按年份</div>
          {!p1 && <div className="empty"><div>正在载入试卷清单…</div></div>}
          {years.map(([y, ps]) => (
            <div key={y}>
              <div className="seclbl">{y + ' 年 · ' + ps.length + ' 套'}</div>
              <PaperGrid items={ps.map(p => ({ id: p.dir, name: p.name, sub: '40 题 · 75 分钟' }))}
                         onPick={id => {
                           const p = ps.find(x => x.dir === id)!
                           onStart({ kind: 'p1', dir: p.dir, name: p.name })
                         }} />
            </div>
          ))}
        </>
      )}
      {sec !== 'p1' && (
        <>
          <div className="seclbl">真题卷 · 2015 年至今（试卷 + 评分标准已收录，可下载）</div>
          {!pp[sec] && <div className="empty"><div>正在载入试卷清单…</div></div>}
          {pp[sec] && (
            <PaperGrid items={pp[sec]!.papers.filter(p => p.hasQp).map(p => ({
              id: p.key, name: p.name, sub: p.hasMs ? '含评分标准' : '仅试卷',
            }))} onPick={key => {
              const p = pp[sec]!.papers.find(x => x.key === key)!
              onStart({ kind: sec, key: p.key, name: p.name })
            }} />
          )}
          {sec === 'p2' && (
            <a className="rescard" href="https://www.physicsandmathstutor.com/past-papers/a-level-physics/cie-paper-3/" target="_blank" rel="noreferrer">
              📥 P3 实验笔试资源（physicsandmathstutor）<span className="res-arrow">↗</span>
            </a>
          )}
          {sec === 'p4' && (
            <a className="rescard" href="https://www.physicsandmathstutor.com/past-papers/a-level-physics/cie-paper-5/" target="_blank" rel="noreferrer">
              📥 P5 实验设计与分析资源（physicsandmathstutor）<span className="res-arrow">↗</span>
            </a>
          )}
        </>
      )}
      <div style={{ height: 20 }} />
    </>
  )
}

/* ── P1 模考：逐题作答 · 自动判分 ────────────────────────────────────── */
export function P1Runner({ paper, onExit, onWrong }: {
  paper: ExamTarget
  onExit: () => void
  onWrong: (items: { s: string; img: string; a: number; e: string }[], meta: { name: string; pct: number; right: number; total: number }) => void
}) {
  const { data } = trpc.progress.state.useQuery(undefined, { retry: false })
  void data
  const addSessionM = trpc.progress.addSession.useMutation()
  const [full, setFull] = useState<P1Paper | null>(null)
  const [idx, setIdx] = useState(0)
  const [ans, setAns] = useState<(number | null)[]>(Array(40).fill(null))
  const [done, setDone] = useState(false)
  const startAt = useRef(Date.now())

  useEffect(() => {
    loadP1().then(m => {
      const p = m.papers.find(x => x.dir === paper.dir)!
      setFull({ ...p, answers: Object.fromEntries(Object.entries(p.answers).map(([k, v]) => [+k, v])) })
    })
  }, [paper.dir])

  const N = full?.n ?? 40
  const right = useMemo(() => {
    if (!full) return 0
    let r = 0
    for (let i = 1; i <= N; i++) if (ans[i - 1] != null && LETTERS[ans[i - 1]!] === full.answers[i]) r++
    return r
  }, [ans, full, N])

  if (!full) return <div className="empty"><div>正在载入试卷…</div></div>
  const pct = Math.round(100 * right / N)
  const answered = ans.slice(0, N).filter(a => a != null).length

  const submit = () => {
    if (answered < N && !confirm('还有 ' + (N - answered) + ' 题未作答，确定交卷吗？')) return
    setDone(true)
    Tool.sound.ding()
    const spent = Math.round((Date.now() - startAt.current) / 1000)
    addSessionM.mutate({
      topic: 'P1模考 · ' + full.name, mode: 'mcq', pct, got: right, maxScore: N,
      rightCount: right, total: N, spentSec: spent, kp: '[]',
    })
    const wrong: { s: string; img: string; a: number; e: string }[] = []
    for (let i = 1; i <= N; i++) {
      if (!(ans[i - 1] != null && LETTERS[ans[i - 1]!] === full.answers[i])) {
        wrong.push({
          s: '[P1模考] ' + full.name + ' · 第 ' + i + ' 题',
          img: '/files/p1/' + full.dir + '/q' + String(i).padStart(2, '0') + '.jpg',
          a: 'ABCD'.indexOf(full.answers[i]),
          e: '正确答案 ' + full.answers[i],
        })
      }
    }
    onWrong(wrong, { name: full.name, pct, right, total: N })
  }

  /* 结果页 */
  if (done) {
    const verdict = pct >= 80 ? '非常棒！已达 A* 线（约 80%+），保持手感即可。'
      : pct >= 70 ? '不错，接近 A 线。把错题对应的知识点回炉一下。'
      : pct >= 55 ? '基础在成形，但失误偏多——错题进错题本后建议重练一遍。'
      : '这套卷比较吃力。先到「学」模块把对应章节笔记过一遍，再来刷真题。'
    return (
      <div className="p1result">
        <div className="report">
          <div className="score">{pct}<small>%</small></div>
          <div className="verdict-line paper">{verdict}</div>
        </div>
        <div className="tally">
          <div><div className="n">{right + '/' + N}</div><div className="l">答对</div></div>
          <div><div className="n">{Tool.mmss((Date.now() - startAt.current) / 1000)}</div><div className="l">用时</div></div>
          <div><div className="n">{N - right}</div><div className="l">错题已入库</div></div>
        </div>
        <div className="seclbl">逐题回顾</div>
        <div className="p1grid">
          {Array.from({ length: N }, (_, i) => {
            const ok = ans[i] != null && LETTERS[ans[i]!] === full.answers[i + 1]
            const skip = ans[i] == null
            return (
              <button key={i} type="button"
                      className={'bub' + (skip ? ' skip' : ok ? ' done' : ' wrong')}
                      title={'第' + (i + 1) + '题 · 正确答案 ' + full.answers[i + 1] + (ans[i] != null ? ' · 你选了 ' + LETTERS[ans[i]!] : ' · 未作答')}
                      onClick={() => { setIdx(i); setDone(false) }}>{i + 1}</button>
            )
          })}
        </div>
        <div className="seclbl">试卷分析</div>
        <div className="why" style={{ padding: '0 16px' }}>
          本次 {full.name}：答对 {right} / {N}。
          {pct < 70 ? ' 低于 A 线（约 70%）。建议：① 错题已收入错题本，先重练错题；② 到「练」模块把薄弱章节正确率刷到 80% 以上；③ 考前每周至少完整模考两套 P1，控制每题 1 分 50 秒的节奏。' : ' 已稳定在较高水平，接下来可以限时训练保持手感，并把时间留给 P2 / P4 的大题书写。'}
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', gap: 8 }}>
          <button type="button" className="btn wide primary" onClick={onExit}>返回模考列表</button>
        </div>
      </div>
    )
  }

  /* 作答页 */
  const i = idx
  return (
    <div className="p1run">
      <div className="p1top">
        <span className="qkind">{full.name}</span>
        <span className="spacer" />
        <span className="zhhint">{answered + ' / ' + N + ' 已作答'}</span>
      </div>
      <div className="p1imgwrap">
        <img src={'/files/p1/' + full.dir + '/q' + String(i + 1).padStart(2, '0') + '.jpg'} alt={'第' + (i + 1) + '题'} />
      </div>
      <div className="opts p1opts">
        {('ABCD').split('').map((L, k) => (
          <button key={L} type="button" className={'opt' + (ans[i] === k ? ' pick' : '')}
                  onClick={() => { setAns(v => v.map((x, j) => j === i ? k : x)); Tool.sound.tick() }}>
            <span className="k">{L}</span><span>{'选项 ' + L}</span>
          </button>
        ))}
      </div>
      <div className="p1strip">
        {Array.from({ length: N }, (_, k) => (
          <button key={k} type="button"
                  className={'bub' + (ans[k] != null ? ' done' : '') + (k === i ? ' now' : '')}
                  onClick={() => setIdx(k)}>{k + 1}</button>
        ))}
      </div>
      <div className="bottombar">
        <button type="button" className="btn" disabled={i === 0} onClick={() => setIdx(i - 1)}>上一题</button>
        {i < N - 1
          ? <button type="button" className="btn wide primary" onClick={() => setIdx(i + 1)}>下一题</button>
          : <button type="button" className="btn wide primary" onClick={submit}>交卷 · 出分</button>}
      </div>
    </div>
  )
}

/* ── P2 / P4 模考：翻页作答 · 对照评分标准自评 ────────────────────────── */
export function PpRunner({ target, onExit }: { target: ExamTarget; onExit: () => void }) {
  const p = target.kind === 'p2' ? 'p2' : 'p4'
  const [pages, setPages] = useState(0)
  const [pg, setPg] = useState(1)
  const [showMs, setShowMs] = useState(false)
  const [msPages, setMsPages] = useState(0)
  const [msPg, setMsPg] = useState(1)
  const [marks, setMarks] = useState<{ n: string; max: number }[] | null>(null)
  const [got, setGot] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const utils = trpc.useUtils()
  const addSessionM = trpc.progress.addSession.useMutation()
  const addWrongM = trpc.progress.addWrong.useMutation()
  const startAt = useRef(Date.now())

  useEffect(() => { pdfPages(`/files/papers/${p}/${target.key}_qp.pdf`).then(setPages) }, [p, target.key])
  useEffect(() => { loadMarks().then(m => setMarks(m[`${p}/${target.key}`] ?? null)) }, [p, target.key])

  const filled = useMemo(() => {
    if (!marks) return { got: 0, max: 0 }
    let g = 0, mx = 0
    for (const q of marks) {
      mx += q.max
      const v = parseFloat(got[q.n] ?? '')
      if (!isNaN(v)) g += v
    }
    return { got: g, max: mx }
  }, [marks, got])

  const save = () => {
    const { got: g, max } = filled
    const pct = max ? Math.round(100 * g / max) : 0
    const spent = Math.round((Date.now() - startAt.current) / 1000)
    addSessionM.mutate({
      topic: (p === 'p2' ? 'P2模考 · ' : 'P4模考 · ') + target.name, mode: 'sq', pct,
      got: Math.round(g), maxScore: max, rightCount: 0, total: marks?.length ?? 0, spentSec: spent, kp: '[]',
    })
    /* 做错的题（得分 < 满分）逐题进错题本 */
    if (marks) {
      for (const q of marks) {
        const v = parseFloat(got[q.n] ?? '')
        if (isNaN(v) || v < q.max) {
          addWrongM.mutate({
            payload: JSON.stringify({
              kind: 'sq', topic: p + 'paper',
              s: '[' + (p === 'p2' ? 'P2' : 'P4') + '模考] ' + target.name + ' · 第 ' + q.n + ' 题',
              ok: false, got: isNaN(v) ? 0 : v, max: q.max,
              your: '自评 ' + (isNaN(v) ? 0 : v) + '/' + q.max,
              e: '参考评分标准（右侧翻页查看），本题满分 ' + q.max + ' 分',
              kp: [], at: Date.now(),
            }),
          })
        }
      }
    }
    setSaved(true)
    utils.progress.state.invalidate()
    Tool.sound.ding()
  }

  const PdfPane = ({ url, page, total, onPage }: { url: string; page: number; total: number; onPage: (n: number) => void }) => (
    <div className="pdfpane">
      <div className="pdfbar">
        <button type="button" className="zhbtn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ 上一页</button>
        <span className="mapzoom">{page + ' / ' + total}</span>
        <button type="button" className="zhbtn" disabled={page >= total} onClick={() => onPage(page + 1)}>下一页 ›</button>
        <span className="spacer" />
        <a className="zhbtn" href={url} download>下载 PDF</a>
      </div>
      <iframe className="pdfframe" title="pdf" src={url + '#page=' + page + '&zoom=page-fit'} />
    </div>
  )

  return (
    <div className="pprun">
      <div className="p1top">
        <span className="qkind">{target.name}</span>
        <span className="spacer" />
        {!showMs && <button type="button" className="btn primary" onClick={() => {
          setShowMs(true)
          pdfPages(`/files/papers/${p}/${target.key}_ms.pdf`).then(setMsPages)
        }}>我已完成作答 · 显示评分标准</button>}
      </div>
      {!showMs && (
        <div className="paperwork" style={{ margin: '8px 16px' }}>
          ✎ 在纸上逐题作答，用下方按钮翻页浏览整卷。写完后点右上「显示评分标准」进入自评。
        </div>
      )}
      <div className={showMs ? 'ppdual' : ''}>
        <PdfPane url={`/files/papers/${p}/${target.key}_qp.pdf`} page={pg} total={pages} onPage={setPg} />
        {showMs && <PdfPane url={`/files/papers/${p}/${target.key}_ms.pdf`} page={msPg} total={msPages} onPage={setMsPg} />}
      </div>
      {showMs && (
        <div className="selfmark" style={{ margin: '10px 16px' }}>
          {saved ? (
            <div className="sm-q">已记录本场模考成绩，做错的题已收入错题本。</div>
          ) : (
            <>
              <div className="sm-q">对照评分标准逐题自评：把你扣分的题改成实际得分（默认满分）。</div>
              {marks && marks.length > 0 ? (
                <div className="markgrid">
                  {marks.map(q => (
                    <label key={q.n} className="markcell">
                      <span>第 {q.n} 题 / {q.max} 分</span>
                      <input type="number" min={0} max={q.max} step={0.5} value={got[q.n] ?? ''}
                             placeholder={String(q.max)}
                             onChange={e => setGot(v => ({ ...v, [q.n]: e.target.value }))} />
                    </label>
                  ))}
                  <div className="marktotal">合计 {filled.got} / {filled.max} 分</div>
                </div>
              ) : (
                <div className="why">未能解析本卷的题号与分值，请直接对照评分标准估分，点击「提交成绩」记录本场模考。</div>
              )}
              <div className="sm-btns">
                <button type="button" className="btn primary" onClick={save}>提交成绩 · 错题入库</button>
                <button type="button" className="btn" onClick={onExit}>退出</button>
              </div>
            </>
          )}
          {saved && (
            <div className="sm-btns"><button type="button" className="btn wide primary" onClick={onExit}>返回模考列表</button></div>
          )}
        </div>
      )}
    </div>
  )
}
