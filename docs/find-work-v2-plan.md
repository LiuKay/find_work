# Find Work v2 总体规划方案

> 状态：已定稿，待按阶段实施
> 日期：2026-07-23
> 相关：`PRODUCT.md`、`DESIGN.md`、`scripts/build-site.js`、`.agents/skills/daily-job-picks/`

---

## 1. 一句话目标

把站点从 **「每日 10 条精选笔记」**，升级为 **「每日上新 + 近 N 天已验证可投库」**。

- **对内**：扩大发现与标注产能（宽抓取、粗标、去重、验链）。
- **对外**：仍保持小社群精选信任与判断质量。
- **明确不做**：传统招聘聚合站 / 全量 job board / 按 ATS 平台逛库。

---

## 2. 现状与问题

### 2.1 当前数据流

```
job-picks/*.md                 ← 主数据源（每日精选）
job-picks/*-final-jobs.json    ← 可选：补 application_barrier / china_applicability
        │
        ▼
scripts/build-site.js
        │
        ├─ dist/picks/<slug>/     每日详情页
        ├─ dist/index.html        首页
        ├─ dist/archive/          归档 + 前端筛选
        └─ dist/assets/jobs.json  构建产物（归档搜索用）
```

- 页面内容主数据源是 **Markdown**。
- `*-final-jobs.json` 只增强少量结构化字段。
- `dist/assets/jobs.json` 是构建输出，不是源头。

### 2.2 要解决的问题

| 现状问题 | 目标状态 |
|----------|----------|
| 用户只能看「今天这期」，错过往日仍 open 的岗位 | 有滚动可投库，可按条件筛 |
| 产能瓶颈在人工终审，候选过程不落盘 | 宽发现 → 粗标 → 严终审的流水线 |
| 归档页像历史目录，不像可用库存 | `/pool` 成为第二主入口 |
| 问卷/投票有偏好数据，分发弱 | 按画像频道承接 |

---

## 3. 产品边界（全期有效）

1. **公开只展示终审通过岗位**（具备中国可投 / 门槛 / 时差等判断）。
2. **候选池永不进入 `dist/`**。
3. **主浏览轴** = 方向 × 工作方式 × 中国可投 × 门槛 × 语言，**不是**招聘平台。
4. **过期与死链优先于覆盖率**。
5. **每日精选 Markdown 保留**，继续服务社群 / 小红书传播。
6. 技术优先 **静态站 + 构建时 JSON**；有明确痛点再上 D1 存岗位。
7. 品牌语气延续 `PRODUCT.md`：社群筛选笔记，拒绝 marketplace / 目录站观感。

### 3.1 刻意不做

| 不做 | 原因 |
|------|------|
| 全量按 Greenhouse / Lever / Ashby 浏览 | 用户按画像找岗，不按 ATS 逛 |
| 未审候选公开 | 信任是核心资产 |
| 日更 500+ 条 marketplace | 运维与误标风险，同质化 |
| 用户账号 / 站内投递系统 | 超出当前社群规模与维护预算 |
| 默认上岗位 D1 | 静态 JSON 足够；问卷 D1 保持独立 |

---

## 4. 目标架构

```
        发现（宽）              终审（严）              读者（克制）
   ┌─────────────┐        ┌─────────────┐        ┌─────────────────┐
   │ candidates  │ promote│ curated     │ build  │ / 今日上新        │
   │ 50–150/日   │───────►│ active 库存 │───────►│ /pool 可投库      │
   │ 自动标签    │        │ 判断字段齐全 │        │ /channels 画像    │
   │ 不对公      │        │ TTL + 验链  │        │ /picks 每日笔记   │
   └─────────────┘        └─────────────┘        └─────────────────┘
                                 │
                                 │ 每日选 8–12
                                 ▼
                          issues + .md 社群传播
```

### 4.1 数据职责

| 层 | 职责 | 读者可见 |
|----|------|----------|
| `candidates` | 发现、粗标、筛掉原因 | 否 |
| `curated_jobs` | 岗位唯一真相、生命周期 | 仅 `active` 衍生到前端 |
| `issues` + Markdown | 某日编辑叙事与传播 | 是 |

