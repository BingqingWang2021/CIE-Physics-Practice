/* 题库聚合与判分。
 *
 * 选择题：精确判分（答案下标比对）。
 * 结构化大题：评分点制——每道题带若干评分点，每个评分点有一组可接受的关键词
 * 写法（中英文均可）。学生作答经归一化后做子串匹配，命中即得该点评分，
 * 未命中的点附上针对性的讲解。这是离线环境下对 mark scheme 的合理逼近：
 * 判分结果供自学复盘参考，分数以官方阅卷为准。
 */
import { AS_MECH } from './data/asMech.js';
import { AS_WAVE } from './data/asWave.js';
import { A2_CORE } from './data/a2Core.js';
import { A2_FIELD } from './data/a2Field.js';
import { EXTRA_MECH } from './data/extraMech.js';
import { EXTRA_DEF } from './data/extraDef.js';
import { EXTRA_WAVE } from './data/extraWave.js';
import { EXTRA_DCC } from './data/extraDcc.js';
import { EXTRA_A2CORE } from './data/extraA2core.js';
import { EXTRA_A2HOT } from './data/extraA2hot.js';
import { EXTRA_A2FIELD } from './data/extraA2field.js';
import { EXTRA_A2MOD } from './data/extraA2mod.js';
import { EXTRA_TOPUP } from './data/extraTopup.js';
import { EXTRA_SQ_AS } from './data/extraSqAS.js';
import { EXTRA_SQ_A2 } from './data/extraSqA2.js';
import { TOPICS } from './topics.js';

export const BANK = Object.assign({}, AS_MECH, AS_WAVE, A2_CORE, A2_FIELD);

/* 合并补充选择题库：每个章节在原有 6 题基础上扩充到 50 题。 */
const EXTRA_FILES = [EXTRA_MECH, EXTRA_DEF, EXTRA_WAVE, EXTRA_DCC, EXTRA_A2CORE, EXTRA_A2HOT, EXTRA_A2FIELD, EXTRA_A2MOD, EXTRA_TOPUP];
const EXTRAS = {};
for (const f of EXTRA_FILES) {
  for (const [id, arr] of Object.entries(f)) EXTRAS[id] = [...(EXTRAS[id] || []), ...arr];
}
for (const id of Object.keys(EXTRAS)) {
  if (BANK[id]) BANK[id] = { ...BANK[id], mcq: [...BANK[id].mcq, ...EXTRAS[id]] };
  else BANK[id] = { mcq: EXTRAS[id], sq: [] };
}

/* 合并补充结构化大题：纸笔作答 + 自评模式，每章节扩充至 ≥10 道。 */
for (const f of [EXTRA_SQ_AS, EXTRA_SQ_A2]) {
  for (const [id, arr] of Object.entries(f)) {
    if (BANK[id]) BANK[id] = { ...BANK[id], sq: [...BANK[id].sq, ...arr] };
    else BANK[id] = { mcq: [], sq: [...arr] };
  }
}

