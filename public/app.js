// 원형 일주일 시간표 — circle.py polar 매핑
// 9시 = 북쪽, 시계방향 12시간(9~21), 동심원 7개 = 월(안쪽)~일(바깥쪽)

const START_HOUR = 9;
const TOTAL_HOURS = 12;
const CX = 300;
const CY = 300;
const INNER_BASE_R = 52;
const LAYER_WIDTH = 28;

const STORAGE_KEY = "CIRCULAR_SCHEDULE_ITEMS_V3";
const LEGACY_STORAGE_KEYS = ["CIRCULAR_SCHEDULE_ITEMS_V2"];
const TITLE_STORAGE_KEY = "CIRCULAR_SCHEDULE_TITLE_V3";
const LEGACY_TITLE_KEYS = ["CIRCULAR_SCHEDULE_TITLE_V2"];

const DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const DAY_SHORT = ["월", "화", "수", "목", "금", "토", "일"];
const PALETTE = ["#FF6B6B", "#51CF66", "#ADB5BD", "#FCC419", "#B197FC", "#339AF0", "#F06595", "#FF922B", "#00008B"];

const SAMPLE_ITEMS = [
  sample("학교수업", 10, 14, [0, 1, 2, 3, 4], "#FF6B6B"),
  sample("폴리영어", 14, 16.33, [0, 1, 2, 3, 4], "#51CF66"),
  sample("아담리즈", 11.5, 13.33, [5], "#ADB5BD"),
  sample("아담리즈", 16.66, 18.5, [1], "#ADB5BD"),
  sample("수영", 14, 15, [5], "#FCC419"),
  sample("수영", 18, 19, [2], "#FCC419"),
  sample("합창", 10, 11.5, [5], "#B197FC"),
  sample("합창", 17, 18.5, [3], "#B197FC"),
  sample("체육", 16.33, 17.33, [4], "#339AF0"),
  sample("발레", 18, 19, [4], "#F06595"),
  sample("피아노", 18, 19, [0], "#FF922B"),
  sample("피아노", 18.5, 19.5, [3], "#FF922B"),
  sample("미술", 17, 18, [0], "#00008B"),
  sample("한글", 16.33, 17.33, [2], "#FF922B")
];

let supabase = null;
let currentUser = null;
let currentScheduleId = null;
let items = [];
let selectedItemId = null;
let editingId = null;

