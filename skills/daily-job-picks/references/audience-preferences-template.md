# Audience Preferences Template

## Purpose

Use this Markdown template for `/Users/kaybee/Documents/github/find_work/config/job-picks-audience-preferences.md`.

The file stays human-editable, but the structure must be fixed enough that a parser can convert it into JSON without relying on open-ended interpretation.

## Template

```markdown
# Job Picks Audience Preferences

本期总数：8

## 岗位方向优先级
- 客服
- 运营
- 内容
- 技术支持

## 工作方式优先级
- 中国本地办公
- 混合办公
- APAC 远程
- 全球远程

英文要求倾向：双语优先
经验阶段倾向：1-3 年优先
申请门槛倾向：低到中优先

## 明确排除
- 公司：Example Company
- 行业：高风险加密货币
- 地域：US-only
- 工作方式：固定美西工时
```

## Allowed Fields

### `本期总数`

- Single-line field
- Integer only
- Optional

### `岗位方向优先级`

- Markdown list
- Each item should be one allowed `岗位方向` label from the skill
- Optional

### `工作方式优先级`

- Markdown list
- Each item should be one allowed `工作方式` label from the skill
- Optional

### `英文要求倾向`

- Single-line field
- Recommended values:
  - `中文优先`
  - `双语优先`
  - `英文可接受`
  - `不限`
- Optional

### `经验阶段倾向`

- Single-line field
- Recommended values:
  - `入门优先`
  - `1-3 年优先`
  - `3-5 年优先`
  - `高级可接受`
  - `不限`
- Optional

### `申请门槛倾向`

- Single-line field
- Recommended values:
  - `低优先`
  - `低到中优先`
  - `中优先`
  - `中到高可接受`
  - `不限`
- Optional

### `明确排除`

- Markdown list
- Each line must start with one of:
  - `公司：`
  - `行业：`
  - `地域：`
  - `工作方式：`
- Optional

## Parsing Rules

- Missing fields are allowed.
- Unknown headings should be ignored with a warning.
- Free-form paragraphs outside the allowed fields should be ignored with a warning.
- If a list item uses an unsupported label, ignore that item and return a warning.
- The file must not be treated as TOML or YAML.

## Authoring Rules

- Keep one field per line for single-value fields.
- Keep one preference per bullet for list fields.
- Do not mix analysis text into list items.
- Do not use this file to override hard safety rules.

## Minimal Example

```markdown
# Job Picks Audience Preferences

本期总数：6

## 岗位方向优先级
- 客服
- 运营

英文要求倾向：双语优先
```
