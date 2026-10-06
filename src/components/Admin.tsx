import { useMemo, useState } from 'react'
import { trpc } from '@/providers/trpc'
import { TOPICS } from '../lib/topics'
import Kit from '../lib/kit.js'
import type { WrongItem } from '../lib/types'

/* ── 管理后台：学生列表 + 单个学生的诊断性评估 ────────────────────── */

const topicName = (id: string) => TOPICS.find(t => t.id === id)?.cn ?? id
const fmtTime = (t: number) => new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDate = (t: number) => new Date(t).toLocaleDateString('zh-CN')

interface SessionRow {
  at: number; topic: string; mode: 'mcq' | 'sq'; pct: number
  got: number; max: number; right: number; total: number; spentSec: number; kp: string
}

interface TopicAgg { id: string; q: number; right: number; acc: number; sessions: number }

/* 按板块聚合正确率 */
function aggByTopic(sessions: SessionRow[]): TopicAgg[] {
  const m = new Map<string, { q: number; right: number; n: number }>()
  for (const s of sessions) {
    const cur = m.get(s.topic) ?? { q: 0, right: 0, n: 0 }
    cur.q += s.total; cur.right += s.right; cur.n += 1
    m.set(s.topic, cur)
  }
  return [...m.entries()]
    .map(([id, v]) => ({ id, q: v.q, right: v.right, acc: v.q ? Math.round(v.right / v.q * 100) : 0, sessions: v.n }))
    .sort((a, b) => a.acc - b.acc)
}