function sample(title, start, end, days, color) {
  return { id: `sample-${title}-${start}-${days.join("")}`, title, start, end, days, color };
}

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function uniqueSortedDays(days) {
  return [...new Set((days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
}

function rangeDays(from, toExclusive) {
  const days = [];
  for (let d = from; d < toExclusive; d += 1) days.push(d);
  return days;
}

function consecutiveRanges(days) {
  const sorted = uniqueSortedDays(days);
  const ranges = [];
  sorted.forEach((day) => {
    const last = ranges[ranges.length - 1];
    if (last && day === last.end) last.end = day + 1;
    else ranges.push({ start: day, end: day + 1 });
  });
  return ranges;
}

function formatDaysLabel(days) {
  const ranges = consecutiveRanges(days);
  if (!ranges.length) return "요일 없음";
  return ranges.map((range) => {
    const a = DAY_SHORT[range.start];
    const b = DAY_SHORT[range.end - 1];
    return a === b ? a : `${a}~${b}`;
  }).join(", ");
}

function decToTimeStr(dec) {
  const total = Math.round(Number(dec) * 60);
  const h = Math.floor(total / 60);
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeStrToDec(str) {
  if (!str) return NaN;
  const parts = String(str).split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1] || 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h + m / 60;
}

const MINUTE_STEP = 10;
const TIME_MIN = START_HOUR * 60;
const TIME_MAX = (START_HOUR + TOTAL_HOURS) * 60;

let startMinutes = 10 * 60;
let endMinutes = 11 * 60 + 30;

function minsToDec(mins) {
  return mins / 60;
}

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

function ensureOptionExists(selectEl, mins) {
  const strVal = String(mins);
  for (let i = 0; i < selectEl.options.length; i += 1) {
    if (selectEl.options[i].value === strVal) return;
  }
  const opt = document.createElement("option");
  opt.value = strVal;
  opt.textContent = decToTimeStr(mins / 60);
  let inserted = false;
  for (let i = 0; i < selectEl.options.length; i += 1) {
    if (Number(selectEl.options[i].value) > mins) {
      selectEl.insertBefore(opt, selectEl.options[i]);
      inserted = true;
      break;
    }
  }
  if (!inserted) selectEl.appendChild(opt);
}

function syncTimeDropdowns() {
  const startSel = $("select-start");
  const endSel = $("select-end");
  if (!startSel || !endSel) return;

  ensureOptionExists(startSel, startMinutes);
  ensureOptionExists(endSel, endMinutes);

  startSel.value = String(startMinutes);
  endSel.value = String(endMinutes);

  const duration = endMinutes - startMinutes;
  const durationEl = $("time-duration");
  if (durationEl) {
    durationEl.textContent = duration > 0 ? formatDuration(duration) : "시간 확인 필요";
  }
}

function setTimeRange(startDec, endDec) {
  startMinutes = Math.max(TIME_MIN, Math.min(TIME_MAX, Math.round(Number(startDec) * 60)));
  endMinutes = Math.max(TIME_MIN, Math.min(TIME_MAX, Math.round(Number(endDec) * 60)));
  if (startMinutes >= endMinutes) {
    endMinutes = Math.min(TIME_MAX, startMinutes + 60 <= TIME_MAX ? startMinutes + 60 : startMinutes + MINUTE_STEP);
  }
  syncTimeDropdowns();
}

function setupTimeDropdowns() {
  const startSel = $("select-start");
  const endSel = $("select-end");
  if (!startSel || !endSel) return;

  startSel.innerHTML = "";
  endSel.innerHTML = "";

  for (let mins = TIME_MIN; mins <= TIME_MAX; mins += MINUTE_STEP) {
    const timeStr = decToTimeStr(mins / 60);
    const optStart = document.createElement("option");
    optStart.value = String(mins);
    optStart.textContent = timeStr;
    startSel.appendChild(optStart);

    const optEnd = document.createElement("option");
    optEnd.value = String(mins);
    optEnd.textContent = timeStr;
    endSel.appendChild(optEnd);
  }

  startSel.addEventListener("change", (event) => {
    startMinutes = Number(event.target.value);
    if (endMinutes <= startMinutes) {
      endMinutes = Math.min(TIME_MAX, startMinutes + 60 <= TIME_MAX ? startMinutes + 60 : startMinutes + MINUTE_STEP);
    }
    syncTimeDropdowns();
  });

  endSel.addEventListener("change", (event) => {
    endMinutes = Number(event.target.value);
    if (startMinutes >= endMinutes) {
      startMinutes = Math.max(TIME_MIN, endMinutes - 60 >= TIME_MIN ? endMinutes - 60 : endMinutes - MINUTE_STEP);
    }
    syncTimeDropdowns();
  });

  syncTimeDropdowns();
}

function normalizeItem(item, idx) {
  let days = [];
  if (Array.isArray(item.days) && item.days.length) {
    days = uniqueSortedDays(item.days);
  } else if (typeof item.dayIdx === "number") {
    days = [Math.max(0, Math.min(6, item.dayIdx))];
  } else if (typeof item.innerLvl === "number" && typeof item.outerLvl === "number") {
    const inner = item.innerLvl;
    const outer = item.outerLvl;
    if (inner >= 1 && outer > inner) {
      days = rangeDays(inner - 1, outer - 1);
    } else {
      days = rangeDays(inner, outer);
    }
  }
  if (!days.length) days = [0];

  const start = Number(item.start);
  const end = Number(item.end);
  return {
    id: item.id || `item-${Date.now()}-${idx || 0}`,
    title: item.title || "활동",
    start: Number.isFinite(start) ? start : 9,
    end: Number.isFinite(end) ? end : 10,
    days,
    dayIdx: days[0],
    innerLvl: days[0],
    outerLvl: days[days.length - 1] + 1,
    color: item.color || "#FF6B6B"
  };
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn("localStorage 저장 실패", err);
  }
}

function hourToTheta(hour) {
  const relHour = hour - START_HOUR;
  return (relHour / TOTAL_HOURS) * 2 * Math.PI;
}

function polarToCartesian(theta, r) {
  return {
    x: CX + r * Math.sin(theta),
    y: CY - r * Math.cos(theta)
  };
}

function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== undefined && value !== null) el.setAttribute(key, String(value));
  });
  return el;
}

