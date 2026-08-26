(function () {
  "use strict";

  const form = document.querySelector("[data-archive-form]");
  const query = document.querySelector("[data-archive-query]");
  const date = document.querySelector("[data-archive-date]");
  const items = Array.from(document.querySelectorAll("[data-archive-item]"));
  const count = document.querySelector("[data-archive-count]");
  const empty = document.querySelector("[data-archive-empty]");
  if (!form || !query || !date || !items.length) return;

  function render() {
    const search = query.value.trim().toLowerCase();
    const selectedDate = date.value;
    let visible = 0;
    for (const item of items) {
      const matchesSearch = !search || item.dataset.archiveSearchText.includes(search);
      const itemDate = item.querySelector("time")?.dateTime || "";
      const matchesDate = !selectedDate || itemDate === selectedDate;
      item.hidden = !(matchesSearch && matchesDate);
      if (!item.hidden) visible += 1;
    }
    if (count) count.textContent = `${visible} 期`;
    if (empty) empty.hidden = visible !== 0;
  }

  form.addEventListener("input", render);
})();
