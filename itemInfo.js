"use strict";

const ItemInfo = {
  previousFocus: null,
  isOpen() { return !!document.getElementById("item-modal"); },
  close() {
    document.getElementById("item-modal")?.remove();
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  },
  open(prop, event = null, source = null) {
    this.close();
    Interaction.cancel();
    this.previousFocus = source || document.activeElement;
    const info = Story.describe(prop);
    const overlay = el("div", "item-overlay");
    overlay.id = "item-modal";
    const card = el("section", "item-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "item-title");
    card.setAttribute("aria-describedby", "item-description");
    const close = el("button", "item-close", "×");
    close.setAttribute("aria-label", "关闭物品信息");
    close.addEventListener("click", () => this.close());
    const back = el("button", "item-back", Timeline.frozen ? "返回暂停场景" : "返回场景");
    back.addEventListener("click", () => this.close());
    const title = el("h2", null, info.name);
    title.id = "item-title";
    const description = el("p", "item-description", info.text);
    description.id = "item-description";
    const preview = el("div", "item-preview");
    if (source?.querySelector("svg, img")) preview.append(source.querySelector("svg, img").cloneNode(true));
    else preview.insertAdjacentHTML("beforeend", propSVG(prop));
    card.append(close, el("div", "item-kicker", "物品观察 · 时间悬停"), preview, title, description,
      el("p", "item-state", "当前状态：" + info.status),
      el("p", "item-help", Timeline.viewMode === "ensemble"
        ? "查看不消耗灵力 · Esc 关闭。共同记忆只能观察；改变需要发生在前面的记忆里。"
        : "查看不消耗灵力 · Esc 关闭。干预需先暂停，再按住道具向右拖动。"), back);
    overlay.append(card);
    overlay.addEventListener("click", e => { if (e.target === overlay) this.close(); });
    document.body.append(overlay);
    toastEl.classList.remove("show");
    close.focus({ preventScroll: true });
    GameState.addClue(event?.char || "objects", event || { time: clockText(Timeline.clock), name: "末班车" },
      { id: prop.clue ? prop.id : `item:${prop.id}:${info.version}`, name: info.name, text: info.text + "（" + info.status + "）" });
  }
};

window.addEventListener("keydown", e => {
  if (!ItemInfo.isOpen()) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); ItemInfo.close(); }
  if (e.key === "Tab") {
    e.preventDefault();
    const buttons = [...document.querySelectorAll("#item-modal button")];
    const index = buttons.indexOf(document.activeElement);
    buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
  }
}, true);
