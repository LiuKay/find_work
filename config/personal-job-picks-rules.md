# 个人岗位筛选目录规则

适用范围：`personal/` 目录下的所有个人岗位筛选任务。

## 目录约定

- 以后凡是“针对个人”的岗位筛选结果，不再默认写入 `job-picks/`。
- 一律写入 `personal/<folder>/` 下面，其中 `<folder>` 由用户在当次任务里明确提供。
- 例如：用户说这次放到 `p1`，则本次所有个人岗位相关文件都放到 `personal/p1/`。

## 输出文件约定

- 个人岗位筛选 Markdown 报告：写到 `personal/<folder>/YYYY-MM-DD-<topic>.md`
- 个人岗位筛选临时或最终 JSON：写到 `personal/<folder>/`
- 个人岗位筛选专用去重文件：写到 `personal/<folder>/seen-jobs.tsv`

## 去重与坏链规则

- 个人岗位筛选的去重，优先使用 `personal/<folder>/seen-jobs.tsv`
- 不要把个人岗位筛选结果追加到公共 `job-picks/seen-jobs.tsv`
- `bad links` 继续优先读取公共共享文件：
  - `/Users/kaybee/Documents/github/find_work/job-picks/bad-links.tsv`

## 交互约定

- 用户下次做个人岗位筛选时，会直接提供 `personal` 下的子文件夹名字
- 如果用户已经给出子文件夹名字，就直接按该目录执行
- 如果用户明确说是个人筛选，但没有给目录名，再补问一次目录名

## 当前已知示例

- `personal/p1/`：用于 2026-06-12 这轮客户成功 / 项目协调 / 订单管理 / 项目管理相关个人筛选