function createArcPath(startH, endH, innerDay, outerDay) {
  const rIn = INNER_BASE_R + innerDay * LAYER_WIDTH;
  const rOut = INNER_BASE_R + outerDay * LAYER_WIDTH;
  let thetaStart = hourToTheta(startH);
  let thetaEnd = hourToTheta(endH);
  if (thetaEnd <= thetaStart) thetaEnd = thetaStart + 0.02;

  const fullCircle = thetaEnd - thetaStart >= 2 * Math.PI - 1e-6;
  if (fullCircle) thetaEnd = thetaStart + Math.PI * 2 - 0.001;

  const p1 = polarToCartesian(thetaStart, rIn);
  const p2 = polarToCartesian(thetaStart, rOut);
  const p3 = polarToCartesian(thetaEnd, rOut);
  const p4 = polarToCartesian(thetaEnd, rIn);
  const deltaTheta = thetaEnd - thetaStart;
  const largeArc = deltaTheta > Math.PI ? 1 : 0;

  return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${rOut} ${rOut} 0 ${largeArc} 1 ${p3.x} ${p3.y} L ${p4.x} ${p4.y} A ${rIn} ${rIn} 0 ${largeArc} 0 ${p1.x} ${p1.y} Z`;
}

function drawBaseGrid(svg) {
  svg.appendChild(svgEl("rect", {
    x: 0, y: 0, width: 600, height: 600, fill: "#ffffff"
  }));

  for (let i = 0; i <= 7; i += 1) {
    svg.appendChild(svgEl("circle", {
      cx: CX,
      cy: CY,
      r: INNER_BASE_R + i * LAYER_WIDTH,
      fill: "none",
      stroke: "#edf2f7",
      "stroke-width": "1"
    }));
  }

  for (let i = 0; i < 7; i += 1) {
    const rMid = INNER_BASE_R + (i + 0.5) * LAYER_WIDTH;
    const pos = polarToCartesian(hourToTheta(START_HOUR) - 0.18, rMid);
    const label = svgEl("text", {
      x: pos.x,
      y: pos.y,
      fill: "#868e96",
      "font-size": "11",
      "font-weight": "700",
      "font-family": "Noto Sans KR, sans-serif",
      "text-anchor": "middle",
      "dominant-baseline": "central"
    });
    label.textContent = DAY_SHORT[i];
    svg.appendChild(label);
  }

  const outerR = INNER_BASE_R + 7 * LAYER_WIDTH;
  for (let i = 0; i < TOTAL_HOURS; i += 1) {
    const hour = START_HOUR + i;
    const theta = hourToTheta(hour);
    const inP = polarToCartesian(theta, INNER_BASE_R);
    const outP = polarToCartesian(theta, outerR);
    const labelP = polarToCartesian(theta, outerR + 18);

    svg.appendChild(svgEl("line", {
      x1: inP.x, y1: inP.y, x2: outP.x, y2: outP.y,
      stroke: "#dee2e6",
      "stroke-dasharray": "2 2"
    }));

    const tick = svgEl("text", {
      x: labelP.x,
      y: labelP.y,
      fill: "#868e96",
      "font-size": "12",
      "font-weight": "600",
      "font-family": "Noto Sans KR, sans-serif",
      "text-anchor": "middle",
      "dominant-baseline": "central"
    });
    tick.textContent = `${hour}시`;
    svg.appendChild(tick);
  }
}

function renderSchedule() {
  const svg = $("schedule-svg");
  if (!svg) return;
  svg.innerHTML = "";
  drawBaseGrid(svg);

  items.forEach((item) => {
    consecutiveRanges(item.days).forEach((range) => {
      const path = svgEl("path", {
        d: createArcPath(item.start, item.end, range.start, range.end),
        fill: item.color,
        stroke: "#ffffff",
        "stroke-width": "1.5",
        opacity: "0.92",
        style: "cursor:pointer"
      });
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        selectItem(item);
      });
      svg.appendChild(path);

      const duration = item.end - item.start;
      const band = range.end - range.start;
      if (duration < 0.35 && band < 2) return;

      const midTheta = (hourToTheta(item.start) + hourToTheta(item.end)) / 2;
      const midR = INNER_BASE_R + ((range.start + range.end) / 2) * LAYER_WIDTH;
      const textPos = polarToCartesian(midTheta, midR);
      const fontSize = Math.max(9, Math.min(15, 8 + band * 2.2));
      const label = svgEl("text", {
        x: textPos.x,
        y: textPos.y,
        fill: "#ffffff",
        "font-size": String(fontSize),
        "font-weight": "700",
        "font-family": "Jua, Noto Sans KR, sans-serif",
        "text-anchor": "middle",
        "dominant-baseline": "central",
        style: "pointer-events:none"
      });
      label.textContent = item.title;
      svg.appendChild(label);
    });
  });
}

function renderList() {
  const listUi = $("schedule-list-ui");
  $("count-badge").textContent = String(items.length);
  listUi.innerHTML = "";

  if (!items.length) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "schedule-item-empty";
    emptyLi.textContent = "등록된 활동이 없습니다. 위 폼에서 등록하거나 ‘원본 예시 불러오기’를 눌러 보세요.";
    listUi.appendChild(emptyLi);
    return;
  }

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "schedule-item" + (item.id === selectedItemId ? " selected" : "");
    li.innerHTML = `
      <div class="item-info">
        <span class="item-index">${index + 1}</span>
        <span class="badge" style="background:${escapeHtml(item.color)};"></span>
        <span class="day-tag">${escapeHtml(formatDaysLabel(item.days))}</span>
        <strong class="item-title">${escapeHtml(item.title)}</strong>
        <span class="item-time">(${escapeHtml(decToTimeStr(item.start))} ~ ${escapeHtml(decToTimeStr(item.end))})</span>
      </div>
      <button type="button" class="btn btn-sm btn-delete-item" data-id="${escapeHtml(item.id)}">삭제</button>
    `;
    li.querySelector(".btn-delete-item").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteItem(item.id);
    });
    li.addEventListener("click", () => selectItem(item));
    listUi.appendChild(li);
  });
}

function refresh() {
  saveLocal();
  renderList();
  renderSchedule();
}

function saveLocal() {
  safeStorageSet(STORAGE_KEY, JSON.stringify(items));
  const titleEl = $("schedule-title");
  if (titleEl) safeStorageSet(TITLE_STORAGE_KEY, titleEl.value);
}

function selectItem(item) {
  selectedItemId = item.id;
  const detailCard = $("detail-card");
  $("detail-text").innerHTML = `<strong>[${escapeHtml(formatDaysLabel(item.days))}] ${escapeHtml(item.title)}</strong> (${escapeHtml(decToTimeStr(item.start))} ~ ${escapeHtml(decToTimeStr(item.end))})`;
  detailCard.style.display = "flex";
  renderList();
}

function fillForm(item) {
  $("input-title").value = item.title;
  setTimeRange(item.start, item.end);
  $("input-color").value = item.color;
  $("color-hex").textContent = item.color;
  setSelectedDays(item.days);
  updateSwatchState();
}

function setEditMode(item) {
  editingId = item ? item.id : null;
  $("form-heading").textContent = item ? "✏️ 활동 수정하기" : "➕ 활동 등록하기";
  $("btn-submit-activity").textContent = item ? "저장" : "➕ 시간표에 등록";
  $("btn-cancel-edit").style.display = item ? "inline-block" : "none";
  if (item) fillForm(item);
}

function deleteItem(id) {
  items = items.filter((it) => it.id !== id);
  if (selectedItemId === id) {
    $("detail-card").style.display = "none";
    selectedItemId = null;
  }
  if (editingId === id) setEditMode(null);
  refresh();
}

function getSelectedDays() {
  return [...document.querySelectorAll(".day-chip.active")].map((btn) => Number(btn.dataset.day));
}

function setSelectedDays(days) {
  const selected = new Set(uniqueSortedDays(days));
  document.querySelectorAll(".day-chip").forEach((btn) => {
    btn.classList.toggle("active", selected.has(Number(btn.dataset.day)));
  });
}

function readFormItem(existingId) {
  const title = $("input-title").value.trim();
  const start = minsToDec(startMinutes);
  const end = minsToDec(endMinutes);
  const days = uniqueSortedDays(getSelectedDays());
  const color = $("input-color").value || "#FF6B6B";

  if (!title) return { error: "활동명을 입력해주세요." };
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { error: "시작/종료 시간을 확인해주세요." };
  if (start >= end) return { error: "종료 시간은 시작 시간보다 늦어야 합니다." };
  if (start < START_HOUR || end > START_HOUR + TOTAL_HOURS) {
    return { error: `시간은 ${START_HOUR}시부터 ${START_HOUR + TOTAL_HOURS}시 사이여야 합니다.` };
  }
  if (!days.length) return { error: "요일을 하나 이상 선택해주세요." };

  return {
    item: normalizeItem({
      id: existingId || `item-${Date.now()}`,
      title,
      start,
      end,
      days,
      color
    })
  };
}

function loadSample() {
  if (items.length && !confirm("현재 시간표를 원본 예시(김연진 시간표)로 바꿀까요?")) return;
  items = SAMPLE_ITEMS.map((item, idx) => normalizeItem({ ...item, id: `sample-${idx}` }, idx));
  $("schedule-title").value = "김연진의 하루 시간표 (9시~21시)";
  selectedItemId = null;
  editingId = null;
  $("detail-card").style.display = "none";
  setEditMode(null);
  refresh();
}

async function downloadAsPNG() {
  renderSchedule();
  const svg = $("schedule-svg");
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "1100");
  clone.setAttribute("height", "1200");
  clone.setAttribute("viewBox", "0 -70 600 690");

  const title = $("schedule-title").value || "일주일 시간표";
  const titleNode = svgEl("text", {
    x: CX,
    y: -32,
    fill: "#212529",
    "font-size": "22",
    "font-weight": "700",
    "font-family": "Noto Sans KR, sans-serif",
    "text-anchor": "middle"
  });
  titleNode.textContent = title;
  clone.insertBefore(titleNode, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  await document.fonts.ready.catch(() => {});
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1100;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const now = new Date();
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "_",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0")
    ].join("");

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `schedule_${timestamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  image.onerror = () => alert("이미지 저장에 실패했습니다. 브라우저에서 다시 시도해 주세요.");
  image.src = url;
}

const SUPABASE_ESM_CANDIDATES = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  "https://esm.sh/@supabase/supabase-js@2"
];

