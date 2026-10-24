"use strict";

/* ============================================================
 * 《最后一班巴士》数据（平行时间线版 · House 式轮回）
 * 设计变更 D-1：取消“陈伯获救后解锁林晚”，两条线从第一轮起并行流动；
 *              同一时刻只能见证一个人，错过的事件本轮不再提示（玩家决策）。
 * 坐标一律画面百分比；运行时换算 1280×720 游戏像素。
 * ============================================================ */

const CONFIG = {
  BASE_ENERGY: 6,        // 基础灵力
  PAUSE_COST: 2,         // 每次有效暂停消耗
  ENERGY_PER_ORB: 2,     // 每个补充剂提高的灵力上限
  SPIRIT_STIFFNESS: 20,  // 灵体弹簧刚度
  SPIRIT_DAMPING: 5.5,   // 灵体阻尼
  INTERACT_RADIUS: 70,   // 道具可交互距离（游戏像素）
  DRAG_RESISTANCE: 0.12, // 弱力阻力
  DRAG_THRESHOLD: 100    // 完成干预的有效拖动阈值（游戏像素）
};

/* 轮回时钟：20:50 → 23:55，实时流动（ House 式“世界不等你”） */
const CYCLE = {
  label0: "20:50",
  endMin: 185,        // 23:55
  crashMin: 182,      // 23:52 事故时刻
  minPerSec: 3        // 1 真实秒 = 3 游戏分钟（整轮约 62 秒）
};

const CHARS = {
  chenbo:  { name: "陈伯", color: "#f2b84b", cssVar: "--chen" },
  linwan:  { name: "林晚", color: "#b79ce0", cssVar: "--lin" },
  shuche:  { name: "许澈", color: "#4fc4b0", cssVar: "--xu" },
  laozhou: { name: "老周", color: "#e6694a", cssVar: "--zhou" }
};

/* 人物结局判定（v2 判定表） */
const CHAR_META = {
  chenbo: { requires: ["sprinkler"], deathReason: "急刹时饭盒滑落，他失去平衡；随后车辆严重碰撞，他未能生还。" },
  linwan: { requires: ["folder"], deathReason: "急刹时她在水渍上失足；随后车辆严重碰撞，她未能生还。" }
};

/* 全局时刻表：from/to 为“距 20:50 的分钟数”。
 * 同一时间窗重叠的事件 = 只能见证其一（23:30 与 23:40 两处冲突）。
 * 事故发生在末班车车厢里：23:45 起所有命运线收束进 bg_bus_inside，
 * 出事（23:52）时车上的人都在车上，不再散落各处。 */