### 4.2 与现状映射

| 现在 | v2 |
|------|-----|
| 搜索时临时候选（agent 上下文） | `data/candidates/` 落盘 |
| `YYYY-MM-DD-final-jobs.json` | 并入 `curated_jobs`（带 status） |
| `YYYY-MM-DD.md` | 仍是期次叙事，可由 curated 渲染 |
| `seen-jobs.tsv` | 升级为 identity + 状态索引（兼容期保留） |
| `dist/assets/jobs.json` | 只含 `status=active` 的 curated |
| `source: Ashby` 等平台字段 | 仅内部 / 次要展示，不作导航 |

### 4.3 建议目录（Phase 2 起）

```
data/
  candidates/
    2026-07-23.ndjson       # 当日发现池，可 gitignore
  curated/
    jobs.ndjson             # 权威岗位库存（一行一岗）
  issues/
    2026-07-23.json         # 期次元数据 + job_ids
job-picks/
  2026-07-23.md             # 对外可读报告（继续生成）
  seen-jobs.tsv             # 兼容期保留
  bad-links.tsv
```

小社群规模下 **NDJSON + 构建脚本** 足够；以后量上来再迁 D1/SQLite。

---

## 5. 信息架构（读者侧）

### 5.1 站点地图

| 路径 | 作用 |
|------|------|
| `/` | 今日上新 + 频道/库入口 + 近期期次 |
| `/pool/` | 近 N 天 active 可投库（主筛选） |
| `/channels/:id/` | 画像快捷入口（预置筛选壳） |
| `/picks/:slug/` | 单日精选详情（笔记感，保留） |
| `/archive/` | 往期精选目录（按日读笔记） |
| `/survey/` | 需求问卷 |
| `/survey-admin/` | 问卷统计（管理） |
| `/about/` | 关于与信任说明 |

### 5.2 导航建议

**最新 | 可投库 | 归档 | 问卷 | 关于**

频道从首页 / 可投库进入，避免主导航过载。

### 5.3 三个读者任务

| 任务 | 入口 | 体验 |
|------|------|------|
| 今天有什么新的 | `/` | 8–12 条今日上新 + 频道入口 |
| 按我的条件找 | `/pool/` | 筛方向/远程/可投/门槛/语言/经验 |
| 我只关心某一类 | `/channels/...` | 预置筛选 + 今日新增角标 |

### 5.4 `/pool/` 页面要点

- 标题示意：近 14 天可投库 · N 个岗位 · 今日 +K
- 筛选项：方向、工作方式、中国可投、门槛、语言、经验、时差友好、关键词、日期
- 排序默认：中国可投把握 ↓，上新/精选时间 ↓
- 卡片露出：岗位、公司、判断标签、一句「适合谁」、来源期次链接、直达申请
- **不做**按 ATS/平台主筛选（来源可作次要折叠信息）

### 5.5 首页结构（Phase 2）

```
今日上新（8–12）
  · 按方向分组的短列表
  · 每条：可投标签 + 一句话适合谁

继续按你的情况看
  · 频道卡片（带今日新增数）
  · 进入可投库

最近精选期次
  · 近 5 天 picks 入口（保留笔记感）
```

### 5.6 频道（Phase 3，按画像不按平台）

| channel_id | 名称 | 预置筛选（示意） |
|------------|------|------------------|
| `low-english` | 低英文友好 | language ∈ 中文/双语，或门槛文案含低英文信号 |
| `ops-cs` | 运营 / 客服 / 客户成功 | direction ∈ 运营,客服,客户成功 |
| `support-tech` | 技术支持 / IT | direction ∈ 技术支持,IT 运营,QA |
| `remote-apac` | 时区友好远程 | work_mode 友好 + timezone_friendly |
| `entry` | 入门 / 低门槛 | experience=入门 或 barrier=低 |
| `china-strong` | 中国可投高把握 | china_applicability=高 |

频道页 = `/pool/?channel=ops-cs` 的语义化壳，**不是**第二套数据库。

---

## 6. 数据模型

### 6.1 Job identity

