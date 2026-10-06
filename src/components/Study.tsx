import { useEffect, useRef, useState } from 'react'
import Kit from '../lib/kit.js'
import Tool from '../lib/tool.js'
import { TOPICS, topicById } from '../lib/topics.js'
import { ASSETS, slidePdf, slidePptx, notePdf, mapPng } from '../lib/studyAssets.js'
import { trpc } from '@/providers/trpc'

/* ── 在线笔记本：按板块自动保存 ─────────────────────────────────────────── */
export function Notebook({ topic, label }: { topic: string; label: string }) {
  const q = trpc.notes.get.useQuery({ topic })
  const saveM = trpc.notes.save.useMutation()
  const [text, setText] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedTopic = useRef<string | null>(null)

  useEffect(() => {
    if (q.data && loadedTopic.current !== topic) {
      loadedTopic.current = topic
      setText(q.data.content)
      setSavedAt(q.data.updatedAt)
    }
  }, [q.data, topic])

  const onChange = (v: string) => {
    setText(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      saveM.mutate({ topic, content: v }, {
        onSuccess: () => setSavedAt(Date.now()),
      })
    }, 700)
  }

  if (text === null) return <div className="empty"><div>正在打开笔记本…</div></div>
  return (
    <div className="notebook">
      <div className="nb-bar">
        <span className="nb-label">📓 {label}的笔记</span>
        <span className="spacer" />
        <span className="nb-saved">{savedAt ? '已自动保存 · ' + new Date(savedAt).toLocaleTimeString('zh-CN') : '开始输入即自动保存'}</span>
        <button type="button" className="zhbtn" onClick={() => {
          Kit.download((label || '笔记本') + '-笔记.txt', text, 'text/plain;charset=utf-8')
        }}>下载</button>
      </div>
      <textarea className="nb-area" value={text} placeholder={'在这里记笔记…\n支持公式（如 a = −ω²x）、自己的易错点、课堂补充。'}
                onChange={e => onChange(e.target.value)} />
    </div>
  )
}

/* ── 思维导图：滚轮缩放 + 拖拽平移 ─────────────────────────────────────── */
export function MapViewer({ tid }: { tid: string }) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const host = useRef<HTMLDivElement>(null)
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)

  const clamp = (s: number) => Math.min(6, Math.max(0.35, s))
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScale(s => clamp(s * (e.deltaY < 0 ? 1.12 : 0.9)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="mapwrap">
      <div className="mapbar">
        <button type="button" className="zhbtn" onClick={() => setScale(s => clamp(s * 0.82))}>－</button>
        <span className="mapzoom">{Math.round(scale * 100) + '%'}</span>
        <button type="button" className="zhbtn" onClick={() => setScale(s => clamp(s * 1.22))}>＋</button>
        <button type="button" className="zhbtn" onClick={() => { setScale(1); setPos({ x: 0, y: 0 }) }}>复位</button>
        <span className="spacer" />
        <span className="zhhint">滚轮缩放 · 拖拽移动</span>
        <a className="zhbtn" href={mapPng(tid)} download={`思维导图-${tid}.png`}>下载高清图</a>
      </div>
      <div className="mappan" ref={host}
           onPointerDown={e => { drag.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId) }}
           onPointerMove={e => { if (drag.current) setPos({ x: drag.current.px + e.clientX - drag.current.sx, y: drag.current.py + e.clientY - drag.current.sy }) }}
           onPointerUp={() => { drag.current = null }}
           onPointerLeave={() => { drag.current = null }}>
        <img src={mapPng(tid)} alt="思维导图" draggable={false}
             style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }} />
      </div>
    </div>
  )
}

/* ── 章节学习页：课件 / 笔记 / 思维导图 / 我的笔记 ────────────────────── */
export function StudyTopic({ tid }: { tid: string }) {
  const t = topicById(tid)
  const a = ASSETS[tid as keyof typeof ASSETS]
  const [tab, setTab] = useState<'slides' | 'notes' | 'map' | 'nb'>('slides')
  if (!t || !a) return null
  const tabs = [
    ['slides', `课件 · ${a.slides}页`], ['notes', `中英笔记 · ${a.notes}页`],
    ['map', '思维导图'], ['nb', '我的笔记'],
  ] as const
  return (
    <>
      <div className="studytabs">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''}
                  onClick={() => { setTab(k); Tool.sound.tick() }}>{label}</button>
        ))}
      </div>
      <div className="studybody">
        {tab === 'slides' && (
          <div className="docwrap">
            <div className="docbar">
              <span className="zhhint">课件 PDF · 可翻页查阅</span><span className="spacer" />
              <a className="zhbtn" href={slidePdf(tid)} target="_blank" rel="noreferrer">全屏打开</a>
              <a className="zhbtn" href={slidePptx(tid)} download={`课件-${t.cn}.pptx`}>下载 PPTX</a>
            </div>
            <iframe className="docframe" title="课件" src={slidePdf(tid)} />
          </div>
        )}
        {tab === 'notes' && (
          <div className="docwrap">
            <div className="docbar">
              <span className="zhhint">中英对照学习笔记 · 与考纲逐节对应</span><span className="spacer" />
              <a className="zhbtn" href={notePdf(tid)} target="_blank" rel="noreferrer">全屏打开</a>
              <a className="zhbtn" href={notePdf(tid)} download={`中英笔记-${t.cn}.pdf`}>下载 PDF</a>
            </div>
            <iframe className="docframe" title="笔记" src={notePdf(tid)} />
          </div>
        )}
        {tab === 'map' && <MapViewer tid={tid} />}
        {tab === 'nb' && <Notebook topic={tid} label={t.cn} />}
      </div>
    </>
  )
}

/* ── 学习模块首页：25 章资源入口 + 通用笔记本 ─────────────────────────── */
export function StudyHome({ onOpen }: { onOpen: (tid: string) => void }) {
  return (
    <>
      <div className="homehero">
        <h1 className="paper">学 · 课程内容</h1>
        <p>按 25 个知识板块整理：每一章都有课件、中英对照笔记和思维导图。
           查阅时可随时打开「我的笔记」边学边记，内容自动保存在你的账号里。</p>
      </div>
      <div className="seclbl">通用笔记本</div>
      <div style={{ padding: '0 16px' }}><Notebook topic="" label="通用" /></div>
      {(['AS', 'A2'] as const).map(lv => (
        <div key={lv}>
          <div className="seclbl">{lv === 'AS' ? 'AS · 第 1–11 章' : 'A2 · 第 12–25 章'}</div>
          <div className="tgrid">
            {TOPICS.filter(t => t.level === lv).map((t, i) => {
              const a = ASSETS[t.id as keyof typeof ASSETS]
              return (
                <button type="button" key={t.id} className="tcard"
                        onClick={() => { onOpen(t.id); Tool.sound.tick() }}>
                  <span className="tcn">{String(TOPICS.indexOf(t) + 1).padStart(2, '0')} · {t.cn}</span>
                  <span className="ten">{t.en}</span>
                  <span className="tmeta">
                    <span className="tpaper">课件 {a.slides}P</span>
                    <span>笔记 {a.notes}页 · 导图</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ height: 20 }} />
    </>
  )
}
