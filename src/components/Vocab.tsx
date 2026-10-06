import { useEffect, useRef, useState } from 'react'
import Kit from '../lib/kit.js'
import Tool from '../lib/tool.js'
import { LETTERS } from '../lib/banks.js'
import { zhOf } from '../lib/zhBank.js'
import { GLOSSARY } from '../lib/data/glossary.js'
import { trpc } from '@/providers/trpc'
import type { Mode } from '../lib/types'

/* 「一键翻译」使用标记：学生用过一次翻译后，单词本入口才出现（按设备记住）。 */
const trUsedStore = Tool.store('alphy-tr-used', false)
export const trUsed = () => trUsedStore.get() === true
const markTrUsed = () => {
  if (!trUsedStore.get()) {
    trUsedStore.set(true)
    dispatchEvent(new Event('alphy:tr-used'))
  }
}

/* ── 划词查词：多义词取物理考试场景释义（词表已按此编排） ────────────────── */
const G = GLOSSARY as Record<string, string>
const tidy = (t: string) =>
  t.toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim()

function stemLookup(w: string): { key: string; meaning: string } | null {
  if (G[w]) return { key: w, meaning: G[w] }
  const cands: string[] = []
  if (w.endsWith('ies') && w.length > 4) cands.push(w.slice(0, -3) + 'y')
  if (w.endsWith('es') && w.length > 3) cands.push(w.slice(0, -2))
  if (w.endsWith('s') && w.length > 3) cands.push(w.slice(0, -1))
  if (w.endsWith('ed') && w.length > 4) cands.push(w.slice(0, -2), w.slice(0, -1))
  if (w.endsWith('ing') && w.length > 5) cands.push(w.slice(0, -3), w.slice(0, -3) + 'e')
  for (const c of cands) if (G[c]) return { key: c, meaning: G[c] }
  return null
}

/* 匹配顺序：三词短语 → 两词短语 → 单词 → 词形还原 */
export function lookupWord(raw: string): { key: string; meaning: string } | null {
  const text = tidy(raw)
  if (!text) return null
  const words = text.split(' ').filter(Boolean).slice(0, 4)
  for (let n = Math.min(3, words.length); n >= 2; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const ph = words.slice(i, i + n).join(' ')
      if (G[ph]) return { key: ph, meaning: G[ph] }
    }
  }
  for (const w of words) {
    const hit = stemLookup(w)
    if (hit) return hit
  }
  return null
}

/* 点选取词：从点击坐标取到光标所在的英文单词 */
function wordAt(x: number, y: number): string {
  const doc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  let node: Node | null = null
  let off = 0
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y)
    if (r) { node = r.startContainer; off = r.startOffset }
  } else if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    if (p) { node = p.offsetNode; off = p.offset }
  }
  if (!node || node.nodeType !== 3) return ''
  const text = node.nodeValue || ''
  const isW = (c: string) => /[A-Za-z-]/.test(c)
  let a = off
  let b = off
  while (a > 0 && isW(text[a - 1])) a--
  while (b < text.length && isW(text[b])) b++
  return text.slice(a, b)
}

/* ── ZhTools：一键翻译 + 译文面板 + 划词查词（翻译后才出现划词） ─────────────
   直接渲染题干本身（className 由调用方给，保持原排版），
   qi 是题目在 BANK[topic][kind] 中的下标，-1 表示未收录（无译文）。 */