```
job_id = hash(normalize_url)
       或 hash(company_slug + normalize(title))  # URL 不稳定时
```

现有 `seen-jobs` 的 company+title / url 逻辑保留，落到稳定 `job_id`。

### 6.2 candidates（内部，宽）

```json
{
  "candidate_id": "c_20260723_0a1b",
  "discovered_at": "2026-07-23T08:12:00+08:00",
  "run_id": "public-2026-07-23",
  "title": "Customer Support Specialist",
  "company": "Example",
  "url": "https://jobs.ashbyhq.com/example/...",
  "source": "Ashby",
  "source_group": "ats_ashby_remote",
  "raw": {
    "location_text": "Remote - APAC",
    "snippet": "..."
  },
  "auto_tags": {
    "remote_guess": "apac_remote",
    "direction_guess": "客服",
    "language_guess": "英文",
    "timezone_guess": "ok"
  },
  "pipeline_status": "new|screened_out|promoted|duplicate|bad_link",
  "screen_reason": "timezone>5h",
  "link_check": { "ok": true, "checked_at": "..." }
}
```

规则：每天可入池 50–150 条；**永不**写入 `dist/`；可 gitignore 或只留 7 天便于排障。

### 6.3 curated_jobs（公开库存唯一真相）

在现有 `final-jobs.json` 字段上扩展生命周期：

```json
{
  "job_id": "j_8f3c2a",
  "title": "Junior Project Manager",
  "company": "Canonical",
  "company_platform": "Canonical / Company Careers",
  "url": "https://canonical.com/careers/5861481",
  "source": "Company Careers",

  "job_group": "外企 APAC 岗位",
  "job_direction": "项目管理",
  "work_mode": "APAC 远程",
  "experience": "入门",
  "language": "英文",

  "application_barrier": "低",
  "application_barrier_note": "面向早期职业…",
  "china_applicability": "中",
  "china_applicability_note": "Home Based - APAC…",
  "timezone_judgment": "APAC 工作时段与北京时间匹配…",
  "timezone_friendly": true,
  "best_for": "适合…",
  "notes": "申请题…",

  "status": "active",
  "first_seen_date": "2026-07-23",
  "last_featured_date": "2026-07-23",
  "featured_issue_ids": ["2026-07-23"],
  "last_verified_at": "2026-07-23T10:00:00+08:00",
  "expires_on": "2026-08-06",
  "closed_at": null,
  "close_reason": null,

  "channels": ["entry", "remote-apac"],
  "reviewer": "agent",
  "confidence_of_judgment": "medium"
}
```

#### 字段分层

| 类型 | 字段 | 谁写 |
|------|------|------|
| 事实 | title, company, url, source | 抽取 + 人/agent 核对 |
| 判断 | china_*, barrier_*, timezone_*, best_for | **仅 L3 终审** |
| 生命周期 | status, expires_on, last_verified | 流水线 |
| 分发 | channels, featured_issue_ids | 规则 + 编辑 |

#### 与现有 final-jobs 兼容字段

现有 skill 已输出并应继续保留：

- `title`, `company_platform`, `company`, `job_group`, `job_direction`
- `work_mode`, `experience`, `language`
- `application_barrier`, `application_barrier_note`
- `china_applicability`, `china_applicability_note`
- `timezone_judgment`, `best_for`, `notes`, `url`, `source`

### 6.4 issues（每日精选 = 编辑包装）

```json
{
  "issue_id": "2026-07-23",
  "title": "2026-07-23 外企/海外远程岗位精选",
  "mode": "public",
  "date": "2026-07-23",
  "job_ids": ["j_8f3c2a", "j_91ab..."],
  "intro": "今日偏项目管理与客户成功…",
  "stats": { "count": 10, "directions": ["项目管理", "客户成功"] }
}
```

Markdown `job-picks/YYYY-MM-DD.md` 可由 `issues + curated_jobs` 生成，保持现有对外格式。

### 6.5 状态机

```
candidate
  new → screened_out
      → duplicate
      → bad_link
      → promoted ──► curated.status = active

curated
  active ──(验链失败/页面关闭)──► closed
  active ──(超过 expires_on 且未复验)──► expired
  expired ──(复验仍可投)──► active
  closed  默认不可逆（或需人工 reopen）
```

