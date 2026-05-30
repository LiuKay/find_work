---
name: Find Work
description: Small-community job-pick site for China-friendly foreign-company and remote roles.
colors:
  trusted-green: "oklch(35% 0.12 145)"
  trusted-green-soft: "oklch(47% 0.13 145)"
  quiet-canvas: "oklch(96% 0.012 83)"
  paper-surface: "oklch(99% 0.006 83)"
  ink: "oklch(18% 0.025 72)"
  muted-ink: "oklch(47% 0.026 72)"
  line: "oklch(85% 0.02 76)"
  warm-marker: "oklch(87% 0.055 78)"
typography:
  display:
    fontFamily: "ui-serif, Georgia, Times New Roman, Noto Serif CJK SC, Songti SC, serif"
    fontSize: "64px"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "0"
  headline:
    fontFamily: "ui-serif, Georgia, Times New Roman, Noto Serif CJK SC, Songti SC, serif"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "0"
  title:
    fontFamily: "ui-serif, Georgia, Times New Roman, Noto Serif CJK SC, Songti SC, serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "ui-serif, Georgia, Times New Roman, Noto Serif CJK SC, Songti SC, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "38px"
  xxl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.trusted-green}"
    textColor: "{colors.paper-surface}"
    rounded: "{rounded.sm}"
    padding: "0 15px"
    height: "40px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "oklch(92% 0.045 145)"
    textColor: "{colors.trusted-green}"
    rounded: "{rounded.sm}"
    padding: "0 15px"
    height: "40px"
    typography: "{typography.label}"
  card-surface:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "clamp(28px, 5vw, 58px)"
  input-field:
    backgroundColor: "oklch(98.5% 0.006 83)"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "46px"
    typography: "{typography.label}"
---

# Design System: Find Work

## 1. Overview

**Creative North Star: "社群筛选笔记"**

Find Work 的视觉系统应该像一份认真维护的小圈子岗位笔记：实用、克制、有人味。页面不追求招聘平台的规模感，也不追求 landing page 的表演感。它先让读者判断岗位是否值得打开，再让他们继续筛选、归档、填写问卷或查看统计。

当前系统使用暖浅画布、白色纸面、可信绿行动色、serif 阅读字体和 system sans UI 字体。整体密度是舒服的工具密度：信息足够多，但每个面板、列表和表单都有明确边界。圆角保持在 6px 到 16px，阴影柔和但可见，用来承载内容层级，不用来制造装饰。

这个系统明确拒绝传统招聘网站、企业招聘官网、AI 味 landing page、信息很挤的导航站、公众号文章归档页。任何新增界面都必须服务扫描、筛选、提交和阅读，不为风格本身增加负担。

**Key Characteristics:**
- 小范围社群语气，具体、可信、不过度包装。
- 可信绿只用于行动、选中、成功和重点状态。
- 纸面卡片承载阅读和表单，避免页面变成链接堆。
- Serif 负责长内容阅读，system sans 负责导航、标签、按钮、表单和数据。
- 状态反馈短促直接，动效只表达 hover、focus、active、loading、success、error。

## 2. Colors

The palette is a restrained product palette: warm light surfaces, dark readable ink, and one green action color used sparingly.

### Primary
- **可信绿** (`trusted-green`): Primary action, selected state, success emphasis, and brand mark fill. Use it when the user can act or when a state needs clear confidence.
- **软可信绿** (`trusted-green-soft`): Supporting accent for focus rings, decorative marker bars, and progress bars. Use it as a softer companion, not as a second brand color.

### Tertiary
- **温标记色** (`warm-marker`): Small companion accents, currently the offset mark behind the logo and the secondary stripe in the latest panel. Use only as a warm note beside green.

### Neutral
- **安静画布** (`quiet-canvas`): Page background. It can carry the subtle grid texture, but it should not become visually busy.
- **浅纸面** (`paper-surface`): Main content panels, cards, forms, and list surfaces.
- **墨色** (`ink`): Primary text and high-confidence labels.
- **柔墨色** (`muted-ink`): Secondary copy, metadata, nav links, helper text.
- **细分隔线** (`line`): Article separators and subtle section boundaries.

### Named Rules

**The Trusted Green Rule.** 可信绿 is for action and state. Do not spend it on decoration, inactive chips, or section garnish.

**The Paper Before Platform Rule.** Surfaces should read as quiet notes and working sheets, not as marketplace modules. If a screen starts to look like a job board, reduce visual competition before adding color.

## 3. Typography

**Display Font:** `ui-serif, Georgia, "Times New Roman", "Noto Serif CJK SC", "Songti SC", serif`
**Body Font:** `ui-serif, Georgia, "Times New Roman", "Noto Serif CJK SC", "Songti SC", serif`
**Label/Mono Font:** `ui-sans-serif, system-ui, sans-serif`

**Character:** The serif stack gives job notes and long descriptions a human reading texture. The sans stack keeps controls, filters, labels, and admin data familiar and efficient.

### Hierarchy
- **Display** (700, 64px, 0.98): Home and archive hero titles. Use fixed or bounded sizes for product surfaces; do not let headings dominate filtering workflows.
- **Headline** (700, 48px, 1.04): Article titles and major page titles.
- **Title** (700, 24px to 28px, 1.08 to 1.2): Panel titles, filter headers, form sections, stats cards.
- **Body** (400, 17px, 1.85): Job-pick article prose and list detail. Keep long reading blocks comfortable and avoid dense paragraph walls.
- **UI Label** (800, 12px to 15px, system sans): Buttons, form labels, metadata, counts, chips, and nav items.

