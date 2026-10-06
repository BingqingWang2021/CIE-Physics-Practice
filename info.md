# 题册 · 在线考试与题库自测

一个纯前端的在线考试 / 题库自测工具：挑一套试卷、逐题作答、当场判分（或考试模式最后统一判分）、自动生成成绩单，错题自动进错题本；也可以自己出题、改题，并把整份试卷压缩进一条链接发给别人作答 —— 全程不需要任何后端。

> **语言**：网站界面当前是中文。实际交付时界面的语言由用户的 query 语言决定 —— 如果用户用其他语言交流，把网站上所有面向用户的文案（标题、按钮、toast 提示、题库内容）翻译成那种语言，代码结构与样式保持不变。

## 开始之前：先问用户

加载或改动网站之前，先用 ask_user 问几个问题：

1. **（必问）您是否需要把网页变成全栈应用？** 也就是增加持久化的服务端数据存储。目前所有数据（自建试卷、错题本、设置）只存在访问者自己浏览器的 localStorage 里：换设备就丢失，也没办法汇总所有人的成绩。如果用户需要多人共享题库、跨设备同步、成绩榜单这类能力，就得加后端和数据库。
2. 题册里要考什么内容？内置了两套示例题库（数据结构 · 基础 / 安全生产 · 通用），用户往往想换成自己的科目 —— 驾考、认证考试、外语单词、企业培训…… 题库数据集中在 `src/lib/banks.js`。
3. 默认答题规则要不要调？「选完立即判分 / 考试模式」「打乱题序」「限时 10 分钟」的默认值在 `src/App.tsx` 的 `cfg` 里。
4. 视觉偏好：要不要换强调色，或者默认用深色模式？设计令牌是 `src/styles/kit.css` 顶部的 CSS 变量。

如果用户不回答任何问题，直接加载默认网站文件即可。

可选：如果符合用户的需求，你可以使用图像和视频生成工具。

## 这是什么

```
index.html            入口（#root 用 display:contents，不生成自己的盒子）
package.json          React 19 + Vite + TypeScript，无其他运行时依赖
vite.config.ts
public/fonts/         Geist / Geist Mono 可变字体
src/
  main.tsx            挂载
  App.tsx             五个屏（首页 / 答题 / 成绩单 / 题目管理 / 错题本）与全部状态
  components/
    Editor.tsx        出题器：左题目列表 + 右编辑表单，每次改动直接落盘
    Quiz.tsx          答题卡格子、题干与选项、成绩单、错题本视图
    SwitchRow.tsx     设置开关行（类名依赖 tool.css）
  lib/
    banks.js          内置题库与判分纯函数
    kit.js            通用 UI 行为：主题、toast、分段控件、计数动画、种子随机数
    tool.js           工具引擎：分享链接、海报、撒花、音效、计时、存储、屏栈
    types.ts          Bank / Q / Cfg / Report 类型
  styles/
    kit.css           设计令牌与基础控件（发丝线、等宽表格数字、一枚强调色）
    tool.css          工具壳：.stage/.screens/.screen 屏栈、.twopane、底栏、打印
    app.css           题册自身的试卷质感：衬线题干、暖纸底、答题卡、批注、成绩单
dist/                 已构建的静态产物，可直接部署
```

`npm run dev` 本地开发，`npm run build` 构建。如果用户只是想看看这个网站，直接加载（或部署 `dist/`）即可，不要改任何东西。

可以按用户需求改造的方向：换成任意科目的题库、改品牌名「题册」与各处文案、调整计分与限时规则、增删题型、换强调色或默认主题。面向用户的字符串集中在 `src/App.tsx`、`src/components/`、`src/lib/banks.js`；海报上的文案在 `App.tsx` 的 poster 配置里。

## 技术要点（动手前先读这几段）

没有 3D / shader；图形全部走 Canvas 2D 和内联 SVG，引擎集中在 `src/lib/tool.js`：

- **分享即后端（Tool.share）**：整份试卷 JSON 经 CompressionStream deflate 后 base64url 编码进 URL hash，链接本身就是服务器；载荷首字符是打包格式版本，解码端按前缀分流。
- **成绩单海报（Tool.poster）**：Canvas 2D 画一张 1080 宽的设计稿 —— 先 `document.fonts.ready` 等字体，再「先量后画」两遍布局；种子化噪点颗粒、左侧强调色书脊、章节条形图；画完以 `<img>` 展示（iOS 长按保存）。
- **撒花（Tool.confetti）**：全屏 canvas 粒子，dpr 感知，重力加速 + 用 cos 缩高度模拟纸片翻飞。
- **音效（Tool.sound）**：WebAudio 双振荡器合成 pop/err/ding/win，没有音频资源文件；所有调用都有兜底，无声设备上静默降级。
- **存储（Tool.store）**：localStorage 全部包 guard（隐私模式每次调用都会抛错）。
- **计时（Tool.timer）**：rAF 而不是 setInterval，后台标签页被节流也不丢时间。
- **主题（kit.js）**：`data-theme` + localStorage + 广播事件三件套。kit.js 里另有一套给仪表盘用的 ECharts 辅助，本站没用到（要用得先装 echarts）。
- 图标全是内联 SVG path（kit.js 的 ICON 表，外加 App.tsx 顶部两枚）。

样式约定：kit.css 已占用的类名（bar / btn / chip / panel / screen / seg / sheet / tag 等）不要拿来命名新组件；层级靠墨色 alpha 区分，不要新调灰色；强调色只有一枚，只花在当前项和主操作上。
