"use strict";

// 每轮结果取决于干预记录；跨轮回保留的观察不会代替本轮实际干预。
const Story = {
  has(id) { return Object.values(GameState.cycleIv).some(items => items.has(id)); },
  motorHeld() { return this.has("motor-held"); },
  captions() {
    if (this.motorHeld()) return [
      "23:40 · 医院来电：工具袋里是待检旧件，不是修好的备用电机。",
      "23:42 · 老周和站内人员核对交接记录，停止临时换件。",
      "23:44 · 现有雨刷仍有故障。末班车宣布停运，不能冒雨出发。",
      "23:46 · 送修件留在医院等待登记，袋上的真实标签没有再被遮住。",
      "23:48 · 车站安排接驳。物品没有进入那条错误的流转路径。",
      "23:50 · 没有雨中提速，没有视线突然丧失，也没有随后那次急刹。",
      "23:52 · 所有人平安。改变的不是谁坐上这班车，而是故障件没有被误装。"
    ];
    return [
      `23:40 · 工具袋经${this.carrier()}交到车站。即使原主人没来，交件安排仍然完成。`,
      "23:42 · 标签背面没有被看清。站内人员把送修旧件误作修好的备用件，临时换上。",
      "23:44 · 换件耽误了发车。老周看着时间，想起晚点要扣补贴。",
      "23:46 · 下坡路段。老周试图追回晚点，车辆开始提速。",
      "23:48 · 旧电机再次间歇停转，雨刷停在玻璃中间。雨水遮住前方弯道，老周仍没及时停车。",
      "23:50 · 老周发现弯道后紧急制动，乘客和没有固定的物品同时向前移动。",
      "23:52 · 视线受阻与赶时间提速叠加，制动未能阻止严重碰撞。工具袋的流转把所有人的命运连在一起。"
    ];
  },
  carrier() {
    if (this.motorHeld()) return "留在医院保管";
    if (!Timeline.offBus.linwan) return "林晚";
    if (!Timeline.offBus.chenbo) return "陈伯代带";
    return "车站取件员";
  },
  update() {
    if (this.has("ledger") && !this.motorHeld()) {
      GameState.cycleIv.linwan.add("motor-held");
      toast("林晚看清待检标签，核对交接单后打电话通知车站：这不是修好的备用件。工具袋留院保管。", 7000);
    }
  },
  describe(prop) {
    if (prop.clue) return { name: prop.name, text: prop.note, status: "观察记录", version: "clue" };
    const changed = this.has(prop.id);
    const exposed = this.has("ledger");
    const descriptions = {
      toolbag: ["旧帆布工具袋", exposed ? "标签已经展开：雨刷电机，间歇停转，待检，禁止装车。袋内是需要送修的旧件。" : "林晚替做过车辆维修的父亲顺路交件。工具袋标签的背面被交接夹压住，只露出车站收件人。", this.motorHeld() ? "已核对，留在医院保管；车站已收到通知" : exposed ? "标签已展开，等待时间恢复后核对" : "标签背面被遮住"],
      ledger: ["交接夹", "压在工具袋标签上的交接夹。露出的纸面只写着收件地点，看不到标签背面。", changed ? "已移开，标签背面露出" : "压住标签"],
      handover: ["交接单", "送修交接：交给车站登记检查，并非交付已修好的备用件。林晚不便时可托陈伯代带；两人都走不开，车站取件员会在 23:35 到门口取件。", "可与袋上标签核对"],
      folder: ["病历夹", "林晚答应交班前整理好病历。桌沿悬着一摞文件，她出门前还会再检查一次。", changed ? "散落，林晚将留下重新整理；工具袋仍可托人代交" : "接近桌沿"],
      wrap: ["干净包布", "陈伯正在找东西包住饭盒。他担心粥漏出来，手边却没有合适的布。", changed ? "包布已递到饭盒旁；他用布包好，收入随身袋" : "放在床头柜边缘"],
      "umbrella-stand": ["门口伞架", "陈伯走出门前回望病房。架上的伞松松靠着，倒下会让他停步收拾并回去向老伴交代。车站步行约十分钟，末班车 23:40 发车。", changed ? "伞散落，陈伯回病房收拾，错过发车" : "松靠在架上"],
      "umbrella-sleeve": ["伞袋架", "医院门口供应长伞袋。取袋口被折角卡住，林晚试过却没取到，湿伞只能直接带走。", changed ? "袋口已疏通，林晚能把湿伞装袋收好" : "取袋口卡住"],
      lunchbox: ["饭盒", "老伴吃不下他煮的粥，陈伯舍不得倒。饭盒扣不牢，平放才能少漏一点。", this.has("wrap") ? "已用包布包好，收入随身袋固定" : "未固定，准备放在脚边"],
      umbrella: ["湿雨伞", "林晚带进车里的长伞。伞上的雨水会顺着伞尖滴到过道。", this.has("umbrella-sleeve") ? "已装入伞袋并收好" : "未套袋，仍在滴水"],
      motor: ["雨刷电机", "工具袋里的旧电机被当成修好的备用件。发车前临时换上后，暴雨中再次间歇停转。", this.motorHeld() ? "留院待检，未装车" : "已随工具袋交到车站，临时装车"],
      wheel: ["驾驶位", "老周必须在雨中判断前方弯道。雨刷失效会遮住视线，赶时间提速让可用的反应距离更短。", this.motorHeld() ? "因雨刷故障停运，等待接驳" : "雨夜行车"]
    };
    const info = descriptions[prop.id] || [prop.name, prop.note || "记忆中的一件物品。", changed ? "已改变" : "尚未改变"];
    return { name: info[0], text: info[1], status: info[2], version: info[2] };
  },
  settle() {
    Timeline.finished = true;
    Timeline.following = null;
    Interaction.unbind();
    hudEl.classList.add("hidden");
    endveilEl.replaceChildren();
    const safe = this.motorHeld();
    const box = el("div", "end-box");
    box.append(el("h2", null, safe ? "真结局 · 末班车停运" : "表面结局 · 事故链未断"));
    box.append(el("p", "ending-summary", safe
      ? "待检标签被看清，送修件留在医院。车站停止临时换件，末班车因雨刷故障停运，乘客改乘接驳车。"
      : `工具袋经${this.carrier()}交到车站，旧电机仍被误装上车。改变乘车名单，并没有改变这件物品的去向。`));
    for (const id of Object.keys(CHARS)) {
      let result;
      if (safe) {
        result = Timeline.offBus[id] ? "留在医院，平安度过这个雨夜。" : "没有乘坐故障车出发，等待接驳，平安。";
        if (!GameState.saved[id]) {
          GameState.saved[id] = true;
          if (id === "chenbo" || id === "linwan") GameState.orbs++;
        }
      } else if (Timeline.offBus[id]) {
        result = id === "linwan" ? "避开乘车事故，却随后赶往事故现场参与救援。尚未真正脱离这场事故。" : "留在医院，却接到代送件者遭遇事故的消息。这个夜晚并未因此平安结束。";
      } else if (id === "chenbo" && this.has("wrap")) {
        result = "饭盒没有滑落，避开一次失衡；但随后严重碰撞仍然发生，命运尚未改变。";
      } else if (id === "linwan" && this.has("umbrella-sleeve")) {
        result = "湿伞已装袋，原本的滑倒没有发生；但随后碰撞仍未被阻止。";
      } else {
        result = CHAR_META[id]?.deathReason || "在这场严重碰撞中遇难，他的记忆仍待调查。";
      }
      box.append(el("p", null, `${CHARS[id].name}：${result}`));
    }
    GameState.recalcCap();
    const attempts = document.getElementById("archive-attempts");
    attempts.querySelector(".empty")?.remove();
    attempts.prepend(el("li", null, safe ? "送修件留院 → 车辆停运 → 平安" : `乘车名单改变：${Object.keys(Timeline.offBus).map(id => CHARS[id].name).join("、") || "无"}；工具袋仍上车。`));
    const buttons = el("div", "end-btns");
    for (const [name, action] of [["开始新的轮回", () => Timeline.startCycle()], ["回到废墟", () => Ruins.build()], ["事故链", () => ChainView.open()]]) {
      const button = el("button", null, name);
      button.addEventListener("click", action);
      buttons.append(button);
    }
    box.append(buttons);
    endveilEl.append(box);
    endveilEl.classList.remove("hidden");
  },
  showChain() {
    ChainView.close();
    const known = this.has("ledger") || [...GameState.foundClues].some(key => key.includes("item:toolbag:") && !key.includes("被遮住"));
    const safe = this.motorHeld();
    const panel = el("div", "chain-panel");
    panel.id = "chainPanel";
    const header = el("header");
    const close = el("button", "chain-close", "×");
    close.setAttribute("aria-label", "关闭事故链");
    close.addEventListener("click", () => ChainView.close());
    header.append(el("strong", null, "物品与事故链"), close);
    const flow = el("div", "chain-flow");
    const observed = known || Timeline.finished || [...GameState.foundClues].some(key => key.includes("item:motor:"));
    const labels = ["暴雨", observed ? "工具袋流转" : "尚未调查的交接", known ? "待检标签被误认" : "标签背面未看清", observed ? "旧电机临时装车" : "？？？", observed ? "雨刷停转 · 视线受阻" : "行车异常", safe ? "停运 · 等待接驳" : "碰撞事故"];
    labels.forEach((label, i) => {
      const node = el("div", "chain-node" + (safe && i > 0 && i < 5 ? " cut" : ""), label);
      flow.append(node);
      if (i < labels.length - 1) flow.append(el("span", "chain-arrow"));
    });
    panel.append(header, flow, el("p", "chain-note", safe ? "关键变化是送修件被留院，并把真实状态通知车站。" : observed ? "人可以不上车，物品仍会换人代交。饭盒和湿伞只解释局部伤害。" : "观察物品与交接记录，尚未发现的环节会在调查后显现。"));
    game.append(panel);
  }
};

