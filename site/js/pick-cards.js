(function () {
  "use strict";

  const button = document.querySelector("[data-download-pick-cards]");
  if (!button) return;

  const status = document.querySelector("[data-share-status]");
  const WIDTH = 390;
  const HEIGHT = 844;
  const SCALE = 3;
  let stylesheetTextPromise;

  function setStatus(message) {
    if (!status) return;
    status.textContent = message;
    window.setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 3200);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(value) {
    return Uint8Array.of(value & 255, (value >>> 8) & 255);
  }

  function u32(value) {
    return Uint8Array.of(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
  }

  function concat(chunks) {
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  // ponytail: store-only zip, 10 PNGs do not need deflate
  function zipStore(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const local = concat([
        Uint8Array.of(0x50, 0x4b, 0x03, 0x04),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        name,
        data,
      ]);
      const central = concat([
        Uint8Array.of(0x50, 0x4b, 0x01, 0x02),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]);
      locals.push(local);
      centrals.push(central);
      offset += local.length;
    }
    const centralDir = concat(centrals);
    return concat([
      ...locals,
      centralDir,
      Uint8Array.of(0x50, 0x4b, 0x05, 0x06),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(centralDir.length),
      u32(offset),
      u16(0),
    ]);
  }

  function fileName(index, title) {
    const slug = String(title || "job")
      .replace(/[/\\:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 42);
    return String(index).padStart(2, "0") + "-" + (slug || "job") + ".png";
  }

  function loadStylesheets() {
    if (!stylesheetTextPromise) {
      stylesheetTextPromise = Promise.all(
        ["/assets/styles.css", "/assets/mobile-redesign.css"].map((href) =>
          fetch(href).then((response) => (response.ok ? response.text() : ""))
        )
      ).then((parts) => parts.join("\n"));
    }
    return stylesheetTextPromise;
  }

  function prepareClone(card) {
    const clone = card.cloneNode(true);
    clone.removeAttribute("hidden");
    clone.querySelectorAll(".pick-job-actions, img").forEach((node) => node.remove());
    clone.querySelectorAll("a").forEach((link) => {
      const span = document.createElement("span");
      span.textContent = link.textContent || "";
      link.replaceWith(span);
    });
    return clone;
  }

  function cardMarkup(card) {
    return new XMLSerializer()
      .serializeToString(card)
      .replace(/\sxmlns="http:\/\/www.w3.org\/1999\/xhtml"/g, "");
  }

  async function cardToPng(card, cssText) {
    const clone = prepareClone(card);
    const html =
      '<div xmlns="http://www.w3.org/1999/xhtml" class="pick-card-export-frame">' +
      "<style><![CDATA[" +
      cssText.replace(/]]>/g, "]]]]><![CDATA[>") +
      ".pick-card-export-frame{box-sizing:border-box;width:390px;height:844px;margin:0;padding:16px;display:flex;align-items:center;background:var(--color-canvas,#f4f7f4);font-family:var(--sans);}" +
      ".pick-card-export-frame .pick-job-card{width:100%;max-height:812px;overflow:hidden;box-shadow:none;}" +
      "]]></style>" +
      cardMarkup(clone) +
      "</div>";
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      WIDTH * SCALE +
      '" height="' +
      HEIGHT * SCALE +
      '" viewBox="0 0 ' +
      WIDTH +
      " " +
      HEIGHT +
      '"><foreignObject x="0" y="0" width="' +
      WIDTH +
      '" height="' +
      HEIGHT +
      '">' +
      html +
      "</foreignObject></svg>";
    const image = new Image();
    // ponytail: blob SVG taints canvas in Chromium; data URL does not
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("卡片渲染失败"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH * SCALE;
    canvas.height = HEIGHT * SCALE;
    const context = canvas.getContext("2d");
    context.fillStyle = getComputedStyle(document.body).backgroundColor || "#f4f7f4";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("PNG 导出失败"))), "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  button.addEventListener("click", async () => {
    if (button.getAttribute("aria-busy") === "true") return;
    const cards = Array.from(document.querySelectorAll(".pick-job-card"));
    if (!cards.length) {
      setStatus("这一期没有可下载的岗位卡片");
      return;
    }
    button.setAttribute("aria-busy", "true");
    setStatus("正在导出岗位卡片…");
    try {
      const cssText = await loadStylesheets();
      const files = [];
      for (let index = 0; index < cards.length; index += 1) {
        const card = cards[index];
        const title = card.querySelector("h2")?.textContent || "岗位 " + (index + 1);
        files.push({
          name: fileName(index + 1, title),
          data: await cardToPng(card, cssText),
        });
      }
      const zip = zipStore(files);
      const date = button.dataset.pickDate || "job-cards";
      download(new Blob([zip], { type: "application/zip" }), date + "-job-cards.zip");
      setStatus("岗位卡片已开始下载");
    } catch (error) {
      setStatus("暂时无法导出卡片，请稍后重试");
    } finally {
      button.setAttribute("aria-busy", "false");
    }
  });
})();
