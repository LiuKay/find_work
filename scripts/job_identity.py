"""Shared stable identity rules for job URLs and fallback metadata."""

from __future__ import annotations

import hashlib
import re
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


TRACKING_KEYS = {
    "gh_src",
    "ref",
    "ref_src",
    "source",
    "src",
    "trk",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
}
GENERIC_PATHS = {"/jobs", "/careers", "/search", "/job-search"}


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().casefold()


def normalize_url(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    parts = urlsplit(raw)
    scheme = parts.scheme.casefold()
    if scheme not in {"http", "https"} or not parts.netloc:
        raise ValueError("job URL must use http or https and include a hostname")
    query = [
        (key, item)
        for key, item in parse_qsl(parts.query, keep_blank_values=True)
        if key.casefold() not in TRACKING_KEYS and not key.casefold().startswith("utm_")
    ]
    path = re.sub(r"/{2,}", "/", parts.path).rstrip("/")
    return urlunsplit((scheme, parts.netloc.casefold(), path, urlencode(sorted(query)), ""))


def stable_url(value: Any) -> bool:
    parts = urlsplit(normalize_url(value))
    path = parts.path.rstrip("/").casefold()
    return bool(path and path not in GENERIC_PATHS)


def identity_key(url: Any, company: Any = "", title: Any = "", location: Any = "") -> str:
    normalized = normalize_url(url)
    if stable_url(normalized):
        return f"url:{normalized}"
    fallback = "|".join(normalize_text(value) for value in (company, title, location))
    if fallback.replace("|", ""):
        return f"fallback:{fallback}"
    raise ValueError("job identity requires a direct URL or company + title")


def stable_job_id(url: Any, company: Any = "", title: Any = "", location: Any = "") -> str:
    digest = hashlib.sha256(
        identity_key(url, company, title, location).encode("utf-8")
    ).hexdigest()[:12]
    return f"j_{digest}"