const ward = TIMELINE.find(e => e.id === "chenbo-ward");
ward.interactive = true;
ward.props = [{ id: "wrap", name: "干净包布", x: 48, y: 54, sizeW: 90, sizeH: 40, pivotX: 45, pivotY: 38, anim: "slide", interactionType: "slide", threshold: 80, resistance: 0.5, note: "包布滑到饭盒旁。陈伯把饭盒包好，收入随身袋。" }];

const nurse = TIMELINE.find(e => e.id === "linwan-nurse");
nurse.from = 145;
nurse.to = 160;
nurse.time = "23:15";
nurse.clues = [
  { id: "shift", name: "交班延误", x: 48, y: 40, text: "23:15，林晚终于能交班了。末班车 23:40 发车，走到站台约需二十分钟。" },
  { id: "errand", name: "顺路交件", x: 40, y: 44, text: "父亲托她把送修件交给车站登记。她答应下班顺路带去；走不开时，也安排了代交。" }
];
nurse.props = [
  { ...nurse.props.find(p => p.id === "folder"), x: 59, y: 49.5, note: "病历散落，林晚留下重新整理。她把工具袋托人代交，物品没有因此留下。" },
  { id: "toolbag", name: "旧帆布工具袋", x: 78, y: 49.5, sizeW: 120, sizeH: 85, inspectOnly: true },
  { id: "ledger", name: "交接夹", x: 79, y: 46.5, sizeW: 95, sizeH: 45, pivotX: 45, pivotY: 43, anim: "slide", interactionType: "slide", threshold: 100, resistance: 0.9, note: "交接夹移开，标签背面的待检文字露出。时间恢复后，林晚会重新核对。" },
  { id: "handover", name: "交接单", x: 91, y: 49, sizeW: 76, sizeH: 65, inspectOnly: true }
];
const door = TIMELINE.find(e => e.id === "chenbo-door");
door.from = 150;
door.to = 165;
door.time = "23:20";
door.clues = [{ id: "rain", name: "离院时间", x: 38, y: 43, text: "23:20，陈伯准备离院。步行去车站约十分钟。若再回病房收拾一趟，就可能赶不上 23:40 的车。" }];
door.props = [
  { id: "umbrella-stand", name: "门口伞架", x: 48, y: 75, sizeW: 105, sizeH: 140, pivotX: 52, pivotY: 138, anim: "tip", threshold: 100, resistance: 0.12, note: "伞架倾倒。陈伯收拾后回病房交代，错过车；工具袋仍会由别人交走。" },
  { id: "umbrella-sleeve", name: "伞袋架", x: 85, y: 75, sizeW: 85, sizeH: 150, pivotX: 42, pivotY: 148, anim: "slide", interactionType: "slide", threshold: 80, resistance: 0.3, note: "卡住的袋口展开，随后出门的林晚能取到伞袋。" }
];
CHAR_META.chenbo.requires = ["umbrella-stand"];
CHAR_META.linwan.requires = ["folder"];
TIMELINE.find(e => e.id === "chenbo-station").clues[1].text = "他怕饭盒漏汤，准备上车后把它平放在脚边。";