async function ensureSupabaseLibrary() {
  if (window.supabase && typeof window.supabase.createClient === "function") return true;
  for (const src of SUPABASE_ESM_CANDIDATES) {
    try {
      const mod = await import(src);
      if (mod && typeof mod.createClient === "function") {
        window.supabase = mod;
        return true;
      }
    } catch (err) {
      console.warn("Supabase ESM load failed", src, err);
    }
  }
  return false;
}

async function initSupabase() {
  try {
    const res = await fetch("/api/config");
    const { supabaseUrl, supabaseAnonKey } = await res.json();
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn("Supabase env missing: set SUPABASE_URL and SUPABASE_ANON_KEY on the server");
      return;
    }
    const loaded = await ensureSupabaseLibrary();
    if (!loaded) {
      console.warn("Supabase JS library failed to load");
      return;
    }
    supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) handleUserLogin(session.user);
    supabase.auth.onAuthStateChange((_event, sessionState) => {
      if (sessionState) handleUserLogin(sessionState.user);
      else handleUserLogout();
    });
  } catch (err) {
    console.warn("Local storage fallback mode", err);
  }
}

function loadStoredItems() {
  const raw = safeStorageGet(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(safeStorageGet).find(Boolean);
  if (!raw) return [];
  try {
    return JSON.parse(raw).map(normalizeItem);
  } catch (err) {
    return [];
  }
}

function loadLocalSchedule() {
  items = loadStoredItems();
  const savedTitle = safeStorageGet(TITLE_STORAGE_KEY) || LEGACY_TITLE_KEYS.map(safeStorageGet).find(Boolean);
  if (savedTitle) $("schedule-title").value = savedTitle;
}

async function maybeLoadSharedSchedule() {
  const path = window.location.pathname;
  if (!path.startsWith("/s/") || !supabase) return;
  const shareId = path.split("/s/")[1];
  if (!shareId) return;
  const { data, error } = await supabase.from("schedules").select("*").eq("id", shareId).single();
  if (data && !error) {
    currentScheduleId = data.id;
    $("schedule-title").value = data.title || "나의 일주일 시간표 (9시 ~ 21시)";
    items = (data.items || []).map(normalizeItem);
  }
}

function updateSwatchState() {
  const current = $("input-color").value.toLowerCase();
  document.querySelectorAll(".swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.color.toLowerCase() === current);
  });
}