const TIMELINE = [
  {
    id: "chenbo-ward", char: "chenbo", from: 0, to: 15,
    name: "病房", time: "20:50", bg: "bg_ward.png", charX: 32, charY: 75,
    clues: [
      { id: "lunchbox", name: "饭盒", x: 35, y: 46, text: "老伴吃不下他煮的粥。他舍不得倒，把饭盒带走了。" },
      { id: "umbrella", name: "伞和叮嘱", x: 53, y: 64, text: "老伴叮嘱：外面下雨，别着凉，伞在床头。他点头，却没有拿伞。" }
    ]
  },
  {
    id: "linwan-nurse", char: "linwan", from: 10, to: 30,
    name: "护士站", time: "21:00", bg: "bg_nurse_station.png", charX: 40, charY: 73, interactive: true,
    clues: [
      { id: "shift", name: "交班延误", x: 48, y: 40, text: "急诊连续收治病人，交班被拖延。" },
      { id: "character", name: "认真的人", x: 40, y: 44, text: "她是个认真的人，病历整理好才肯走。" },
      { id: "folder-clue", name: "病历夹", x: 70, y: 43, text: "桌上的病历夹摞得很高，边缘悬在桌外。" }
    ],
    props: [
      { id: "folder", name: "病历夹", img: "prop_folder.png", x: 69, y: 49.5, effective: true,
        anim: "tip", interactionType: "tip", direction: "right",
        note: "病历夹散了一桌。她停下来整理，错过了末班车。",
        threshold: 100, resistance: 0.12, sizeW: 120, sizeH: 90, pivotX: 60, pivotY: 88, anchorDX: -20, anchorDY: -40 },
      { id: "lamp", name: "台灯", img: "prop_lamp.png", x: 56, y: 49, effective: false,
        anim: "flicker", interactionType: "flicker",
        note: "台灯闪了几下。她抬头看一眼，继续赶路。",
        threshold: 80, resistance: 0.15, sizeW: 90, sizeH: 110, pivotX: 45, pivotY: 108, anchorDX: 0, anchorDY: -70 },
      { id: "bell", name: "呼叫铃", img: "prop_bell.png", x: 85, y: 49, effective: false,
        anim: "press", interactionType: "press",
        note: "呼叫铃响了。她去查看病房，耽误了两分钟，仍赶上了车。",
        threshold: 60, resistance: 0.2, sizeW: 70, sizeH: 50, pivotX: 35, pivotY: 48, anchorDX: 0, anchorDY: -20 }
    ]
  },
  {
    id: "chenbo-door", char: "chenbo", from: 80, to: 100,
    name: "医院门口", time: "22:10", bg: "bg_hospital_door.png", charX: 31, charY: 75, interactive: true,
    clues: [
      { id: "rain", name: "下雨", x: 54, y: 42, text: "他站在门口，望着雨，犹豫要不要回去拿伞。" },
      { id: "sprinkler-clue", name: "花洒", x: 66, y: 30, text: "窗台的花洒还在滴水，正对着他要走的路。" }
    ],
    props: [
      { id: "sprinkler", name: "窗台花洒", img: "prop_sprinkler.png", x: 62, y: 41.5, effective: true,
        anim: "tip", interactionType: "tip", direction: "right",
        note: "花洒倾倒，水淋了他一身。他转身回病房擦干、拿伞。",
        threshold: 100, resistance: 0.12, sizeW: 140, sizeH: 130, pivotX: 62, pivotY: 119, anchorDX: -34, anchorDY: -61 },
      { id: "light", name: "走廊灯", img: "prop_light.png", x: 82, y: 20, effective: false,
        anim: "flicker", interactionType: "flicker",
        note: "走廊灯闪了几下。他抬头看一眼，继续走。",
        threshold: 80, resistance: 0.15, sizeW: 110, sizeH: 60, pivotX: 55, pivotY: 58, anchorDX: 0, anchorDY: -30 },
      { id: "dispenser", name: "饮水机", img: "prop_dispenser.png", x: 84, y: 75, effective: false,
        anim: "tip", interactionType: "tip", direction: "right",
        note: "饮水机倒了，水洒了一地。他绕过去，继续走。",
        threshold: 110, resistance: 0.1, sizeW: 100, sizeH: 160, pivotX: 50, pivotY: 158, anchorDX: 0, anchorDY: -90 }
    ]
  },
  {
    id: "chenbo-station", char: "chenbo", from: 160, to: 175,
    name: "站台", time: "23:30", bg: "bg_station.png", charX: 46, charY: 77,
    clues: [
      { id: "habit", name: "乘车习惯", x: 48, y: 72, text: "他总坐第二排，饭盒就放在脚边。" },
      { id: "aisle", name: "过道隐患", x: 70, y: 80, text: "过道很滑，饭盒放得不稳。" }
    ]
  },
  {
    id: "linwan-street", char: "linwan", from: 160, to: 170,
    name: "街道", time: "23:30", bg: "bg_street_rain.png", charX: 46, charY: 78,
    clues: [
      { id: "heel", name: "断裂的鞋跟", x: 52, y: 78, text: "赶往车站时鞋跟断了，她拖着鞋一路小跑。" }
    ]
  },
  {
    id: "linwan-busdoor", char: "linwan", from: 170, to: 180,
    name: "车门", time: "23:40", bg: "bg_bus_inside.png", charX: 52, charY: 76,
    clues: [
      { id: "regular", name: "每晚的常客", x: 36, y: 56, text: "老周认出她是每晚的常客，看了一眼表，决定多等她一会儿。" },
      { id: "umbrella", name: "滴水的雨伞", x: 68, y: 62, text: "她上车后，滴水的雨伞放在了过道上。" }
    ]
  },
  {
    id: "chenbo-bus", char: "chenbo", from: 175, to: 185,
    name: "末班车", time: "23:45", bg: "bg_bus_inside.png", charX: 24, charY: 76,
    clues: [
      { id: "lunchbox-seat", name: "脚边的饭盒", x: 20, y: 64, text: "车开动了。他坐在习惯的第二排，饭盒放在脚边的过道上，随着车身轻轻晃。" }
    ]
  },
  {
    id: "linwan-bus", char: "linwan", from: 180, to: 185,
    name: "车厢", time: "23:50", bg: "bg_bus_inside.png", charX: 62, charY: 76,
    clues: [
      { id: "umbrella-aisle", name: "过道上的雨伞", x: 56, y: 64, text: "她抓着吊环站稳，滴水的雨伞斜靠在过道上。" }
    ]
  }
];

/* 事故链视图数据（v2 §8 / v3 §4.3；阶段 5 接入） */
const ACCIDENT_CHAIN = {
  nodes: [
    { id: "rain",   label: "暴雨路滑", cuttable: false },
    { id: "chief",  label: "站长：晚点要扣补贴", cuttable: false },
    { id: "delay",  label: "林晚卡门，老周多等 4 分钟（晚点）", cuttable: true },
    { id: "speed",  label: "下坡弯道提速", cuttable: true },
    { id: "hidden", label: "？？？", cuttable: false, hidden: true },
    { id: "result", label: "事故结果" }
  ],
  resultBefore: "重大事故：全员遇难",
  resultAfter: "较轻擦撞：仍有人受伤",
  note: "你切断了一环，但事故没有消失，换了一种形式。"
};

/* 工具：分钟数 ↔ 时钟文本（基准 20:50） */
function clockText(min) {
  const total = 20 * 60 + 50 + Math.floor(min);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