/* 旧结构题没有逐题 tip：按章节补一条针对性解题技巧，保证自评做错后一定有技巧提示。 */
const SQ_TIP = {
  pqu: '先写公式再代数据，统一用 SI 单位；不确定度乘除相加、加减取绝对值。',
  kin: '匀变速先列已知量再选公式；二维运动分解到互相垂直的两个方向独立处理。',
  dyn: '画受力分析图，沿运动方向列 F = ma；注意区分质量与重量。',
  fdp: '压强差 → 浮力/升力；判断加速还是匀速，匀速时合力为零。',
  wep: '先判断哪些力做功，动能定理或功能原理列式；效率 = 有用输出/总输入。',
  def: '应力应变都在弹性限度内才用胡克定律；杨氏模量题注意面积单位换算。',
  wav: '分清横波纵波；v = fλ 搭配周期定义，相位差对应路径差。',
  sup: '干涉衍射抓光程差：加强同相、减弱反相；光栅用 d sinθ = nλ。',
  ele: '电流是电荷流量 I = Q/t；微观形式 I = nAvq 注意单位。',
  dcc: '串并联先化简，分压分流抓比例；含内阻时用 ε = I(R + r)。',
  par: '受力分解到沿绳/斜面方向；连接体对每个物体分别列牛顿第二定律。',
  cir: '先找向心力的来源（张力、摩擦力、重力分量），再列 F = mv²/r。',
  gra: '引力问题两把钥匙：g = GM/r² 与「引力提供向心力」；高度题 r 要加地球半径。',
  tem: '热学计算列能量账：mcΔθ 与 mL 分段相加；温标换算别忘 +273。',
  gas: '理想气体题先把温度换成开尔文；三态变化用 p₁V₁/T₁ = p₂V₂/T₂。',
  thd: '热力学第一定律 ΔU = q + w，先定符号：吸热为正、对气体做功为正。',
  osc: '简谐运动认定义 a = −ω²x；v_max = ωA、a_max = ω²A 成对使用。',
  elf: '电场强度定义 E = F/q；平行板匀强场用 E = V/d，粒子偏转按平抛处理。',
  cap: '电容题先判断「孤立(Q不变)还是接电源(V不变)」；储能 E = ½CV²。',
  mag: '磁场力 F = BIl / Bqv，方向用左手定则；圆周半径 r = mv/Bq。',
  ac: '市电 230 V 是有效值；功率一律用有效值，峰值 = 有效值 × √2。',
  qua: '光电效应一条方程 hf = φ + KE_max；J 与 eV 换算除以 e。',
  nuc: '放射性核心式 A = λN，λ = ln2/T½；计数题先减本底再算平方反比。',
  med: '超声测深 d = ct/2 别忘除 2；X 射线衰减 I = I₀e^(−μx)。',
  ast: '天文万用式 F = L/4πd² 与 λ_maxT = 2.9×10⁻³；红移链 z → v = zc → d = v/H₀。',
};
for (const [id, t] of Object.entries(BANK)) {
  if (SQ_TIP[id]) t.sq = t.sq.map(q => (q.tip ? q : { ...q, tip: SQ_TIP[id] }));
}

export const LETTERS = 'ABCD';
export const KINDLBL = { mcq: '选择', sq: '大题' };

/* 归一化：判分只做「知识点有没有写到」，不为难排版与符号输入。
   上标、^、* 一律摊平，大小写与空白不敏感，sqrt 与 √ 互换。 */
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/sqrt/g, '√')
    .replace(/\s+/g, '')
    .replace(/\*/g, '×')
    .replace(/\^/g, '')
    .replace(/⁻/g, '-').replace(/⁺/g, '+')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, ch => String(SUP.indexOf(ch)))
    .replace(/−/g, '-')
    .replace(/[×]/g, '×');
}
const hit = (text, pat) => norm(text).includes(norm(pat));

export function isRight(q, ans) { return ans != null && ans === q.a; }

export function answerText(q) { return LETTERS[q.a] + '. ' + q.o[q.a]; }

/* 结构化判分：返回 { got, max, hits:[{m, ok, hint}] } */
export function gradeSQ(q, text) {
  const t = String(text ?? '');
  const hits = q.points.map(p => ({ m: p.m, hint: p.hint, ok: p.any.some(k => hit(t, k)) }));
  const got = hits.reduce((s, h) => s + (h.ok ? h.m : 0), 0);
  return { got, max: q.marks, hits };
}

/* 抽题：优先抽本次练习没见过的题；见完了就重新洗一遍整池。 */
export function draw(list, n, used) {
  const fresh = list.map((q, i) => i).filter(i => !used.has(i));
  const pool = fresh.length >= n ? fresh : (used.clear(), list.map((_, i) => i));
  const r = [];
  const p = pool.slice();
  while (r.length < n && p.length) {
    const j = (Math.random() * p.length) | 0;
    const i = p.splice(j, 1)[0];
    used.add(i); r.push(i);
  }
  return r;
}

export function topicMeta(id) {
  const t = TOPICS.find(t => t.id === id);
  const b = BANK[id] || { mcq: [], sq: [] };
  return { ...t, nMcq: b.mcq.length, nSq: b.sq.length };
}