function setupColorSwatches() {
  const host = $("color-swatches");
  host.innerHTML = "";
  PALETTE.forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.style.background = color;
    btn.dataset.color = color;
    btn.setAttribute("aria-label", color);
    btn.addEventListener("click", () => {
      $("input-color").value = color;
      $("color-hex").textContent = color;
      updateSwatchState();
    });
    host.appendChild(btn);
  });
  updateSwatchState();
}

let isListExpanded = false;

function setListExpanded(expanded) {
  isListExpanded = Boolean(expanded);
  const listUi = $("schedule-list-ui");
  const toggleBtn = $("activity-list-toggle");
  const icon = $("activity-list-icon");
  const card = $("activity-list-card");

  if (listUi) listUi.style.display = isListExpanded ? "flex" : "none";
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", String(isListExpanded));
  if (icon) icon.textContent = isListExpanded ? "▲ 접기" : "▼ 펼치기";
  if (card) card.classList.toggle("expanded", isListExpanded);
}

function setupEvents() {
  const listToggle = $("activity-list-toggle");
  if (listToggle) {
    listToggle.addEventListener("click", () => {
      setListExpanded(!isListExpanded);
    });
    listToggle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setListExpanded(!isListExpanded);
      }
    });
  }

  document.querySelectorAll(".day-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
    });
  });

  $("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const { item, error } = readFormItem(editingId);
    if (error) {
      alert(error);
      return;
    }
    if (editingId) {
      items = items.map((it) => (it.id === editingId ? item : it));
      selectedItemId = item.id;
      setEditMode(null);
    } else {
      items.push(item);
      $("input-title").value = "";
      $("input-title").focus();
    }
    setListExpanded(true);
    refresh();
    if (selectedItemId) {
      const current = items.find((it) => it.id === selectedItemId);
      if (current) selectItem(current);
    }
  });

  $("btn-cancel-edit").addEventListener("click", () => setEditMode(null));
  $("btn-render").addEventListener("click", () => renderSchedule());
  $("btn-load-sample").addEventListener("click", loadSample);
  $("btn-download-png").addEventListener("click", () => {
    downloadAsPNG();
  });

  $("btn-clear-schedule").addEventListener("click", () => {
    if (!items.length) {
      alert("이미 시간표가 비어 있습니다.");
      return;
    }
    if (!confirm("현재 시간표의 모든 활동을 삭제하고 비우시겠습니까?")) return;
    items = [];
    selectedItemId = null;
    $("detail-card").style.display = "none";
    setEditMode(null);
    refresh();
  });

  $("btn-delete-cloud-schedule").addEventListener("click", async () => {
    if (!supabase || !currentUser) return;
    const sel = $("cloud-schedule-select");
    const selectedId = sel.value;
    if (!selectedId) {
      alert("삭제할 클라우드 시간표를 먼저 선택해주세요.");
      return;
    }
    const selectedTitle = sel.options[sel.selectedIndex]?.textContent || "선택한 시간표";
    if (!confirm(`'${selectedTitle}' 시간표를 클라우드에서 정말 삭제하시겠습니까?`)) return;

    const { error } = await supabase.from("schedules").delete().eq("id", selectedId).eq("user_id", currentUser.id);
    if (error) {
      alert("클라우드 시간표 삭제 실패: " + error.message);
      return;
    }
    alert("클라우드 시간표가 삭제되었습니다.");
    if (currentScheduleId === selectedId) {
      currentScheduleId = null;
      window.history.pushState(null, "", "/");
    }
    await loadUserSchedules();
  });

  $("input-color").addEventListener("input", (event) => {
    $("color-hex").textContent = event.target.value;
    updateSwatchState();
  });
  $("schedule-title").addEventListener("input", () => saveLocal());
  $("detail-delete-btn").addEventListener("click", () => {
    if (selectedItemId) deleteItem(selectedItemId);
  });
  $("detail-edit-btn").addEventListener("click", () => {
    const item = items.find((it) => it.id === selectedItemId);
    if (item) setEditMode(item);
  });

  $("btn-share").addEventListener("click", async () => {
    if (!supabase) {
      alert("Supabase 연결이 설정되지 않았습니다. (.env 의 SUPABASE_URL / SUPABASE_ANON_KEY 확인)");
      return;
    }
    const res = await fetch("/api/generate-id");
    const { id } = await res.json();
    const title = $("schedule-title").value;
    const { error } = await supabase.from("schedules").insert({
      id,
      user_id: currentUser ? currentUser.id : null,
      title,
      items,
      is_public: true
    });
    if (error) {
      alert("공유 링크 생성 실패: " + error.message);
      return;
    }
    $("share-url-input").value = `${window.location.origin}/s/${id}`;
    $("share-modal").style.display = "flex";
  });

  $("btn-copy-url").addEventListener("click", async () => {
    const input = $("share-url-input");
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      alert("공유 링크가 복사되었습니다!");
    } catch (err) {
      document.execCommand("copy");
      alert("공유 링크가 복사되었습니다!");
    }
  });
  $("btn-close-share").addEventListener("click", () => {
    $("share-modal").style.display = "none";
  });

  $("btn-login-modal").addEventListener("click", () => {
    if (!supabase) {
      alert("Supabase 연결이 설정되지 않았습니다. 로컬 저장만 사용할 수 있습니다.");
      return;
    }
    $("auth-modal").style.display = "flex";
  });
  $("btn-close-auth").addEventListener("click", () => {
    $("auth-modal").style.display = "none";
  });
  $("btn-do-login").addEventListener("click", async () => {
    if (!supabase) return;
    const email = $("auth-email").value;
    const password = $("auth-password").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("로그인 실패: " + error.message);
    else $("auth-modal").style.display = "none";
  });
  $("btn-do-signup").addEventListener("click", async () => {
    if (!supabase) return;
    const email = $("auth-email").value;
    const password = $("auth-password").value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert("가입 실패: " + error.message);
    else alert("가입 완료! 자동 로그인되었습니다.");
  });
  $("btn-logout").addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
  });
  $("btn-cloud-save").addEventListener("click", async () => {
    if (!currentUser || !supabase) return;
    const title = $("schedule-title").value;
    const res = await fetch("/api/generate-id");
    const { id } = await res.json();
    const { error } = await supabase.from("schedules").insert({
      id,
      user_id: currentUser.id,
      title,
      items,
      is_public: true
    });
    if (error) alert("저장 실패: " + error.message);
    else {
      alert("클라우드에 안전하게 저장되었습니다!");
      loadUserSchedules();
    }
  });

  // ==========================================
  // Pushwing Web Push 모달 및 이벤트 연결
  // ==========================================
  $("btn-open-push-modal").addEventListener("click", async () => {
    $("push-modal").style.display = "flex";
    await updatePushStatusUI();
  });

  $("btn-close-push-modal").addEventListener("click", () => {
    $("push-modal").style.display = "none";
  });

  $("btn-toggle-push-sub").addEventListener("click", async () => {
    if (!pushwingClient) {
      alert("Pushwing 클라이언트를 로드할 수 없습니다.");
      return;
    }
    const status = await pushwingClient.getSubscriptionStatus();
    const btn = $("btn-toggle-push-sub");
    btn.disabled = true;
    btn.textContent = "처리 중...";

    try {
      if (status.subscribed) {
        await pushwingClient.unsubscribe();
        alert("푸시 알림 구독이 해제되었습니다.");
      } else {
        const userId = $("push-user-id").value.trim() || "user-my-schedule";
        await pushwingClient.subscribe(userId);
        alert("🔔 웹 푸시 알림 구독이 완료되었습니다!");
      }
    } catch (err) {
      alert("푸시 알림 설정 실패: " + err.message);
    } finally {
      btn.disabled = false;
      await updatePushStatusUI();
    }
  });

  $("btn-send-test-push").addEventListener("click", async () => {
    const userId = $("push-user-id").value.trim();
    const title = $("schedule-title").value || "나의 일주일 시간표";
    const btn = $("btn-send-test-push");
    btn.disabled = true;
    btn.textContent = "발송 중...";

    try {
      const res = await fetch("/api/v1/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_key: "demo-app-key-2026",
          user_id: userId || null,
          title: `⏰ [시간표 알림] ${title}`,
          body: "잠시 후 등록된 활동 일정이 시작됩니다! (테스트 알림)",
          url: "/"
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.deliveredCount > 0) {
          alert(`✅ 테스트 푸시가 성공적으로 전송되었습니다! (수신 기기: ${data.deliveredCount}대)`);
        } else {
          alert("구독 중인 기기를 찾을 수 없습니다. 먼저 [🔔 웹 푸시 알림 받기]를 완료해 주세요.");
        }
      } else {
        alert("발송 실패: " + (data.error || "알 수 없는 오류"));
      }
    } catch (err) {
      alert("발송 통신 오류: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "🚀 나에게 테스트 푸시 보내기";
    }
  });
}

