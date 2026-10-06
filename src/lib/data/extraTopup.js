/* 补齐到每章 50 题 */

const sup = [
{s:'A student uses a diffraction grating with 600 lines mm⁻¹. Light of wavelength 550 nm produces a first-order maximum at angle θ. sinθ equals', o:['0.33','0.92','0.00033','0.55'], a:0, e:'d = 1/600000 m；sinθ = λ/d = 550×10⁻⁹ × 6×10⁵ = 0.33。', kp:['衍射光栅','光栅方程']},
];

const ele = [
{s:'The drift velocity of electrons in a wire increases when', o:['the wire is made longer','the current increases (same wire)','the temperature rises','the wire is thicker'], a:1, e:'v = I/(nAq)：同一根导线 n、A 不变，电流越大漂移速度越快。', kp:['漂移速度','I=nAvq']},
];

const tem = [
{s:'0.2 kg of copper (c = 390 J kg⁻¹ K⁻¹) cools from 80 °C to 30 °C. The heat released is', o:['3.9 kJ','7.8 kJ','0.39 kJ','39 kJ'], a:0, e:'Q = mcΔθ = 0.2 × 390 × 50 = 3900 J = 3.9 kJ。', kp:['比热容','计算']},
];

const cap = [
{s:'A 2200 μF capacitor is discharged through a 4.7 kΩ resistor. After about 10.3 s the voltage has fallen to', o:['about 63% of its initial value','about 37% of its initial value','zero exactly','half its initial value'], a:1, e:'τ = RC = 4700 × 2200×10⁻⁶ ≈ 10.3 s，恰为一个时间常数，V = V₀e⁻¹ ≈ 37%V₀。', kp:['时间常数','指数衰减']},
];

const mag = [
{s:'A proton moves parallel to a uniform magnetic field. The magnetic force on it is', o:['BQv','zero','BQv/2','towards the north pole'], a:1, e:'F = BQv sinθ，速度平行于磁场 θ = 0，力为零——粒子沿场线匀速直线运动。', kp:['洛伦兹力','方向']},
];

const ac = [
{s:'A bridge rectifier with a smoothing capacitor supplies a load. To reduce the ripple further, one could', o:['use a smaller capacitor','increase the capacitance or use a larger load resistance','increase the frequency of the ripple is fixed cannot help','remove the diodes'], a:1, e:'纹波谷值深度取决于放电时间常数 RC：C 或 R 越大，峰间放电越少，纹波越小。', kp:['平滑电容','纹波']},
{s:'The peak value of a sinusoidal alternating current is 8.0 A. The value a DC ammeter-equivalent (r.m.s.) reading would show is', o:['8.0 A','5.7 A','4.0 A','11.3 A'], a:1, e:'I_rms = I₀/√2 = 8.0/√2 ≈ 5.7 A。', kp:['有效值','峰值']},
];

const qua = [
{s:'Light of frequency f is shone on a metal. Doubling the frequency (still above threshold) multiplies the maximum KE of photoelectrons by', o:['exactly 2','more than 2','less than 2 but more than 1','1 — unchanged'], a:1, e:'KE = hf − Φ：2hf − Φ > 2(hf − Φ)，因为逸出功只减一次，故超过 2 倍。', kp:['爱因斯坦光电方程','比例关系']},
{s:'The energy of photons in a beam of intensity I and frequency f relates to the photon arrival rate by', o:['rate = I/hf','rate = Ihf','rate = hf/I','rate = Iλ'], a:0, e:'强度 = 每秒到达的能量；每个光子能量 hf，故光子流率 = I/hf（每单位面积）。', kp:['光子能量','光强']},
];

const nuc = [
{s:'The half-life of a source is 8 days. After how long is the activity reduced to 1/64 of its original value?', o:['48 days','64 days','512 days','16 days'], a:0, e:'1/64 = (1/2)⁶ → 6 个半衰期 = 48 天。', kp:['半衰期','计算']},
];

const med = [
{s:'Why is ultrasound rather than X-ray imaging preferred for examining the liver and gall bladder?', o:['ultrasound is cheaper only','soft-tissue boundaries reflect ultrasound well, and there is no ionising radiation','X-rays cannot reach the liver','ultrasound uses magnets'], a:1, e:'腹部软组织界面声阻抗差产生清晰回波，且无电离辐射损伤——腹部脏器首选超声。', kp:['超声成像','应用']},
{s:'In MRI, the signal used to form the image comes from', o:['X-ray absorption','radio waves re-emitted as hydrogen nuclei relax back to alignment with the field','infrared emission','injected gamma sources'], a:1, e:'MRI 信号：射频脉冲把质子“打倒”，质子弛豫回磁场方向时释放射频信号，不同组织弛豫时间不同形成对比。', kp:['MRI','弛豫']},
];

const ast = [
{s:'A galaxy shows a spectral line at 660 nm that has a laboratory wavelength of 656 nm. Its redshift z is approximately', o:['0.0061','0.061','0.61','6.1'], a:0, e:'z = Δλ/λ = (660−656)/656 ≈ 0.0061。', kp:['红移','计算']},
];

export const EXTRA_TOPUP = { sup, ele, tem, cap, mag, ac, qua, nuc, med, ast };