export function ZhTools({ className, topic, kind, qi, stem, options, topicName }: {
  className: string; topic: string; kind: Mode; qi: number
  stem: string; options?: string[]; topicName: string
}) {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState(false)
  const [card, setCard] = useState<{ key: string; meaning: string } | null>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const utils = trpc.useUtils()
  const addM = trpc.vocab.add.useMutation({
    onSuccess: () => { utils.vocab.list.invalidate(); Kit.toast('已加入单词本') },
  })
  const zh = qi >= 0 ? zhOf(topic, kind, qi) : null

  const openZh = () => {
    setOpen(true)
    markTrUsed()
    Tool.sound.tick()
  }

  /* 划词模式：只在翻译开启后可开。监听题干区域内的框选与点选。 */
  useEffect(() => {
    if (!pick) return
    const onUp = (e: MouseEvent) => {
      const zone = zoneRef.current
      if (!zone || !zone.contains(e.target as HTMLElement)) return
      setTimeout(() => {
        let text = window.getSelection()?.toString() ?? ''
        if (!text.trim()) text = wordAt(e.clientX, e.clientY)
        window.getSelection()?.removeAllRanges()
        if (!text.trim()) return
        const hit = lookupWord(text)
        if (hit) { setCard(hit); Tool.sound.tick(); Tool.haptic(6) }
        else Kit.toast('词表暂未收录「' + tidy(text).slice(0, 20) + '」，试试单词原形')
      }, 10)
    }
    document.addEventListener('mouseup', onUp)
    return () => document.removeEventListener('mouseup', onUp)
  }, [pick])

  const addToBook = () => {
    if (!card) return
    addM.mutate({
      word: card.key, meaning: card.meaning,
      topic: topicName, context: stem.replace(/\s+/g, ' ').slice(0, 120),
    })
    setCard(null)
  }

  return (
    <div className={'zhtools' + (pick ? ' picking' : '')}>
      <div className="zhbar">
        {!open
          ? <button type="button" className="zhbtn" onClick={openZh}>译 一键翻译</button>
          : (
            <>
              <button type="button" className="zhbtn on" onClick={() => { setOpen(false); setPick(false); setCard(null) }}>收起译文</button>
              <button type="button" className={'zhbtn' + (pick ? ' on' : '')}
                      onClick={() => { setPick(p => !p); setCard(null); Tool.sound.tick() }}>
                划词{pick ? '中…' : ''}
              </button>
              {pick && <span className="zhhint">点一下或框选题干里的单词</span>}
            </>
          )}
      </div>
      <div className={className + ' zhzone'} ref={zoneRef}>{stem}</div>
      {open && (
        <div className="zhpanel">
          <div className="zhpanel-lbl">参考译文</div>
          {zh ? (
            <>
              <div className="zhstem">{zh.s}</div>
              {options && zh.o && (
                <div className="zhopts">
                  {options.map((_, i) => (
                    <div className="zhopt" key={i}><b>{LETTERS[i]}.</b>{zh.o[i] ?? ''}</div>
                  ))}
                </div>
              )}
            </>
          ) : <div className="zhstem">本题暂无译文。</div>}
        </div>
      )}
      {card && (
        <div className="wordcard">
          <div className="wc-word">{card.key}</div>
          <div className="wc-meaning">{card.meaning}</div>
          <div className="wc-btns">
            <button type="button" className="btn primary" onClick={addToBook}
                    disabled={addM.isPending}>加入单词本</button>
            <button type="button" className="btn" onClick={() => setCard(null)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 单词本页面 ─────────────────────────────────────────────────────────── */
export interface VocabEntry { word: string; meaning: string; topic: string; context: string; at: number }

export function VocabBook() {
  const utils = trpc.useUtils()
  const q = trpc.vocab.list.useQuery()
  const delM = trpc.vocab.remove.useMutation({
    onSuccess: () => { utils.vocab.list.invalidate(); Kit.toast('已移除') },
  })
  const clearM = trpc.vocab.clear.useMutation({
    onSuccess: () => { utils.vocab.list.invalidate(); Kit.toast('单词本已清空') },
  })
  const words = (q.data ?? []) as VocabEntry[]
  return (
    <>
      <div className="seclbl">
        {'单词本 · ' + words.length + ' 个词'}
        <span className="spacer" />
        {words.length > 0 && (
          <button type="button" className="zhbtn" onClick={() => {
            if (confirm('确定清空单词本吗？')) clearM.mutate()
          }}>清空</button>
        )}
      </div>
      {q.isLoading && <div className="empty"><div>正在载入单词本…</div></div>}
      {!q.isLoading && !words.length && (
        <div className="empty">
          <div>还没有收藏单词。<br />做题时先点「一键翻译」，再用「划词」点选不懂的单词即可加入。</div>
        </div>
      )}
      {words.map((w) => (
        <div className="wrongitem vrow" key={w.word}>
          <div className="vword">{w.word}</div>
          <div className="vmeaning">{w.meaning}</div>
          <div className="meta">
            {w.topic ? <span>{w.topic}</span> : null}
            <span>{new Date(w.at).toLocaleDateString('zh-CN')}</span>
            <span className="spacer" />
            <button type="button" className="vdel"
                    onClick={() => delM.mutate({ word: w.word })}>删除</button>
          </div>
          {w.context ? <div className="vctx">{w.context}…</div> : null}
        </div>
      ))}
      <div style={{ height: 18 }} />
    </>
  )
}