/* 知识点出现频次（错题 + 场次） */
function kpFreq(sessions: SessionRow[], wrong: WrongItem[]): [string, number][] {
  const m = new Map<string, number>()
  const add = (kp: string[], w: number) => kp.forEach(k => m.set(k, (m.get(k) ?? 0) + w))
  wrong.forEach(w => add(w.kp ?? [], 2))            // 错题权重更高
  sessions.forEach(s => { try { add(JSON.parse(s.kp), 1) } catch { /* 忽略坏数据 */ } })
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

/* 规则化诊断结论 */
function diagnose(name: string, sessions: SessionRow[], wrong: WrongItem[], topics: TopicAgg[]): string[] {
  const out: string[] = []
  if (!sessions.length) return [`${name} 还没有练习记录，建议先完成至少 3 场练习再做评估。`]
  const totalQ = sessions.reduce((a, s) => a + s.total, 0)
  const rightQ = sessions.reduce((a, s) => a + s.right, 0)
  const acc = totalQ ? Math.round(rightQ / totalQ * 100) : 0
  out.push(acc >= 80
    ? `整体正确率 ${acc}%（${rightQ}/${totalQ}），基础扎实，可以加大 A2 难题与限时训练比重。`
    : acc >= 60
      ? `整体正确率 ${acc}%（${rightQ}/${totalQ}），中等水平，重点是减少波动、补齐弱板块。`
      : `整体正确率 ${acc}%（${rightQ}/${totalQ}），基础偏弱，建议先回归讲义把概念过一遍，再小步刷题。`)

  const weak = topics.filter(t => t.q >= 5 && t.acc < 60)
  if (weak.length) out.push(`薄弱板块（正确率低于 60%）：${weak.map(t => `${topicName(t.id)} ${t.acc}%`).join('、')}。建议优先重练这些板块的选择题，并整理对应错题。`)
  const strong = topics.filter(t => t.q >= 5 && t.acc >= 85)
  if (strong.length) out.push(`优势板块：${strong.map(t => topicName(t.id)).join('、')}，可适当减少投入，把时间让给弱项。`)

  const last5 = sessions.slice(-5), prev5 = sessions.slice(-10, -5)
  if (prev5.length === 5) {
    const a = Math.round(last5.reduce((x, s) => x + s.pct, 0) / last5.length)
    const b = Math.round(prev5.reduce((x, s) => x + s.pct, 0) / prev5.length)
    out.push(a > b + 3 ? `近期趋势向好：最近 5 场均分 ${a}%，较前 5 场 ${b}% 上升，保持当前节奏。`
      : a < b - 3 ? `近期成绩下滑：最近 5 场均分 ${a}%，较前 5 场 ${b}% 下降，建议复盘最近的错题并检查是否有知识漏洞。`
      : `近期成绩平稳：最近 5 场均分 ${a}%，与前 5 场基本持平，可以尝试更高强度的限时训练寻求突破。`)
  }
  if (wrong.length) out.push(`错题本尚有 ${wrong.length} 道未清，建议安排一次错题重练（做对会自动移除）。`)
  return out
}

/* 导出 Markdown 诊断报告 */
function exportMd(name: string, sessions: SessionRow[], wrong: WrongItem[], topics: TopicAgg[], lines: string[]) {
  const totalQ = sessions.reduce((a, s) => a + s.total, 0)
  const rightQ = sessions.reduce((a, s) => a + s.right, 0)
  const md = [
    `# ${name} · A-Level 物理诊断报告`,
    ``,
    `生成时间：${new Date().toLocaleString('zh-CN')}`,
    ``,
    `## 总览`,
    ``,
    `- 练习场次：${sessions.length}`,
    `- 累计题量：${totalQ}（答对 ${rightQ}，正确率 ${totalQ ? Math.round(rightQ / totalQ * 100) : 0}%）`,
    `- 错题待清：${wrong.length}`,
    ``,
    `## 诊断结论`,
    ``,
    ...lines.map(l => `- ${l}`),
    ``,
    `## 各板块正确率`,
    ``,
    `| 板块 | 题数 | 正确率 | 场次 |`,
    `| --- | --- | --- | --- |`,
    ...topics.map(t => `| ${topicName(t.id)} | ${t.q} | ${t.acc}% | ${t.sessions} |`),
    ``,
    `## 高频知识点（错题权重高）`,
    ``,
    ...kpFreq(sessions, wrong).slice(0, 10).map(([k, n]) => `- ${k}（${n}）`),
    ``,
    `## 近期练习记录`,
    ``,
    `| 时间 | 板块 | 题型 | 得分率 | 得分 | 用时 |`,
    `| --- | --- | --- | --- | --- | --- |`,
    ...sessions.slice(-15).reverse().map(s =>
      `| ${fmtTime(s.at)} | ${topicName(s.topic)} | ${s.mode === 'mcq' ? '选择题' : '大题'} | ${s.pct}% | ${s.got}/${s.max} | ${Math.round(s.spentSec / 60)} 分钟 |`),
  ].join('\n')
  Kit.download(`${name}-诊断报告.md`, md)
  Kit.toast('诊断报告已下载')
}

/* ── 报告管理：全部学生的练习报告，支持分组查看与删除 ─────────────── */
interface RepRow {
  id: number; userId: number; student: string; topic: string; mode: string
  pct: number; got: number; max: number; total: number; spentSec: number; at: number
}

function ReportManager() {
  const utils = trpc.useUtils()
  const q = trpc.admin.allSessions.useQuery()
  const delM = trpc.admin.deleteSession.useMutation({
    onSuccess: () => { utils.admin.allSessions.invalidate(); utils.admin.students.invalidate(); Kit.toast('报告已删除') },
  })
  const delBatchM = trpc.admin.deleteSessions.useMutation({
    onSuccess: (r) => { utils.admin.allSessions.invalidate(); utils.admin.students.invalidate(); Kit.toast(`已删除 ${r.count} 条报告`) },
  })
  const [groupBy, setGroupBy] = useState<'student' | 'topic' | 'none'>('student')

  const rows = (q.data ?? []) as RepRow[]
  const groups = useMemo(() => {
    if (groupBy === 'none') return [['按时间倒序', rows] as const]
    const m = new Map<string, RepRow[]>()
    for (const r of rows) {
      const k = groupBy === 'student' ? r.student : topicName(r.topic)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [rows, groupBy])

  return (
    <div className="admin">
      <div className="grp-bar">
        分组方式：
        <select value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)}>
          <option value="student">按学生分组</option>
          <option value="topic">按板块分组</option>
          <option value="none">不分组（按时间）</option>
        </select>
        <span className="spacer" />
        共 {rows.length} 条报告
      </div>
      {q.isLoading && <div className="dim" style={{ padding: 16 }}>载入中…</div>}
      {!q.isLoading && !rows.length && <div className="dim" style={{ padding: 16 }}>还没有任何练习报告。</div>}
      {groups.map(([name, rs]) => (
        <div key={name}>
          <div className="grp-head">
            {name}<span className="cnt">{rs.length} 条</span>
            {groupBy !== 'none' && (
              <button className="grp-del" onClick={() => {
                if (window.confirm(`确定删除「${name}」的全部 ${rs.length} 条报告？此操作不可撤销。`))
                  delBatchM.mutate({ ids: rs.map(r => r.id) })
              }}>删除本组</button>
            )}
          </div>
          {rs.map(r => (
            <div key={r.id} className="rep-row">
              <span className="rp-stu">{r.student}</span>
              <span className="rp-topic">{topicName(r.topic)}</span>
              <span className="rp-mode">{r.mode === 'mcq' ? '选择' : '大题'}</span>
              <span className={'rp-pct ' + (r.pct >= 70 ? 'ok' : r.pct >= 40 ? 'mid' : 'bad')}>{r.pct}%</span>
              <span className="rp-time">{fmtTime(r.at)}</span>
              <button className="rep-del" title="删除这条报告" onClick={() => {
                if (window.confirm(`删除 ${r.student} 的这条报告（${topicName(r.topic)} · ${r.pct}%）？`))
                  delM.mutate({ id: r.id })
              }}>✕</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function AdminPanel() {
  const [tab, setTab] = useState<'students' | 'reports'>('students')
  const [sel, setSel] = useState<number | null>(null)
  const studentsQ = trpc.admin.students.useQuery(undefined, { enabled: tab === 'students' })
  const detailQ = trpc.admin.studentDetail.useQuery({ userId: sel! }, { enabled: tab === 'students' && sel != null })
  const utils = trpc.useUtils()
  const grpM = trpc.admin.setGroup.useMutation({
    onSuccess: () => { utils.admin.students.invalidate(); utils.admin.studentDetail.invalidate(); Kit.toast('分组已更新') },
  })
  const aliasM = trpc.admin.setAlias.useMutation({
    onSuccess: () => { utils.admin.students.invalidate(); utils.admin.studentDetail.invalidate(); Kit.toast('备注名已更新') },
  })
  const delStuM = trpc.admin.deleteStudent.useMutation({
    onSuccess: () => { utils.admin.students.invalidate(); Kit.toast('学生已删除') },
  })

  const students = studentsQ.data ?? []
  const detail = detailQ.data

  const stats = useMemo(() => {
    if (!detail) return null
    const sessions = detail.sessions as SessionRow[]
    const wrong = detail.wrong as WrongItem[]
    const topics = aggByTopic(sessions)
    const kps = kpFreq(sessions, wrong)
    const lines = diagnose(detail.user.name, sessions, wrong, topics)
    return { sessions, wrong, topics, kps, lines }
  }, [detail])

  /* ── 学生列表 ── */
  if (sel == null) {
    return (
      <div className="admin">
        <div className="adm-tabs">
          <button className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>学生总览</button>
          <button className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>报告管理</button>
        </div>
        {tab === 'reports' ? <ReportManager /> : (
        <>
        <div className="seclbl">学生总览<span className="spacer" />{students.length} 个账号</div>
        {studentsQ.isLoading && <div className="dim" style={{ padding: 16 }}>载入中…</div>}
        {!studentsQ.isLoading && !students.length && <div className="dim" style={{ padding: 16 }}>还没有学生注册。</div>}
        {students.map(s => (
          <div key={s.id} className="stu-row stu-row2">
            <button className="stu-main" onClick={() => setSel(s.id)}>
              <span className="stu-name">
                {s.alias ? <><em className="stu-alias">{s.alias}</em>{s.name}</> : s.name}
                {s.role === 'admin' && s.name !== '管理员' && <em className="stu-badge">管理员</em>}
                {s.level ? <em className="stu-lv">{s.level}</em> : null}
                <small>{s.username ? '@' + s.username : 'Kimi 账号'}{s.grp ? ' · ' + s.grp : ''}</small>
              </span>
              <span className="stu-nums">
                <span>{s.sessions} 场</span>
                <span>{s.totalQ} 题</span>
                <span className={s.accuracy == null ? '' : s.accuracy >= 70 ? 'ok' : s.accuracy >= 50 ? 'mid' : 'bad'}>
                  {s.accuracy == null ? '—' : s.accuracy + '%'}
                </span>
                <span>{s.wrong} 错题</span>
                <span>{s.vocab} 词</span>
              </span>
              <span className="stu-time">
                {s.lastSignInAt ? <small>登录 {fmtTime(s.lastSignInAt)}</small> : null}
                {s.lastActive ? <small>练习 {fmtTime(s.lastActive)}</small> : null}
              </span>
            </button>
            <span className="stu-ops">
              <input className="stu-in" placeholder="分组" defaultValue={s.grp ?? ''} title="回车保存分组"
                     onKeyDown={e => {
                       if (e.key === 'Enter') grpM.mutate({ userId: s.id, grp: (e.target as HTMLInputElement).value.trim() })
                     }} />
              <input className="stu-in" placeholder="备注名" defaultValue={s.alias ?? ''} title="回车保存备注名"
                     onKeyDown={e => {
                       if (e.key === 'Enter') aliasM.mutate({ userId: s.id, alias: (e.target as HTMLInputElement).value.trim() })
                     }} />
              {s.role !== 'admin' && (
                <button className="stu-del" title="删除该学生（连带清空其全部数据）" onClick={() => {
                  if (window.confirm(`确定删除学生「${s.name}」？其练习记录、错题本、单词本和笔记都会被清空，不可撤销。`))
                    delStuM.mutate({ userId: s.id })
                }}>删除</button>
              )}
            </span>
          </div>
        ))}
        </>
        )}
      </div>
    )
  }

  /* ── 学生详情 ── */
  if (detailQ.isLoading || !detail || !stats) return <div className="dim" style={{ padding: 16 }}>载入中…</div>
  const { sessions, wrong, topics, kps, lines } = stats
  const last10 = sessions.slice(-10)

  return (
    <div className="admin">
      <button className="chip-btn" onClick={() => setSel(null)}>← 返回学生列表</button>
      <div className="adm-head">
        <h2>{detail.user.name} <small>{detail.user.username ? '@' + detail.user.username : 'Kimi 账号'}</small></h2>
        <button className="btn primary" onClick={() => exportMd(detail.user.name, sessions, wrong, topics, lines)}>导出诊断报告</button>
      </div>

      <div className="seclbl">诊断结论</div>
      <div className="diag">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>

      <div className="seclbl">总体学习情况</div>
      <div className="tally">
        <div><div className="n">{(detail as any).stats?.topicCount ?? 0}</div><div className="l">练过板块</div></div>
        <div><div className="n">{(detail as any).stats?.vocab ?? 0}</div><div className="l">单词本</div></div>
        <div><div className="n">{(detail as any).stats?.notes ?? 0}</div><div className="l">笔记本</div></div>
        <div><div className="n">{(detail as any).stats?.trend ?? '—'}{typeof (detail as any).stats?.trend === 'number' ? <small>%</small> : null}</div><div className="l">近10场均分</div></div>
      </div>
      <div className="admmeta">
        <span>阶段：{detail.user.level ?? '未设置'}</span>
        <span>分组：<input className="stu-in" defaultValue={detail.user.grp ?? ''} onKeyDown={e => {
          if (e.key === 'Enter') grpM.mutate({ userId: detail.user.id, grp: (e.target as HTMLInputElement).value.trim() })
        }} /></span>
        <span>备注：<input className="stu-in" defaultValue={detail.user.alias ?? ''} onKeyDown={e => {
          if (e.key === 'Enter') aliasM.mutate({ userId: detail.user.id, alias: (e.target as HTMLInputElement).value.trim() })
        }} /></span>
        <span>最近登录：{fmtTime(detail.user.lastSignInAt)}</span>
        <span>注册：{fmtDate(detail.user.createdAt)}</span>
      </div>

      <div className="seclbl">最近 {last10.length} 场得分率</div>
      <div className="trend">
        {last10.map((s, i) => (
          <div key={i} className="trend-col" title={`${topicName(s.topic)} · ${s.pct}% · ${fmtTime(s.at)}`}>
            <i style={{ height: Math.max(4, s.pct) + '%' }} className={s.pct >= 70 ? 'ok' : s.pct >= 40 ? 'mid' : 'bad'} />
            <span>{s.pct}</span>
          </div>
        ))}
      </div>

      <div className="seclbl">各板块正确率</div>
      {!topics.length && <div className="dim" style={{ padding: '4px 16px' }}>暂无数据</div>}
      {topics.map(t => (
        <div key={t.id} className="topic-acc">
          <span className="ta-name">{topicName(t.id)}</span>
          <span className="ta-bar"><i style={{ width: t.acc + '%' }} className={t.acc >= 70 ? 'ok' : t.acc >= 50 ? 'mid' : 'bad'} /></span>
          <span className="ta-num">{t.acc}%<small>{t.q} 题</small></span>
        </div>
      ))}

      <div className="seclbl">高频知识点</div>
      <div className="kp-cloud">
        {kps.slice(0, 12).map(([k, n]) => <span key={k} className="kp-tag">{k}<b>{n}</b></span>)}
        {!kps.length && <span className="dim">暂无数据</span>}
      </div>

      <div className="seclbl">错题本（{wrong.length}）</div>
      {wrong.slice(0, 20).map((w, i) => (
        <details key={i} className="wrong-item">
          <summary><span className="wi-topic">{topicName(w.topic)}</span>{w.s}</summary>
          <div className="wi-body">
            {w.your && <p><b>学生作答：</b>{w.your}</p>}
            {w.e && <p><b>解析：</b>{w.e}</p>}
          </div>
        </details>
      ))}
      {wrong.length > 20 && <div className="dim" style={{ padding: '4px 16px' }}>仅显示最近 20 道，完整清单见导出报告。</div>}

      <div className="seclbl">练习记录</div>
      {sessions.slice().reverse().slice(0, 30).map((s, i) => (
        <div key={i} className="sess-row">
          <span>{fmtDate(s.at)}</span>
          <span>{topicName(s.topic)}</span>
          <span>{s.mode === 'mcq' ? '选择题' : '大题'}</span>
          <span className={s.pct >= 70 ? 'ok' : s.pct >= 40 ? 'mid' : 'bad'}>{s.pct}%</span>
          <span className="dim">{s.got}/{s.max} 分 · {Math.round(s.spentSec / 60)} 分钟</span>
        </div>
      ))}
      {!sessions.length && <div className="dim" style={{ padding: '4px 16px' }}>暂无练习记录</div>}
    </div>
  )
}
