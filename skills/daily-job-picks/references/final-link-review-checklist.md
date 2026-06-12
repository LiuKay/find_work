# Final Link Review Checklist

## Purpose

Use this checklist after `scripts/link_check.py` passes and before a finalist enters the final jobs JSON. The checklist is mandatory for every finalist URL.

The model must fill the checklist using fixed enums. Do not replace the checklist with a free-form explanation.

## Required Shape

```json
{
  "url": "https://example.com/jobs/123",
  "page_type": "exact_job",
  "role_visible": "yes",
  "company_visible": "yes",
  "role_details_visible": "yes",
  "apply_path_visible": "yes",
  "reader_access": "open",
  "result": "pass",
  "notes": "Optional short reader-facing note for internal use only."
}
```

## Allowed Values

### `page_type`

- `exact_job`
- `list`
- `homepage`
- `blocked`
- `wrong_job`
- `closed`

### `role_visible`

- `yes`
- `no`

### `company_visible`

- `yes`
- `no`

### `role_details_visible`

- `yes`
- `no`

### `apply_path_visible`

- `yes`
- `no`

### `reader_access`

- `open`
- `login`
- `paywall`
- `captcha`
- `error`

### `result`

- `pass`
- `reject`

## Mandatory Reject Conditions

Any of the following requires `result = reject`:

- `page_type != exact_job`
- `role_visible = no`
- `company_visible = no`
- `role_details_visible = no`
- `apply_path_visible = no`
- `reader_access != open`

## Reviewer Rules

- Open the actual finalist URL, not only a cached snippet or redirect preview.
- Confirm the visible page itself, not just the browser title.
- If the page loads but only shows a career list, use `page_type = list`.
- If the page belongs to the right company but shows another role, use `page_type = wrong_job`.
- If the role appears closed, archived, expired, or unavailable, use `page_type = closed`.
- If access depends on a sign-in, paid account, CAPTCHA, or broken rendering, reject it.
- For ATS pages, visible role title, company identity, role details, and application path must all be present at the same time.

## Notes Rules

- `notes` is optional.
- If present, keep it to one short sentence.
- Do not mention scraping, ATS quirks, render behavior, or parser behavior.
- Do not let notes override a reject condition.