公开站点 **只读 `active`**。`expired` / `closed` 可留数据做统计，不进前端 `jobs.json`。

### 6.6 TTL 策略（可配置）

| 条件 | 建议 |
|------|------|
| 默认在库时长 | **14 天**（`first_seen_date + 14`） |
| 中国可投=高 且 外企中国岗 | **21 天** |
| 合同工 / AI Trainer / 模糊可投 | **7 天** |
| 被精选进今日上新 | 刷新 `last_featured_date`，**不自动延长 TTL** |
| 复验策略 | 对 `active` 中 `last_verified` 超过 3 天的抽检或全检 |

### 6.7 量级目标

| 层 | 每日 / 存量规模 |
|----|-----------------|
| candidates | 50–150 / 日 |
| promote 到 curated | 8–20 / 日 |
| 今日 issue 展示 | 8–12 / 日 |
| pool 总 active | 80–150（约 2 周滚动） |

---

## 7. 信任与展示规则

| 规则 | 原因 |
|------|------|
| 无 `china_applicability` 终审 → 不上线 | 防止自动标错 |
| 「待确认」可进库，但排序靠后、标签醒目 | 诚实 > 漂亮 |
| 卡片必须带来源期次链接 | 保留「人审笔记」感 |
| 直达链接旁不写抓取/ATS 术语 | 延续 skill 对外文案规范 |
| closed 岗位尽快从 pool 消失 | 死链摧毁信任 |
| 申请前以原岗位页面为准 | 固定 footer / 信任文案 |

---

## 8. 成功指标

### 8.1 产品

| 指标 | 基线（现状） | 目标（Phase 2 后） |
|------|--------------|-------------------|
| 读者可检索的有效岗位 | 约等于当日 8–12 | 滚动 **80–150** active |
| 今日上新 | 有（埋在期次里） | 首页独立模块，8–12 条 |
| 按偏好入口 | 弱（仅归档筛） | **4–6 个频道** |
| 死链投诉 | 偶发 | 趋近 0；坏链尽快下架 |

### 8.2 运营

| 指标 | 目标 |
|------|------|
| 每日维护时间 | ≤ 当前精选流程 **+30%** |
| 候选 → 上线转化 | 可统计（promote 率） |
| 「群里还有没有适合我的」 | 下降（被 pool/频道承接） |

### 8.3 质量红线（碰了就停扩量）

- 未终审岗位出现在公开页
- active 中大面积「待确认」且排序靠前
- 周死链反馈明显上升
- 维护时间变成「全职运维招聘站」

---

## 9. 分阶段实施

### Phase 0 — 对齐与冻结（0.5–1 天）

**目标：** 实现不跑偏。

| 交付物 | 说明 |
|--------|------|
| 本方案定稿 | 即本文档 |
| curated 字段字典 v1 | 见 §6.3 |
| 公开/内部字段清单 | 哪些进站、哪些仅日志 |

**退出条件：** 字段与「不做列表」无争议。

---

### Phase 1 — 库存化归档（最小可用，3–5 天）

**目标：** 用户立刻感到「不是只有今天 10 条」；**尽量少改生产 skill**。

#### 做什么

1. 构建时合并近 **14 天** `job-picks/*-final-jobs.json`（无 json 则从 md 解析，兼容现状）。
2. 新增 **`/pool/`**（可投库主筛选页）。
3. `jobs.json` 增加：`first_seen_date` / `last_featured_date` / `issueSlug` 等。
4. **TTL：** 默认只展示最近 14 天出现过的岗位（先按 date，暂不引入完整状态机）。
5. 首页增加：**可投库入口 + 近 14 天规模提示**。
6. `/archive/` 定位回调：**往期精选目录**。

#### 不做什么

- 不落 candidates 盘
- 不改每日搜索主流程
- 不上完整频道体系
- 不自动复验链接

#### 涉及文件（预估）