### Named Rules

**The Split Responsibility Rule.** Serif is for reading and page identity. Sans is for operating the interface. Do not put display serif styling into buttons, filters, admin stats, or form controls.

**The No Tracked Kicker Rule.** Short uppercase kickers can appear sparingly, but letter spacing stays `0`. Do not create repeated tiny tracked eyebrows across every section.

## 4. Elevation

The system uses a hybrid of paper surfaces and soft ambient elevation. Primary panels use one large warm shadow to lift them from the canvas. Smaller interactive rows rely on tonal backgrounds, inset strokes, or very small shadows.

### Shadow Vocabulary
- **Panel Lift** (`0 18px 60px rgba(45, 35, 20, 0.12), 0 2px 8px rgba(45, 35, 20, 0.08)`): Home panels, archive layout, articles, survey hero, and survey panel.
- **Button Hover Lift** (`0 10px 24px rgba(32, 92, 55, 0.22)`): Primary action hover only. It should not appear on resting buttons.
- **Inset Field Stroke** (`inset 0 0 0 1px rgba(77, 64, 43, 0.14), 0 1px 2px rgba(45, 35, 20, 0.06)`): Inputs and selects.
- **Row Lift** (`0 1px 3px rgba(45, 35, 20, 0.1)`): Job result rows.

### Named Rules

**The Resting Paper Rule.** Large content areas may lift softly. Small controls stay mostly flat until the user interacts.

**The No Ghost Card Rule.** Do not combine a decorative 1px border with a wide soft shadow on the same card. Use paper plus shadow, or tonal inset boundaries, not both as decoration.

## 5. Components

### Buttons
- **Shape:** Compact rectangle with gently curved corners (`6px`).
- **Primary:** Trusted green background, paper text, bold sans label, at least `40px` high. Survey submit and admin actions use `46px` high.
- **Hover / Focus:** Hover lifts primary buttons by `-1px` and may add green shadow. Focus uses a 3px OKLCH green outline with offset. Active state scales to `0.96`.
- **Secondary:** Pale green surface with trusted green text. Use for navigation to supporting views, not for destructive or final actions.

### Chips
- **Style:** Metadata chips use pale warm surfaces, dark warm text, bold sans labels, and `6px` radius.
- **State:** Selected choices use pale green background, trusted green text, and an inset 2px green focus/selection ring.

### Cards / Containers
- **Corner Style:** Content panels use `16px`; nested tool panels use `10px`; small rows and chips use `6px`.
- **Background:** Main panels use paper surface. Tool panels use a slightly darker warm surface (`oklch(95% to 96% with low chroma)`).
- **Shadow Strategy:** Use Panel Lift for main reading and form surfaces only.
- **Border:** Prefer inset tonal strokes for filters, stats cards, and fields. Avoid decorative side stripes.
- **Internal Padding:** Large panels use `clamp(28px, 5vw, 58px)` or `clamp(32px, 7vw, 76px)`. Tool panels use `18px` to `24px`.

### Inputs / Fields
- **Style:** Paper-tinted field, no visible border, inset warm stroke, `6px` radius, bold sans value text.
- **Focus:** 3px green outline with 2px offset. Do not rely on color fill alone.
- **Error / Disabled:** Error status uses warm red text and a pale red background. Disabled actions lower opacity and keep the same shape.

### Navigation
- **Style:** Top navigation is a compact system-sans row. Links are muted by default and become pale paper-backed on hover.
- **Mobile:** Header stacks vertically. Nav links stretch evenly across the width with a pale paper-backed surface.
- **Brand mark:** A square trusted-green mark with paper text and warm offset shadow. Keep it compact and avoid replacing it with a decorative logo system.

### Job Result Rows
- **Style:** Three-column layout on desktop: main role, metadata, actions. Collapse to one column on mobile.
- **Purpose:** Let readers judge fit before opening a job. Keep labels compact and scannable.
- **Actions:** Use equal-width action buttons on mobile so touch targets remain clear.

### Survey And Admin Status
- **Status blocks:** Use tonal backgrounds with bold sans text. Success uses pale green plus trusted green. Error uses pale red plus dark red.
- **Stats cards:** Use warm tool-panel backgrounds and inset boundaries. Bars use trusted green, not a multicolor chart palette.

## 6. Do's and Don'ts

### Do:
- **Do** keep Find Work feeling like a `社群筛选笔记`: practical, restrained, and human.
- **Do** use 可信绿 for primary actions, selected choices, success states, focus rings, and stats bars.
- **Do** keep job-fit signals visible early: role direction, work mode, language, experience, application barrier, and China applicability.
- **Do** preserve keyboard-visible focus states on links, buttons, filters, fields, and article links.
- **Do** use serif for long-form job-pick reading and system sans for controls, labels, filters, and admin data.
- **Do** collapse multi-column job rows and forms into single-column mobile layouts at narrow widths.

### Don't:
- **Don't** make the site look like a traditional job board.
- **Don't** make it look like an enterprise recruiting site.
- **Don't** use AI 味 landing page patterns: oversized hero claims, generic SaaS copy, decorative stats blocks, or template card grids.
- **Don't** turn archives into an information-crowded directory or navigation station.
- **Don't** make pages feel like a WeChat article archive.
- **Don't** add gradient text, glass cards, wide decorative borders, repeating stripe backgrounds, or large rounded cards above `16px`.
- **Don't** use color to decorate inactive states. If the reader cannot act on it or learn state from it, keep it neutral.