let pushwingClient = null;

async function initPushwing() {
  if (typeof PushwingClient !== "undefined") {
    pushwingClient = new PushwingClient({
      serverUrl: window.location.origin,
      appKey: "demo-app-key-2026",
      swPath: "/sw.js",
      scope: "/"
    });
    await updatePushStatusUI();
  }
}

async function updatePushStatusUI() {
  if (!pushwingClient) return;
  try {
    const status = await pushwingClient.getSubscriptionStatus();
    const supportEl = $("push-stat-support");
    const permEl = $("push-stat-permission");
    const subEl = $("push-stat-subscribed");
    const toggleBtn = $("btn-toggle-push-sub");

    if (supportEl) supportEl.textContent = status.supported ? "✅ 지원됨" : "❌ 미지원";
    if (permEl) {
      if (status.permission === "granted") permEl.textContent = "✅ 허용됨";
      else if (status.permission === "denied") permEl.textContent = "🚫 거부됨";
      else permEl.textContent = "⏳ 미설정 (동의 필요)";
    }
    if (subEl) {
      subEl.textContent = status.subscribed ? "🔔 수신 중 (구독됨)" : "🔕 미구독";
      subEl.style.color = status.subscribed ? "var(--success)" : "var(--danger)";
    }
    if (toggleBtn) {
      if (status.subscribed) {
        toggleBtn.textContent = "🔕 푸시 알림 구독 해제";
        toggleBtn.className = "btn btn-outline-danger";
      } else {
        toggleBtn.textContent = "🔔 웹 푸시 알림 받기 (구독)";
        toggleBtn.className = "btn btn-primary";
      }
    }
  } catch (e) {
    console.warn("Error updating push status UI:", e);
  }
}

