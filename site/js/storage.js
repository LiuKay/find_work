(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FindWorkStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "findWorkStateV1";
  const VERSION = 1;
  const RECENT_JOB_LIMIT = 20;

  function defaultState() {
    return {
      version: VERSION,
      bookmarkedJobIds: [],
      recentJobs: [],
      recentIssues: [],
      savedFilters: {},
    };
  }

  function uniqueStrings(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).filter((value) => {
      if (typeof value !== "string" || !value.trim() || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function normalizeRecentJobs(values) {
    const seen = new Set();
    const output = [];
    for (const item of Array.isArray(values) ? values : []) {
      if (!item || typeof item.id !== "string" || !item.id.trim() || seen.has(item.id)) continue;
      const viewedAt = Number(item.viewedAt);
      if (!Number.isFinite(viewedAt) || viewedAt < 0) continue;
      seen.add(item.id);
      output.push({ id: item.id, viewedAt });
      if (output.length === RECENT_JOB_LIMIT) break;
    }
    return output;
  }

  function normalizeRecentIssues(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : [])
      .filter((item) => {
        if (!item || typeof item.id !== "string" || !item.id.trim() || seen.has(item.id)) return false;
        if (!Number.isFinite(Number(item.viewedAt))) return false;
        seen.add(item.id);
        return true;
      })
      .map((item) => ({ id: item.id, viewedAt: Number(item.viewedAt) }))
      .slice(0, RECENT_JOB_LIMIT);
  }

  function normalizeState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      version: VERSION,
      bookmarkedJobIds: uniqueStrings(source.bookmarkedJobIds),
      recentJobs: normalizeRecentJobs(source.recentJobs),
      recentIssues: normalizeRecentIssues(source.recentIssues),
      savedFilters:
        source.savedFilters && typeof source.savedFilters === "object" && !Array.isArray(source.savedFilters)
          ? { ...source.savedFilters }
          : {},
    };
  }

  function browserStorage() {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      return null;
    }
  }

  function readState(storage = browserStorage()) {
    if (!storage || typeof storage.getItem !== "function") return defaultState();
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return normalizeState(JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function writeState(state, storage = browserStorage()) {
    const normalized = normalizeState(state);
    if (!storage || typeof storage.setItem !== "function") return normalized;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      return normalized;
    }
    return normalized;
  }

  function isBookmarked(jobId, storage = browserStorage()) {
    return readState(storage).bookmarkedJobIds.includes(jobId);
  }

  function toggleBookmark(jobId, storage = browserStorage()) {
    if (typeof jobId !== "string" || !jobId.trim()) return readState(storage);
    const state = readState(storage);
    state.bookmarkedJobIds = state.bookmarkedJobIds.includes(jobId)
      ? state.bookmarkedJobIds.filter((id) => id !== jobId)
      : [jobId, ...state.bookmarkedJobIds];
    return writeState(state, storage);
  }

  function addRecentJob(jobId, viewedAt = Date.now(), storage = browserStorage()) {
    if (typeof jobId !== "string" || !jobId.trim()) return readState(storage);
    const timestamp = Number(viewedAt);
    const state = readState(storage);
    state.recentJobs = [
      { id: jobId, viewedAt: Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : Date.now() },
      ...state.recentJobs.filter((item) => item.id !== jobId),
    ].slice(0, RECENT_JOB_LIMIT);
    return writeState(state, storage);
  }

  return {
    RECENT_JOB_LIMIT,
    STORAGE_KEY,
    VERSION,
    addRecentJob,
    defaultState,
    isBookmarked,
    normalizeState,
    readState,
    toggleBookmark,
    writeState,
  };
});
