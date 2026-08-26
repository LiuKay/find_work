const assert = require("assert");
const {
  RECENT_JOB_LIMIT,
  STORAGE_KEY,
  addRecentJob,
  defaultState,
  isBookmarked,
  readState,
  toggleBookmark,
  writeState,
} = require("../site/js/storage");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

const storage = memoryStorage();
assert.deepEqual(readState(storage), defaultState());

const written = writeState(
  {
    version: 99,
    bookmarkedJobIds: ["j_one", "j_one", "", null],
    recentJobs: [{ id: "j_two", viewedAt: 10 }],
    recentIssues: [],
    savedFilters: { workMode: ["APAC 远程"] },
  },
  storage
);
assert.equal(written.version, 1);
assert.deepEqual(written.bookmarkedJobIds, ["j_one"]);
assert.deepEqual(readState(storage), written);

toggleBookmark("j_two", storage);
assert.equal(isBookmarked("j_two", storage), true);
toggleBookmark("j_two", storage);
assert.equal(isBookmarked("j_two", storage), false);
assert.deepEqual(readState(storage).bookmarkedJobIds, ["j_one"]);

for (let index = 0; index < RECENT_JOB_LIMIT + 5; index += 1) {
  addRecentJob(`j_${index}`, index, storage);
}
let recent = readState(storage).recentJobs;
assert.equal(recent.length, RECENT_JOB_LIMIT);
assert.equal(recent[0].id, `j_${RECENT_JOB_LIMIT + 4}`);
assert.equal(recent[recent.length - 1].id, "j_5");

addRecentJob("j_10", 999, storage);
recent = readState(storage).recentJobs;
assert.equal(recent.length, RECENT_JOB_LIMIT);
assert.equal(recent[0].id, "j_10");
assert.equal(recent[0].viewedAt, 999);
assert.equal(recent.filter((item) => item.id === "j_10").length, 1);

const broken = memoryStorage({ [STORAGE_KEY]: "{not valid json" });
assert.deepEqual(readState(broken), defaultState());
const recovered = toggleBookmark("j_recovered", broken);
assert.deepEqual(recovered.bookmarkedJobIds, ["j_recovered"]);
assert.deepEqual(readState(broken).bookmarkedJobIds, ["j_recovered"]);

const throwing = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};
assert.deepEqual(readState(throwing), defaultState());
assert.doesNotThrow(() => writeState(defaultState(), throwing));

console.log("storage self-check passed");