async function checkAdminAccess() {
  const adminBtn = $("btn-admin-panel-link");
  if (!adminBtn) return;
  if (!supabase || !currentUser) {
    adminBtn.style.display = "none";
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.access_token) {
      adminBtn.style.display = "none";
      return;
    }

    const res = await fetch("/api/v1/auth/check-admin", {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const result = await res.json();
    if (result.success && result.isAdmin) {
      adminBtn.style.display = "inline-flex";
    } else {
      adminBtn.style.display = "none";
    }
  } catch (e) {
    adminBtn.style.display = "none";
  }
}

function handleUserLogin(user) {
  currentUser = user;
  $("user-display").textContent = `👤 ${user.email}`;
  $("btn-login-modal").style.display = "none";
  $("btn-logout").style.display = "inline-block";
  $("btn-cloud-save").style.display = "inline-block";
  $("cloud-schedules-bar").style.display = "block";
  const pushUserId = $("push-user-id");
  if (pushUserId && user.email) {
    pushUserId.value = user.email;
  }
  loadUserSchedules();
  checkAdminAccess();
}

function handleUserLogout() {
  currentUser = null;
  $("user-display").textContent = "게스트 모드 (로컬 저장 중)";
  $("btn-login-modal").style.display = "inline-block";
  $("btn-logout").style.display = "none";
  $("btn-cloud-save").style.display = "none";
  $("cloud-schedules-bar").style.display = "none";
  const delBtn = $("btn-delete-cloud-schedule");
  if (delBtn) delBtn.style.display = "none";
  const adminBtn = $("btn-admin-panel-link");
  if (adminBtn) adminBtn.style.display = "none";
}

async function loadUserSchedules() {
  if (!supabase || !currentUser) return;
  const { data, error } = await supabase
    .from("schedules")
    .select("id, title")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (data && !error) {
    const sel = $("cloud-schedule-select");
    const delBtn = $("btn-delete-cloud-schedule");
    sel.innerHTML = `<option value="">-- 내 클라우드 시간표 불러오기 (${data.length}개) --</option>`;
    data.forEach((row) => {
      const opt = document.createElement("option");
      opt.value = row.id;
      opt.textContent = row.title;
      if (currentScheduleId === row.id) opt.selected = true;
      sel.appendChild(opt);
    });
    if (delBtn) {
      delBtn.style.display = sel.value ? "inline-block" : "none";
    }
    sel.onchange = (event) => {
      const id = event.target.value;
      if (delBtn) delBtn.style.display = id ? "inline-block" : "none";
      if (id) window.location.href = `/s/${id}`;
    };
  }
}

async function init() {
  setupTimeDropdowns();
  setupColorSwatches();
  setupEvents();
  loadLocalSchedule();
  renderList();
  renderSchedule();
  await initPushwing();
  await initSupabase();
  await maybeLoadSharedSchedule();
  renderList();
  renderSchedule();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