| 文件 | 变更 |
|------|------|
| `scripts/build-site.js` | 多日合并、pool 页渲染、jobs.json 字段扩展 |
| `site/pool.js`（新建）或扩展 `site/archive.js` | 可投库前端筛选 |
| `site/styles.css` | pool / 导航样式 |
| `README.md` | 补充数据流与 `/pool` 说明 |

#### 退出条件

- [ ] `npm run build` 后 pool 能筛出跨多日岗位
- [ ] 无 json 的日期不拖垮构建
- [ ] 旧 picks 页、问卷不受影响
- [ ] 导航可进入可投库

#### 风险与缓解

| 风险 | 缓解 |
|------|------|
| 往日岗位已关闭仍展示 | 文案强调「以原页为准」；Phase 2 上验链 |
| md/json 字段不一致 | 合并策略：json 补判断字段，md 保底解析 |

---

### Phase 2 — 生命周期与首页改版（4–7 天）

**目标：** 库存可信、首页像编辑台。

#### 做什么

1. 引入 `data/curated/jobs.ndjson`（或等价）作为权威库存。
2. 状态：`active | expired | closed`。
3. 每日流程增加：
   - 新精选 **promote → active**
   - **复验** 库内过期将至或 N 天未验的链接
   - 失败 → `closed`；超 TTL 未复验 → `expired`
4. 构建 **只打包 active**。
5. 首页：**今日上新 / 继续按情况看 / 最近期次**。
6. skill 输出：写 md 的同时 **upsert curated**（脚本化，减少双写错误）。

#### 涉及文件（预估）

| 文件 | 变更 |
|------|------|
| `data/curated/jobs.ndjson` | 权威库 |
| `scripts/curated_jobs.py`（或 js） | append/upsert/expire |
| skill `format_daily_picks.py` 等 | 终审结果 upsert |
| `scripts/build-site.js` | 从 curated 读 active |
| 首页模板 | 今日上新模块 |

#### 退出条件

- [ ] 关闭岗位不再进 pool
- [ ] 今日上新与 issue 的 job 列表一致
- [ ] 一日运维 checklist 可在一页纸跑完

---

### Phase 3 — 频道 + 产能可观测（5–8 天）

**目标：** 按画像分发；内部知道「漏在哪」。

#### 做什么

1. 落地 4–6 个频道（预置筛选）。
2. `/channels/:id/` 或 `/pool/?channel=`。
3. **candidates 落盘**（可 gitignore）：发现量、筛掉原因、promote 率。
4. 与现有 `seen-jobs` / `bad-links` 对齐到 `job_id`。
5. 问卷结果 → 「推荐你去看的频道」（静态映射即可）。

#### 退出条件

- [ ] 至少 4 个频道预置筛选正确
- [ ] 能回答：今天发现多少、留下多少、为什么刷掉

---

### Phase 4 — 可选增强（有触发条件再开）

| 项 | 触发条件 |
|----|----------|
| 岗位数据进 D1 | 多人协作写库，或 active > 300 且文件难维护 |
| 邮件/企微按偏好推送 | 社群明确要求订阅 |
| 轻量「我收藏」 | 浏览器 localStorage 足够则不必上账号 |
| 更激进自动发现 | Phase 1–3 指标健康且维护时间仍可控 |

**默认不排期：** 用户系统、投递追踪、按 ATS 导航、公开候选池。

---

## 10. 时间线（示意）

```
Week 1        Phase 0 + Phase 1（pool 可用）
Week 2        Phase 2 前半（curated + 状态）
Week 3        Phase 2 后半 + 首页 + 复验
Week 4        Phase 3 频道 + candidates 统计
之后          按指标决定 Phase 4
```

单人兼职可按 **1.5–2×** 拉长。**先上 Phase 1 即可验证价值。**

---

## 11. 标准一日工作流（Phase 2 后）

```
1. 校验 source config
2. 宽搜 → candidates（记录）
3. 去重 / 坏链 / 硬规则
4. 终审 8–20 条 → upsert curated (active)
5. 组今日 issue 8–12 → 写 md + issue 元数据
6. 批验库内需复验岗位 → closed / 续期
7. expire 超期未验
8. npm run build → 部署 Cloudflare Pages
9. （可选）发社群/小红书用 md
```

