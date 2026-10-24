"use strict";

const BusFinale = {
  elapsed: 0,
  beat: -1,
  scene: null,
  reset() {
    this.elapsed = 0;
    this.beat = -1;
    this.scene = null;
    game.classList.remove("finale-impact");
  },
  enter() {
    this.reset();
    Timeline.closeController();
    Interaction.unbind();
    Timeline.following = null;
    Timeline.currentEvent = null;
    Timeline.viewFigure = null;
    Timeline.frozen = false;
    Timeline.viewMode = "ensemble";
    Timeline.clock = 170;
    stageEl.innerHTML = "";
    const scene = el("div", "scene bus-ensemble");
    scene.dataset.background = "bg_bus_inside";
    scene.insertAdjacentHTML("beforeend", sceneSVG("bg_bus_inside"));
    this.scene = scene;
    const absent = ["chenbo", "linwan"].filter(id => Timeline.offBus[id]);
    scene.append(el("div", "bus-attendance", absent.length
      ? "本轮未上车：" + absent.map(id => CHARS[id].name).join("、") + " · 他们留在医院"
      : "同一班车 · 同一个雨夜 · 四个人的命运交汇"));
    const chain = el("div", "bus-beats");
    for (const label of Story.motorHeld() ? ["通知", "核对", "停运", "留院", "接驳", "候车", "平安"] : ["交件", "换件", "发车", "下坡", "雨刷", "制动", "碰撞"]) chain.append(el("span", "bus-beat", label));
    scene.append(chain);
    for (const [id, x] of [["chenbo", 18], ["shuche", 42], ["linwan", 65], ["laozhou", 91]]) {
      if (Timeline.offBus[id]) continue;
      const figure = makeFigure(id, CHARS[id].cssVar, false, id === "linwan" ? null : "bus_" + id);
      figure.classList.add("bus-person");
      figure.style.left = x + "%";
      scene.append(figure);
      const name = el("span", "bus-person-name", CHARS[id].name + (id === "laozhou" ? " · 驾驶" : ""));
      name.classList.add("bus-name-" + id);
      name.style.left = x + "%";
      scene.append(name);
    }
    const wheel = el("div", "bus-wheel");
    wheel.setAttribute("aria-hidden", "true");
    scene.append(wheel);
    if (!Timeline.offBus.chenbo && !Story.has("wrap")) {
      const lunch = el("div", "bus-lunchbox");
      lunch.setAttribute("aria-label", "陈伯脚边的饭盒");
      this.inspect(lunch, { id: "lunchbox", name: "饭盒" });
      scene.append(lunch);
    }
    if (!Timeline.offBus.linwan && !Story.has("umbrella-sleeve")) {
      const umbrella = el("div", "bus-umbrella");
      umbrella.setAttribute("aria-label", "林晚的湿雨伞");
      this.inspect(umbrella, { id: "umbrella", name: "湿雨伞" });
      scene.append(umbrella, el("div", "bus-puddle"), el("div", "bus-grip"));
    }
    if (!Timeline.offBus.linwan && !scene.querySelector(".bus-grip")) scene.append(el("div", "bus-grip"));
    if (!Story.motorHeld()) {
      scene.append(makePropNode({ id: "toolbag", name: "旧帆布工具袋", x: 79, y: 75, sizeW: 95, sizeH: 65, inspectOnly: true }));
      scene.append(makePropNode({ id: "motor", name: "雨刷电机", x: 94, y: 37, sizeW: 80, sizeH: 50, inspectOnly: true }));
    }
    const caption = el("div", "bus-caption");
    caption.setAttribute("role", "status");
    caption.setAttribute("aria-live", "polite");
    scene.append(caption);
    stageEl.append(scene);
    toastEl.classList.remove("show");
    Timeline.buildHud(null);
    hudEl.querySelector(".hud-left strong").textContent = "末班车";
    hudEl.querySelector(".hud-scene").textContent = "共同时刻 · 事故见证";
    pauseBtn.classList.add("hidden");
    this.update();
  },
  tick(dt) {
    if (ItemInfo.isOpen() || Archive.open || ChainView.isOpen()) return;
    if (Timeline.viewMode !== "ensemble") this.enter();
    this.elapsed = Math.min(30, this.elapsed + dt);
    Timeline.clock = 170 + this.elapsed / 2;
    Timeline.syncHud();
    this.update();
    if (this.elapsed >= 30 && !Timeline.finished) Timeline.settle();
  },
  update() {
    const beat = Math.min(6, Math.floor(this.elapsed / 4));
    if (beat === this.beat) return;
    this.beat = beat;
    const delayed = !Story.motorHeld();
    const captions = Story.captions();
    if (delayed && beat === 5) {
      const effects = [];
      if (!Timeline.offBus.chenbo && !Story.has("wrap")) effects.push("饭盒滑向过道，陈伯本能地伸手去抓");
      if (!Timeline.offBus.linwan && !Story.has("umbrella-sleeve")) effects.push("湿伞倾倒，林晚脚下打滑");
      captions[5] += effects.length ? " " + effects.join("；") + "。" : " 过道没有饭盒和湿伞，许澈仍被惯性推向座椅前方。";
    }
    this.scene.querySelector(".bus-caption").textContent = captions[beat];
    this.scene.querySelectorAll(".bus-beat").forEach((node, index) => node.classList.toggle("active", index === beat));
    this.scene.classList.toggle("bus-delayed", delayed);
    this.scene.classList.toggle("bus-running", delayed && beat >= 2 && beat < 6);
    this.scene.classList.toggle("bus-speeding", delayed && beat === 3);
    this.scene.classList.toggle("bus-braking", delayed && beat >= 5);
    this.scene.classList.toggle("bus-collision", delayed && beat >= 6);
    this.scene.classList.toggle("bus-wiper-failed", delayed && beat >= 4);
    this.scene.classList.toggle("bus-stopped", !delayed);
    this.scene.classList.toggle("bus-boarded", beat >= 2);
    let nurse = this.scene.querySelector(".bus-person.linwan");
    if (nurse) {
      if (beat >= 2 && !nurse.dataset.boarded) {
        const standing = makeFigure("linwan", CHARS.linwan.cssVar, false, "bus_linwan");
        standing.classList.add("bus-person");
        standing.dataset.boarded = "true";
        nurse.replaceWith(standing);
        nurse = standing;
      }
      nurse.style.left = (beat < 2 ? 84 : 65) + "%";
      this.scene.querySelector(".bus-name-linwan").style.left = nurse.style.left;
    }
    if (beat >= 5) Timeline.crashPlayed = true;
    game.classList.toggle("finale-impact", delayed && beat === 6);
  },
  inspect(node, prop) {
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", "查看物品：" + prop.name);
    node.tabIndex = 0;
    node.addEventListener("click", () => ItemInfo.open(prop, null, node));
    node.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ItemInfo.open(prop, null, node); }
    });
  }
};