- **技能层**（`daily-job-picks`）：判断与精选。
- **工程层**：库存、过期、建站、频道。

---

## 12. 技术改造总表

| 区域 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| `scripts/build-site.js` | 合并多日、pool 页 | 只读 active curated | channels 页 |
| `site/*` 前端 JS | pool 筛选 | 排序/标签增强 | channel 预置 |
| `job-picks/*.md` | 保持 | 仍生成 | 不变 |
| `*-final-jobs.json` | 继续作输入 | 迁移/同步到 curated | 可淡出双写 |
| skill 脚本 | 不动或小改 | format 时 upsert | candidates 写出 |
| Cloudflare Pages | 仍静态 | 仍静态 | 仍静态 |
| D1 | 仅问卷 | 仅问卷 | 仅问卷 |

### 12.1 构建产物（终态）

```
dist/
  index.html
  pool/index.html
  channels/<id>/index.html
  picks/<date>/index.html
  archive/index.html
  assets/
    jobs.json          # 仅 active，供 pool 筛选
    issues.json        # 期次列表
    channels.json      # 频道定义 + 计数
    today.json         # 今日 job_ids 快照（可选）
```

---

## 13. 风险登记

| 风险 | 影响 | 应对 |
|------|------|------|
| 做成大而全聚合站 | 信任崩、运维爆 | 红线指标 + Phase 门禁 |
| 往日岗大量已招满 | 体验差 | Phase 2 验链；文案降预期 |
| md / json / curated 三写不一致 | 脏数据 | 单一写入脚本，md 只读生成 |
| 抓取/合规 | 法律与封禁 | 保持现有公开页访问方式；不扩地下爬虫规模 |
| 范围蔓延 | 做不完 | Phase 4 必须有触发条件 |

---

## 14. 已拍板决策

| 议题 | 决策 |
|------|------|
| 先做 pool 还是先做自动抓更多 | **先 pool（Phase 1）**，产能其次 |
| 权威数据源 | Phase 2 起 **curated**；md 为发布视图 |
| 构建期主输入（Phase 1） | 近 14 天 md + final-jobs 合并 |
| TTL 默认 | **14 天** |
| 是否按平台分类导航 | **否**（仅内部 source 字段） |
| 是否上岗位 D1 | **默认否**，Phase 4 再议 |
| 今日精选是否保留 | **是**，社群传播刚需 |
| 产品形态 | **精选站 + 可投库存**，不是 job board |

---

## 15. 验收总清单（Phase 1–3 完成定义）

- [ ] 读者能在可投库按中国可投/远程/方向/门槛等筛选
- [ ] 库存为滚动 active，默认约 2 周量级
- [ ] 首页有清晰今日上新，不是只有长文
- [ ] 至少 4 个画像频道可用
- [ ] 关闭/过期岗位不出现在公开 JSON
- [ ] 每日 md 精选仍可生成与传播
- [ ] 候选与未审数据不上线
- [ ] 文档写清：数据流、一日 checklist、红线

---

## 16. 执行顺序

1. 确认本方案（已落入本文档）。
2. **Phase 1 工程**：build 合并 + `/pool` + 导航。
3. 用 1–2 周真实读者反馈验证「可投库是否有人用」。
4. 有用再上 **Phase 2 状态机与复验**。
5. 稳定后再上 **Phase 3 频道与 candidates 统计**。
6. Phase 4 一律等触发条件。

---

## 17. 一页纸摘要

| 项 | 内容 |
|----|------|
| 产品形态 | 精选站 + 可投库存，不是 job board |
| 核心能力 | 判断字段可信 × 可检索 × 每日上新 |
| 数据 | candidates（内）→ curated（权威）→ issues/md + 静态站 |
| 节奏 | P0 对齐 → P1 pool → P2 生命周期 → P3 频道 → P4 可选 |
| 量级 | 发现 50–150 / 上新 8–12 / 库存 80–150 |
| 第一优先级 | **Phase 1：近 14 天可投库上线** |

---

## 18. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-07-23 | 初版定稿：总架构、IA、数据模型、分阶段计划、红线与决策 |
