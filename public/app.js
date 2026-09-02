// 원형 일주일 시간표 & Google Workspace Migrate 스타일 대시보드 허브
// 9시 = 북쪽, 시계방향 12시간(9~21), 동심원 7개 = 월(안쪽)~일(바깥쪽)

const START_HOUR = 9;
const TOTAL_HOURS = 12;
const CX = 300;
const CY = 300;
const INNER_BASE_R = 52;
const LAYER_WIDTH = 28;

const STORAGE_KEY = "CIRCULAR_SCHEDULE_ITEMS_V3";
const TITLE_STORAGE_KEY = "CIRCULAR_SCHEDULE_TITLE_V3";
const HUB_STORAGE_KEY = "CIRCULAR_SCHEDULE_HUB_V2";

const DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const DAY_SHORT = ["월", "화", "수", "목", "금", "토", "일"];
const SPECTRUM_MAX_HUE = 280;

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

// Initial preset schedules (Public by default)
const DEFAULT_PRESET_SCHEDULES = [
  {
    id: "preset-1",
    title: "김연진의 하루 시간표",
    items: SAMPLE_ITEMS,
    is_public: true,
    user_id: null,
    updatedAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: "preset-2",
    title: "초등 방학 일주일 시간표",
    items: [
      sample("방학특강", 9, 12, [0, 1, 2, 3, 4], "#FF6B6B"),
      sample("점심 & 휴식", 12, 13, [0, 1, 2, 3, 4, 5, 6], "#FCC419"),
      sample("영어캠프", 13, 15.5, [0, 2, 4], "#51CF66"),
      sample("수영교실", 16, 17.5, [1, 3], "#339AF0"),
      sample("자유독서", 18, 19.5, [0, 1, 2, 3, 4], "#B197FC")
    ],
    is_public: true,
    user_id: null,
    updatedAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: "preset-3",
    title: "주간 영어 & 예체능 루틴",
    items: [
      sample("원어민회화", 10, 11.5, [1, 3, 5], "#51CF66"),
      sample("피아노레슨", 15, 16.5, [0, 2, 4], "#FF922B"),
      sample("미술창작", 17, 18.5, [2, 4], "#00008B"),
      sample("스트레칭", 20, 21, [0, 1, 2, 3, 4, 5, 6], "#F06595")
    ],
    is_public: true,
    user_id: null,
    updatedAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: "preset-4",
    title: "직장인 자기계발 & 자격증 루틴",
    items: [
      sample("모닝독서", 9, 10, [0, 1, 2, 3, 4], "#B197FC"),
      sample("코딩프로젝트", 19, 20.5, [0, 1, 2, 3], "#339AF0"),
      sample("주말러닝", 9, 11, [5, 6], "#51CF66")
    ],
    is_public: true,
    user_id: null,
    updatedAt: new Date(Date.now() - 172800000).toISOString()
  }
];

let supabase = null;
let currentUser = null;
let currentUserIsAdmin = false;
let currentScheduleId = "preset-1";
let allSchedules = [];
let items = [];
let selectedItemId = null;
let editingId = null;
let currentFilter = "all";
let activeOpenDropdownId = null;

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

const MINUTE_STEP = 10;
const TIME_MIN = START_HOUR * 60;
const TIME_MAX = (START_HOUR + TOTAL_HOURS) * 60;

let startMinutes = 9 * 60;
let endMinutes = 10 * 60 + 30;

function minsToDec(mins) {
  return Math.round((mins / 60) * 100) / 100;
}

function decToMins(dec) {
  return Math.round(Number(dec) * 60);
}

function formatDurationKorean(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0 && m > 0) return `${h}시간 ${m}분`;
  if (h > 0) return `${h}시간`;
  return `${m}분`;
}

function syncTimeDropdowns() {
  const startSel = $("select-start");
  const endSel = $("select-end");
  const durationBadge = $("time-duration");
  if (!startSel || !endSel) return;

  startSel.value = String(startMinutes);
  endSel.value = String(endMinutes);

  const duration = Math.max(0, endMinutes - startMinutes);
  if (durationBadge) {
    durationBadge.textContent = formatDurationKorean(duration);
  }
}

function setTimeDropdownsFromDec(startDec, endDec) {
  startMinutes = Math.max(TIME_MIN, Math.min(TIME_MAX, decToMins(startDec)));
  endMinutes = Math.max(TIME_MIN, Math.min(TIME_MAX, decToMins(endDec)));
  if (endMinutes <= startMinutes) {
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

// ==========================================
// Multi-Schedule Hub Data Model & Storage
// ==========================================
function loadHubSchedules() {
  try {
    const raw = localStorage.getItem(HUB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        allSchedules = parsed;
        return;
      }
    }
  } catch (e) {}

  allSchedules = JSON.parse(JSON.stringify(DEFAULT_PRESET_SCHEDULES));
  saveHubSchedules();
}

function saveHubSchedules() {
  try {
    localStorage.setItem(HUB_STORAGE_KEY, JSON.stringify(allSchedules));
  } catch (e) {}
}

function getScheduleById(id) {
  return allSchedules.find(s => s.id === id) || allSchedules[0];
}

function calculateScheduleStats(schedule) {
  const sItems = schedule.items || [];
  let totalMins = 0;

  sItems.forEach(item => {
    const duration = Math.max(0, (item.end - item.start) * 60);
    const dayCount = (item.days || [0]).length;
    totalMins += duration * dayCount;
  });

  const totalHours = Math.round((totalMins / 60) * 10) / 10;
  return {
    totalHours,
    itemCount: sItems.length
  };
}

// Mini SVG Thumbnail Generator for each Card
function createMiniSvgThumbnail(sItems) {
  const size = 58;
  const cx = size / 2;
  const cy = size / 2;
  const rBase = 9;
  const lWidth = 2.4;

  let paths = '';
  (sItems || []).forEach(item => {
    const a0 = hourToAngle(item.start);
    const a1 = hourToAngle(item.end);
    const ranges = consecutiveRanges(item.days);

    ranges.forEach(range => {
      const rIn = rBase + range.start * lWidth;
      const rOut = rBase + range.end * lWidth;
      const d = annularSectorPath(cx, cy, rIn, rOut, a0, a1);
      paths += `<path d="${d}" fill="${item.color || '#FF6B6B'}" />`;
    });
  });

  return `
    <svg class="mini-thumb-svg" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${rBase + 7 * lWidth}" fill="#f1f3f4" stroke="#dadce0" stroke-width="0.5" />
      ${paths}
      <circle cx="${cx}" cy="${cy}" r="${rBase - 1}" fill="#fff" stroke="#dadce0" stroke-width="0.5" />
    </svg>
  `;
}

// Load Schedules from Supabase with RLS Isolation
async function loadSchedulesFromSupabase() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from("schedules")
      .select("*")
      .order("created_at", { ascending: false });

    if (data && !error && data.length > 0) {
      const remoteMap = new Map();
      data.forEach(row => {
        remoteMap.set(row.id, {
          id: row.id,
          title: row.title,
          items: Array.isArray(row.items) ? row.items : [],
          is_public: row.is_public !== undefined ? row.is_public : true,
          user_id: row.user_id || null,
          updatedAt: row.updated_at || row.created_at || new Date().toISOString()
        });
      });

      // Retain presets
      allSchedules.forEach(local => {
        if (!remoteMap.has(local.id)) {
          remoteMap.set(local.id, local);
        }
      });

      allSchedules = Array.from(remoteMap.values());
      saveHubSchedules();
      renderDashboard();
    }
  } catch (e) {
    console.warn("[App] loadSchedulesFromSupabase error:", e.message);
  }
}

// Save or Upsert Schedule to Supabase
async function saveScheduleToSupabase(schedule) {
  if (!supabase) return false;
  try {
    const isPublic = schedule.is_public !== undefined ? schedule.is_public : (currentUser ? false : true);
    const userId = schedule.user_id || null;
    if (isPublic && currentUser && !currentUserIsAdmin) return false;
    if (!isPublic && (!currentUser || userId !== currentUser.id)) return false;

    const { error } = await supabase.from("schedules").upsert({
      id: schedule.id,
      user_id: userId,
      title: schedule.title,
      items: schedule.items,
      is_public: isPublic,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn("[App] saveScheduleToSupabase error:", e.message);
    return false;
  }
}

// ==========================================
// Dashboard View & Clean Card Renderer
// ==========================================
function renderDashboard() {
  const grid = $("schedule-card-grid");
  if (!grid) return;

  grid.innerHTML = "";

  // Show/Hide private filter chip depending on login state
  const privateFilterChip = $("chip-filter-private");
  if (privateFilterChip) {
    privateFilterChip.style.display = currentUser ? "inline-block" : "none";
  }

  let baseSchedules = [...allSchedules];

  // If Guest mode (not logged in), strictly exclude any private schedules!
  if (!currentUser) {
    baseSchedules = baseSchedules.filter(s => s.is_public === true || !s.user_id);
  }

  let filtered = [...baseSchedules];

  if (currentFilter === "private" && currentUser) {
    filtered = filtered.filter(s => s.user_id && !s.is_public);
  } else if (currentFilter === "public") {
    filtered = filtered.filter(s => s.is_public || !s.user_id);
  } else if (currentFilter === "name") {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (currentFilter === "items") {
    filtered.sort((a, b) => (b.items || []).length - (a.items || []).length);
  } else if (currentFilter === "recent") {
    filtered.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  const totalActions = filtered.reduce((sum, s) => sum + (s.items || []).length, 0);
  
  const statPillActions = $("stat-pill-actions");
  if (statPillActions) {
    statPillActions.textContent = `Actions: ${totalActions}`;
    statPillActions.title = `현재 목록에 등록된 총 활동(Action) 개수: ${totalActions}개`;
  }

  const statPillCount = $("stat-pill-count");
  if (statPillCount) {
    statPillCount.textContent = `시간표: ${filtered.length}/${baseSchedules.length}`;
    statPillCount.title = `전체 ${baseSchedules.length}개 중 ${filtered.length}개 표시 중`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: #fff; border: 1px dashed var(--g-border); border-radius: var(--g-card-radius); color: var(--g-text-muted);">
        <div style="font-size: 2rem; margin-bottom: 8px;">🗓️</div>
        <div style="font-size: 1rem; font-weight: 600; color: var(--g-text); margin-bottom: 4px;">표시할 시간표가 없습니다.</div>
        <div style="font-size: 0.85rem; margin-bottom: 16px;">상단의 <strong>[+ New]</strong> 버튼을 눌러 새 시간표를 만들어보세요!</div>
        <button type="button" class="btn btn-sm btn-primary" onclick="createNewSchedule()">➕ 새 시간표 생성</button>
      </div>
    `;
    return;
  }

  filtered.forEach(schedule => {
    const stats = calculateScheduleStats(schedule);
    const card = document.createElement("div");
    card.className = "g-schedule-card-clean";
    card.dataset.id = schedule.id;

    const isPrivate = schedule.user_id && !schedule.is_public;
    const isPublic = !isPrivate;
    const canDuplicateOrDelete = isPublic
      ? currentUserIsAdmin
      : Boolean(currentUser && schedule.user_id === currentUser.id);
    const visibilityBadge = isPrivate
      ? `<span style="background:#f3e8ff; color:#7e22ce; font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:10px; border:1px solid #e9d5ff;">🔒 나만 보기 (Private)</span>`
      : `<span style="background:#ecfdf5; color:#047857; font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:10px; border:1px solid #a7f3d0;">🌐 공개 (Public)</span>`;

    const dateStr = schedule.updatedAt ? new Date(schedule.updatedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '방금 전';

    card.innerHTML = `
      <!-- 1. Mini SVG Thumbnail -->
      <div class="card-thumbnail-wrapper" onclick="openScheduleEditor('${schedule.id}')" title="시간표 열기">
        ${createMiniSvgThumbnail(schedule.items)}
      </div>

      <!-- 2. Card Details (Title, Visibility & Items) -->
      <div class="card-details-wrapper" onclick="openScheduleEditor('${schedule.id}')">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
          <div class="card-clean-title" title="${escapeHtml(schedule.title)}">
            ${escapeHtml(schedule.title)}
          </div>
          ${visibilityBadge}
        </div>

        <div class="card-clean-items">
          <span>📋</span>
          <span>활동 <strong>${stats.itemCount}개</strong> 등록됨</span>
        </div>
        <div class="card-clean-meta">
          <span>⏱️ 총 ${stats.totalHours}시간 분량</span>
          <span>•</span>
          <span>수정: ${dateStr}</span>
        </div>
      </div>

      <!-- 3. Horizontal Three Dots (⋯) & Dropdown -->
      <div class="card-menu-container">
        <button type="button" class="btn-horizontal-dots" title="옵션 메뉴" onclick="toggleCardDropdown(event, '${schedule.id}')">
          ⋯
        </button>

        <div id="dropdown-${schedule.id}" class="card-dropdown-menu" style="display:none;">
          ${canDuplicateOrDelete ? `
            <button type="button" class="card-dropdown-item" onclick="duplicateSchedule('${schedule.id}')">
              <span>📋</span>
              <span>복제하기</span>
            </button>
          ` : ''}
          <button type="button" class="card-dropdown-item" onclick="renameSchedule('${schedule.id}')">
            <span>✏️</span>
            <span>이름 변경</span>
          </button>
          ${canDuplicateOrDelete ? `
            <button type="button" class="card-dropdown-item danger" onclick="deleteSchedule('${schedule.id}')">
              <span>🗑️</span>
              <span>삭제하기</span>
            </button>
          ` : `
            <div class="card-dropdown-item" aria-disabled="true" style="cursor:not-allowed; color:var(--g-text-muted);">
              <span>🔒</span>
              <span>복제·삭제는 관리자만 가능</span>
            </div>
          `}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// Window actions for cards
window.openScheduleEditor = function(id) {
  const schedule = getScheduleById(id);
  if (!schedule) return;

  currentScheduleId = schedule.id;
  items = (schedule.items || []).map((item, idx) => normalizeItem(item, idx));
  $("schedule-title").value = schedule.title || "나의 일주일 시간표";
  
  showEditorView();
  renderList();
  renderSchedule();
};

window.toggleCardDropdown = function(event, id) {
  event.stopPropagation();
  const dropdown = $(`dropdown-${id}`);
  if (!dropdown) return;

  const isAlreadyOpen = dropdown.style.display === "flex";
  closeAllDropdowns();

  if (!isAlreadyOpen) {
    dropdown.style.display = "flex";
    activeOpenDropdownId = id;
    const card = dropdown.closest(".g-schedule-card-clean");
    if (card) card.classList.add("menu-open");
  }
};

function closeAllDropdowns() {
  document.querySelectorAll(".card-dropdown-menu").forEach(el => el.style.display = "none");
  document.querySelectorAll(".g-schedule-card-clean").forEach(el => el.classList.remove("menu-open"));
  activeOpenDropdownId = null;
}

document.addEventListener("click", () => {
  closeAllDropdowns();
});

window.duplicateSchedule = function(id) {
  closeAllDropdowns();
  const schedule = allSchedules.find(s => s.id === id);
  if (!schedule) return;

  const isPublic = schedule.is_public === true || !schedule.user_id;
  if (isPublic && !currentUserIsAdmin) {
    return alert("공개 시간표는 관리자만 복제할 수 있습니다.");
  }
  if (!isPublic && (!currentUser || schedule.user_id !== currentUser.id)) {
    return alert("본인의 비공개 시간표만 복제할 수 있습니다.");
  }

  const newSchedule = {
    ...JSON.parse(JSON.stringify(schedule)),
    id: "sched-" + Date.now(),
    title: schedule.title + " (사본)",
    user_id: currentUser ? currentUser.id : null,
    is_public: currentUser ? false : true,
    updatedAt: new Date().toISOString()
  };

  allSchedules.unshift(newSchedule);
  saveHubSchedules();
  saveScheduleToSupabase(newSchedule);
  renderDashboard();
  showStatusMessage(`📋 '${newSchedule.title}' 시간표가 복제되었습니다.`);
};

window.deleteSchedule = async function(id) {
  closeAllDropdowns();
  if (allSchedules.length <= 1) {
    return alert("최소 1개의 시간표는 유지되어야 합니다.");
  }
  const schedule = allSchedules.find(s => s.id === id);
  if (!schedule) return;

  const isPublic = schedule.is_public === true || !schedule.user_id;
  if (isPublic && !currentUserIsAdmin) {
    return alert("공개 시간표는 관리자만 삭제할 수 있습니다.");
  }
  if (!isPublic && (!currentUser || schedule.user_id !== currentUser.id)) {
    return alert("본인의 비공개 시간표만 삭제할 수 있습니다.");
  }

  if (!confirm(`'${schedule.title}' 시간표를 삭제하시겠습니까?`)) return;

  try {
    if (isPublic) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("관리자 로그인이 필요합니다.");

      const response = await fetch(`/api/v1/admin/schedules/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const result = await response.json().catch(() => ({}));

      // 로컬 기본 예제는 DB 행이 없으므로 관리자에게 로컬 삭제를 허용합니다.
      const isLocalPreset = id.startsWith("preset-");
      if (!response.ok && !(response.status === 404 && isLocalPreset)) {
        throw new Error(result.error || "공개 시간표 삭제에 실패했습니다.");
      }
    } else {
      if (!supabase) throw new Error("Supabase에 연결할 수 없습니다.");
      const { error } = await supabase.from("schedules").delete().eq("id", id);
      if (error) throw error;
    }
  } catch (error) {
    return alert("시간표 삭제 실패: " + error.message);
  }

  allSchedules = allSchedules.filter(s => s.id !== id);
  if (currentScheduleId === id && allSchedules.length > 0) {
    currentScheduleId = allSchedules[0].id;
  }
  saveHubSchedules();
  renderDashboard();
  showStatusMessage(`🗑️ '${schedule.title}' 시간표가 삭제되었습니다.`);
  return true;
};

window.renameSchedule = function(id) {
  closeAllDropdowns();
  const schedule = getScheduleById(id);
  if (!schedule) return;

  const newTitle = prompt("새 시간표 제목을 입력하세요:", schedule.title);
  if (newTitle && newTitle.trim()) {
    schedule.title = newTitle.trim();
    schedule.updatedAt = new Date().toISOString();
    saveHubSchedules();
    saveScheduleToSupabase(schedule);
    renderDashboard();
    showStatusMessage(`✏️ 시간표 제목이 '${schedule.title}'(으)로 변경되었습니다.`);
  }
};

function createNewSchedule() {
  const newId = "sched-" + Date.now();
  const newTitle = "새 시간표 " + (allSchedules.length + 1);
  const isPrivate = Boolean(currentUser);

  const newSchedule = {
    id: newId,
    title: newTitle,
    items: [],
    is_public: !isPrivate,
    user_id: currentUser ? currentUser.id : null,
    updatedAt: new Date().toISOString()
  };

  allSchedules.unshift(newSchedule);
  saveHubSchedules();
  saveScheduleToSupabase(newSchedule);
  openScheduleEditor(newId);
  showStatusMessage(`➕ '${newTitle}' (${isPrivate ? '비공개' : '공개'}) 생성이 완료되었습니다.`);
}

// Navigation View Switchers
function showDashboardView() {
  $("view-dashboard").style.display = "block";
  $("view-editor").style.display = "none";
  $("nav-dashboard").classList.add("active");
  $("nav-editor").classList.remove("active");
  renderDashboard();
}

function showEditorView() {
  $("view-dashboard").style.display = "none";
  $("view-editor").style.display = "block";
  $("nav-dashboard").classList.remove("active");
  $("nav-editor").classList.add("active");
}

function syncCurrentScheduleToHub({ persistRemote = true } = {}) {
  const current = getScheduleById(currentScheduleId);
  if (current) {
    current.title = $("schedule-title").value || "나의 일주일 시간표";
    current.items = items;
    current.updatedAt = new Date().toISOString();
    saveHubSchedules();
    if (persistRemote) saveScheduleToSupabase(current);
  }
  return current || null;
}

// ==========================================
// 화면 내 작업 결과 및 Web Push 수신 메시지
// ==========================================
let statusMessageTimeout = null;
function showStatusMessage(titleMessage, bodyText = "", label = "작업 상태") {
  const windowCard = $("floating-status-window");
  const labelEl = $("header-status-label");
  const titleEl = $("header-status-title");
  const textEl = $("header-status-text");
  if (!windowCard) return;

  if (labelEl) labelEl.textContent = label;
  if (titleEl) titleEl.textContent = titleMessage;
  if (textEl) textEl.textContent = bodyText || "원형 시간표 실시간 알림 시스템";

  windowCard.style.display = "flex";

  if (statusMessageTimeout) clearTimeout(statusMessageTimeout);
  statusMessageTimeout = setTimeout(() => {
    windowCard.style.display = "none";
  }, 8000);
}

const btnCloseStatusMessage = $("btn-close-header-status");
if (btnCloseStatusMessage) {
  btnCloseStatusMessage.addEventListener("click", () => {
    const windowCard = $("floating-status-window");
    if (windowCard) windowCard.style.display = "none";
  });
}

// ==========================================
// SVG Circular Renderer
// ==========================================
function hourToAngle(hour) {
  const clamped = Math.max(START_HOUR, Math.min(START_HOUR + TOTAL_HOURS, hour));
  const fraction = (clamped - START_HOUR) / TOTAL_HOURS;
  return -90 + fraction * 360;
}

function polarToXY(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function annularSectorPath(cx, cy, rIn, rOut, aStart, aEnd) {
  let angleSpan = aEnd - aStart;
  if (angleSpan < 0) angleSpan += 360;
  if (angleSpan >= 359.99) angleSpan = 359.99;

  const startRad = (aStart * Math.PI) / 180;
  const endRad = ((aStart + angleSpan) * Math.PI) / 180;

  const p1 = { x: cx + rOut * Math.cos(startRad), y: cy + rOut * Math.sin(startRad) };
  const p2 = { x: cx + rOut * Math.cos(endRad), y: cy + rOut * Math.sin(endRad) };
  const p3 = { x: cx + rIn * Math.cos(endRad), y: cy + rIn * Math.sin(endRad) };
  const p4 = { x: cx + rIn * Math.cos(startRad), y: cy + rIn * Math.sin(startRad) };

  const largeArc = angleSpan > 180 ? 1 : 0;
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${rOut} ${rOut} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} A ${rIn} ${rIn} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v !== undefined && v !== null) el.setAttribute(k, v);
  });
  return el;
}

function renderSchedule() {
  const svg = $("schedule-svg");
  if (!svg) return;
  svg.innerHTML = "";

  const defs = svgEl("defs");
  svg.appendChild(defs);

  // Background Dial
  for (let lvl = 0; lvl < 7; lvl += 1) {
    const rIn = INNER_BASE_R + lvl * LAYER_WIDTH;
    const rOut = rIn + LAYER_WIDTH;
    for (let h = 0; h < TOTAL_HOURS; h += 1) {
      const a0 = hourToAngle(START_HOUR + h);
      const a1 = hourToAngle(START_HOUR + h + 1);
      const isEven = (lvl + h) % 2 === 0;
      const path = svgEl("path", {
        d: annularSectorPath(CX, CY, rIn, rOut, a0, a1),
        fill: isEven ? "#fafafa" : "#f1f3f4",
        stroke: "#e8eaed",
        "stroke-width": "0.5"
      });
      svg.appendChild(path);
    }
  }

  // Activity Blocks
  items.forEach((item) => {
    const a0 = hourToAngle(item.start);
    const a1 = hourToAngle(item.end);
    const ranges = consecutiveRanges(item.days);

    ranges.forEach((range) => {
      const rIn = INNER_BASE_R + range.start * LAYER_WIDTH + 1;
      const rOut = INNER_BASE_R + range.end * LAYER_WIDTH - 1;
      const pathD = annularSectorPath(CX, CY, rIn, rOut, a0, a1);

      const path = svgEl("path", {
        d: pathD,
        fill: item.color || "#FF6B6B",
        stroke: selectedItemId === item.id ? "#1a73e8" : "rgba(0,0,0,0.15)",
        "stroke-width": selectedItemId === item.id ? "3" : "1",
        cursor: "pointer",
        class: "activity-block"
      });

      path.addEventListener("click", () => selectItem(item.id));
      svg.appendChild(path);

      const midAngle = a0 + (a1 - a0) / 2;
      const midR = (rIn + rOut) / 2;
      const pos = polarToXY(CX, CY, midR, midAngle);

      const text = svgEl("text", {
        x: pos.x,
        y: pos.y + 4,
        fill: "#ffffff",
        "font-size": range.end - range.start > 1 ? "13" : "11",
        "font-weight": "700",
        "font-family": "Noto Sans KR, sans-serif",
        "text-anchor": "middle",
        "pointer-events": "none"
      });
      text.textContent = item.title;
      svg.appendChild(text);
    });
  });

  // Center Circle
  const centerCircle = svgEl("circle", {
    cx: CX,
    cy: CY,
    r: INNER_BASE_R - 2,
    fill: "#ffffff",
    stroke: "#dadce0",
    "stroke-width": "2"
  });
  svg.appendChild(centerCircle);

  const centerText = svgEl("text", {
    x: CX,
    y: CY - 6,
    fill: "#1a73e8",
    "font-size": "14",
    "font-weight": "700",
    "text-anchor": "middle"
  });
  centerText.textContent = "월~일";
  svg.appendChild(centerText);

  const centerSub = svgEl("text", {
    x: CX,
    y: CY + 14,
    fill: "#5f6368",
    "font-size": "11",
    "text-anchor": "middle"
  });
  centerSub.textContent = "9시~21시";
  svg.appendChild(centerSub);

  // Hour Labels around circle
  for (let h = 0; h <= TOTAL_HOURS; h += 1) {
    const angle = hourToAngle(START_HOUR + h);
    const pos = polarToXY(CX, CY, INNER_BASE_R + 7 * LAYER_WIDTH + 14, angle);
    const hourLabel = svgEl("text", {
      x: pos.x,
      y: pos.y + 4,
      fill: "#3c4043",
      "font-size": "11",
      "font-weight": "700",
      "text-anchor": "middle"
    });
    hourLabel.textContent = `${START_HOUR + h}시`;
    svg.appendChild(hourLabel);
  }
}

function selectItem(id) {
  selectedItemId = id;
  const item = items.find(it => it.id === id);
  const detailCard = $("detail-card");
  const detailText = $("detail-text");

  if (item && detailCard && detailText) {
    detailCard.style.display = "flex";
    detailText.innerHTML = `<strong>${escapeHtml(item.title)}</strong> (${formatDaysLabel(item.days)}, ${decToTimeStr(item.start)} ~ ${decToTimeStr(item.end)})`;
  }
  renderList();
  renderSchedule();
}

function renderList() {
  const ul = $("schedule-list-ui");
  const badge = $("count-badge");
  if (!ul) return;

  ul.innerHTML = "";
  if (badge) badge.textContent = items.length;

  if (!items.length) {
    ul.innerHTML = '<li class="schedule-item-empty">등록된 활동이 없습니다.</li>';
    return;
  }

  items.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "schedule-item" + (selectedItemId === item.id ? " selected" : "");
    li.innerHTML = `
      <div class="item-info">
        <span class="item-index">${idx + 1}</span>
        <span class="badge" style="background:${item.color};"></span>
        <span class="day-tag">${formatDaysLabel(item.days)}</span>
        <span class="item-title">${escapeHtml(item.title)}</span>
        <span class="item-time">(${decToTimeStr(item.start)}~${decToTimeStr(item.end)})</span>
      </div>
      <button type="button" class="btn-delete-item" onclick="event.stopPropagation(); deleteItem('${item.id}');">삭제</button>
    `;
    li.addEventListener("click", () => selectItem(item.id));
    ul.appendChild(li);
  });
}

function deleteItem(id) {
  items = items.filter(it => it.id !== id);
  if (selectedItemId === id) {
    selectedItemId = null;
    $("detail-card").style.display = "none";
  }
  saveLocal();
  renderList();
  renderSchedule();
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(TITLE_STORAGE_KEY, $("schedule-title").value);
  syncCurrentScheduleToHub();
}

function loadLocalSchedule() {
  loadHubSchedules();
  const schedule = getScheduleById(currentScheduleId);
  if (schedule) {
    items = (schedule.items || []).map((it, idx) => normalizeItem(it, idx));
    $("schedule-title").value = schedule.title || "나의 일주일 시간표 (9시 ~ 21시)";
  }
}

function getSelectedDays() {
  const chips = document.querySelectorAll(".day-chip.active");
  return Array.from(chips).map(c => Number(c.dataset.day));
}

function setSelectedDays(days) {
  const chips = document.querySelectorAll(".day-chip");
  chips.forEach(chip => {
    const day = Number(chip.dataset.day);
    chip.classList.toggle("active", days.includes(day));
  });
}

function hslToHex(hue, saturation = 100, lightness = 50) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  let rgb = [0, 0, 0];

  if (section < 1) rgb = [chroma, x, 0];
  else if (section < 2) rgb = [x, chroma, 0];
  else if (section < 3) rgb = [0, chroma, x];
  else if (section < 4) rgb = [0, x, chroma];
  else if (section < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  const offset = l - chroma / 2;
  return `#${rgb.map(value => Math.round((value + offset) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function hexToHue(hex) {
  const normalized = String(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return 0;
  const [r, g, b] = [0, 2, 4].map(index => parseInt(normalized.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;

  let hue;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * (((b - r) / delta) + 2);
  else hue = 60 * (((r - g) / delta) + 4);
  return hue < 0 ? hue + 360 : hue;
}

function setActiveColor(color, markerRatio = null) {
  const input = $("input-color");
  const output = $("color-hex");
  const marker = $("color-spectrum-marker");
  const track = $("color-spectrum-track");
  const normalized = String(color).toUpperCase();
  if (input) input.value = normalized;
  if (output) output.textContent = normalized;

  let ratio = markerRatio;
  if (ratio === null) ratio = Math.min(1, hexToHue(normalized) / SPECTRUM_MAX_HUE);
  ratio = Math.max(0, Math.min(1, ratio));
  if (marker) marker.style.left = `${ratio * 100}%`;
  if (track) {
    track.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
    track.setAttribute("aria-valuetext", normalized);
  }
}

function setupColorSpectrum() {
  const track = $("color-spectrum-track");
  const canvas = $("color-spectrum");
  const input = $("input-color");
  if (!track || !canvas || !input) return;

  const context = canvas.getContext("2d");
  for (let x = 0; x < canvas.width; x += 1) {
    const hue = (x / (canvas.width - 1)) * SPECTRUM_MAX_HUE;
    context.fillStyle = `hsl(${hue} 100% 50%)`;
    context.fillRect(x, 0, 1, canvas.height);
  }

  const selectAtPointer = (event) => {
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    setActiveColor(hslToHex(ratio * SPECTRUM_MAX_HUE), ratio);
  };

  track.addEventListener("pointerdown", (event) => {
    track.setPointerCapture(event.pointerId);
    selectAtPointer(event);
  });
  track.addEventListener("pointermove", (event) => {
    if (track.hasPointerCapture(event.pointerId)) selectAtPointer(event);
  });
  track.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = Number(track.getAttribute("aria-valuenow") || 0);
    const next = Math.max(0, Math.min(100, current + (event.key === "ArrowRight" ? 1 : -1)));
    setActiveColor(hslToHex((next / 100) * SPECTRUM_MAX_HUE), next / 100);
  });
  input.addEventListener("input", () => setActiveColor(input.value));
  setActiveColor(input.value);
}

function setupEvents() {
  // Sidebar Toggle (☰ Button)
  const btnToggleSidebar = $("btn-toggle-sidebar");
  const sidebar = $("g-sidebar");
  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }

  // Navigation Tabs
  $("nav-dashboard").addEventListener("click", showDashboardView);
  $("nav-editor").addEventListener("click", showEditorView);
  $("nav-push").addEventListener("click", async () => {
    if (!currentUser) {
      alert("푸시 알림 설정은 로그인한 사용자만 이용할 수 있습니다.");
      window.openAuthModal();
      return;
    }
    $("push-modal").style.display = "flex";
    const subscribeButton = $("btn-toggle-push-sub");
    subscribeButton.disabled = true;
    const appsLoaded = await loadAvailableApps();
    subscribeButton.disabled = !appsLoaded;
    await updatePushStatusUI();
  });
  $("btn-back-to-dashboard").addEventListener("click", showDashboardView);

  $("btn-sidebar-new").addEventListener("click", createNewSchedule);
  $("btn-fab-new-schedule").addEventListener("click", createNewSchedule);
  $("btn-sidebar-sample").addEventListener("click", () => {
    items = SAMPLE_ITEMS.map((item, idx) => normalizeItem({ ...item, id: `sample-${idx}` }, idx));
    saveLocal();
    renderList();
    renderSchedule();
    showEditorView();
    showStatusMessage("📋 원본 샘플 시간표가 로드되었습니다.");
  });

  // Filter chips (All, Private, Public, Name, Items, Recent)
  const filterChips = document.querySelectorAll(".g-filter-chip");
  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter || "all";
      renderDashboard();
    });
  });

  // Days chips toggle
  const dayChips = document.querySelectorAll(".day-chip");
  dayChips.forEach(chip => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("active");
    });
  });

  // Activity Form Submit
  $("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("input-title").value.trim();
    const start = minsToDec(startMinutes);
    const end = minsToDec(endMinutes);
    const days = uniqueSortedDays(getSelectedDays());
    const color = $("input-color").value || "#FF6B6B";

    if (!title) return alert("활동명을 입력하세요.");
    if (!days.length) return alert("요일을 하나 이상 선택하세요.");

    if (editingId) {
      const idx = items.findIndex(it => it.id === editingId);
      if (idx >= 0) {
        items[idx] = normalizeItem({ id: editingId, title, start, end, days, color });
      }
      editingId = null;
      $("btn-submit-activity").textContent = "➕ 활동 등록하기";
      $("btn-cancel-edit").style.display = "none";
    } else {
      items.push(normalizeItem({ id: `item-${Date.now()}`, title, start, end, days, color }));
    }

    $("input-title").value = "";
    saveLocal();
    renderList();
    renderSchedule();
  });

  $("btn-cancel-edit").addEventListener("click", () => {
    editingId = null;
    $("input-title").value = "";
    $("btn-submit-activity").textContent = "➕ 활동 등록하기";
    $("btn-cancel-edit").style.display = "none";
  });

  $("detail-edit-btn").addEventListener("click", () => {
    const item = items.find(it => it.id === selectedItemId);
    if (!item) return;

    editingId = item.id;
    $("input-title").value = item.title;
    setTimeDropdownsFromDec(item.start, item.end);
    setSelectedDays(item.days);
    setActiveColor(item.color);
    $("btn-submit-activity").textContent = "💾 활동 수정 완료";
    $("btn-cancel-edit").style.display = "inline-block";
  });

  $("detail-delete-btn").addEventListener("click", () => {
    if (selectedItemId) deleteItem(selectedItemId);
  });

  $("btn-render").addEventListener("click", () => {
    const current = allSchedules.find(schedule => schedule.id === currentScheduleId);
    if (!current) return alert("현재 시간표를 찾을 수 없습니다.");

    const isPublic = current.is_public === true || !current.user_id;
    if (isPublic && !currentUserIsAdmin) {
      return alert("공개 시간표는 관리자만 비울 수 있습니다.");
    }
    if (!isPublic && (!currentUser || current.user_id !== currentUser.id)) {
      return alert("본인의 비공개 시간표만 비울 수 있습니다.");
    }

    if (!confirm("현재 시간표의 모든 활동을 비울까요? 시간표 자체는 삭제되지 않습니다.")) return;
    items = [];
    selectedItemId = null;
    editingId = null;
    $("detail-card").style.display = "none";
    $("input-title").value = "";
    $("btn-submit-activity").textContent = "➕ 활동 등록하기";
    $("btn-cancel-edit").style.display = "none";
    saveLocal();
    renderSchedule();
    renderList();
    showStatusMessage("🧹 시간표의 모든 활동을 비웠습니다.");
  });

  $("btn-load-sample").addEventListener("click", () => {
    items = SAMPLE_ITEMS.map((item, idx) => normalizeItem({ ...item, id: `sample-${idx}` }, idx));
    saveLocal();
    renderList();
    renderSchedule();
  });

  $("btn-clear-schedule").addEventListener("click", async () => {
    const deleted = await window.deleteSchedule(currentScheduleId);
    if (deleted) showDashboardView();
  });

  $("activity-list-toggle").addEventListener("click", () => {
    const list = $("schedule-list-ui");
    const icon = $("activity-list-icon");
    const isHidden = list.style.display === "none";
    list.style.display = isHidden ? "flex" : "none";
    icon.textContent = isHidden ? "▲ 접기" : "▼ 펼치기";
  });

  $("schedule-title").addEventListener("input", saveLocal);

  // PNG Download
  function downloadSvgAsPng() {
    const svgEl = $("schedule-svg");
    if (!svgEl) return;
    const title = $("schedule-title").value || "circular-schedule";
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);
    
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1200;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      
      const png = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `${title.replace(/\s+/g, "_")}.png`;
      downloadLink.href = png;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobURL);
      showStatusMessage(`💾 '${title}.png' 이미지가 저장되었습니다.`);
    };
    image.src = blobURL;
  }

  const btnDownloadPng = $("btn-download-png");
  if (btnDownloadPng) {
    btnDownloadPng.addEventListener("click", downloadSvgAsPng);
  }

  // Save the entire current schedule for logged-in users
  const btnCloudSave = $("btn-cloud-save");
  if (btnCloudSave) {
    btnCloudSave.addEventListener("click", async () => {
      const current = syncCurrentScheduleToHub({ persistRemote: false });
      if (!current) return alert("저장할 시간표를 찾을 수 없습니다.");

      const isPublic = current.is_public === true || !current.user_id;
      if (isPublic && !currentUserIsAdmin) {
        return alert("공개 시간표는 관리자만 저장할 수 있습니다.");
      }
      if (!isPublic && (!currentUser || current.user_id !== currentUser.id)) {
        return alert("본인의 비공개 시간표만 저장할 수 있습니다.");
      }

      btnCloudSave.disabled = true;
      btnCloudSave.textContent = "저장 중...";
      const saved = await saveScheduleToSupabase(current);
      btnCloudSave.disabled = false;
      btnCloudSave.textContent = "저장";

      if (!saved) return alert("시간표 저장에 실패했습니다. 네트워크 연결과 로그인 상태를 확인해 주세요.");
      showStatusMessage(`💾 '${current.title}' 시간표가 저장되었습니다.`);
    });
  }

  // Share (Works for both Guest and Logged-in users)
  $("btn-share").addEventListener("click", async () => {
    let shareId = "share-" + Date.now();
    try {
      const res = await fetch("/api/generate-id");
      const data = await res.json();
      if (data && data.id) shareId = data.id;
    } catch (e) {}

    const title = $("schedule-title").value || "나의 일주일 시간표";
    
    if (supabase) {
      try {
        await supabase.from("schedules").upsert({
          id: shareId,
          user_id: currentUser ? currentUser.id : null,
          title,
          items,
          is_public: true,
          updated_at: new Date().toISOString()
        });
      } catch (e) {}
    }

    $("share-url-input").value = `${window.location.origin}/s/${shareId}`;
    $("share-modal").style.display = "flex";
  });

  $("btn-copy-url").addEventListener("click", async () => {
    const input = $("share-url-input");
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      alert("공유 링크가 클립보드에 복사되었습니다!");
    } catch (e) {
      document.execCommand("copy");
      alert("공유 링크가 복사되었습니다!");
    }
  });

  $("btn-close-share").addEventListener("click", () => {
    $("share-modal").style.display = "none";
  });

  // Auth Modals (Global & Event Attached)
  window.openAuthModal = function() {
    const modal = $("auth-modal");
    if (modal) {
      modal.style.display = "flex";
      setTimeout(() => {
        const emailInput = $("auth-email");
        if (emailInput) emailInput.focus();
      }, 100);
    }
  };

  window.closeAuthModal = function() {
    const modal = $("auth-modal");
    if (modal) modal.style.display = "none";
  };

  window.handleAvatarClick = function() {
    if (currentUser) {
      if (confirm(`'${currentUser.email}' 계정에서 로그아웃하시겠습니까?`)) {
        if (supabase) supabase.auth.signOut();
      }
    } else {
      window.openAuthModal();
    }
  };

  window.doLogout = async function() {
    if (supabase) await supabase.auth.signOut();
  };

  window.doLogin = async function() {
    if (!supabase) await initSupabase();
    if (!supabase) return alert("Supabase 클라우드 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");

    const email = $("auth-email").value.trim();
    const password = $("auth-password").value.trim();
    if (!email || !password) return alert("이메일과 비밀번호를 모두 입력해 주세요.");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("로그인 실패: " + error.message);
    else {
      window.closeAuthModal();
      showStatusMessage(`🎉 '${email}' 계정으로 로그인되었습니다.`);
      await loadSchedulesFromSupabase();
    }
  };

  window.doSignup = async function() {
    if (!supabase) await initSupabase();
    if (!supabase) return alert("Supabase 클라우드 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");

    const email = $("auth-email").value.trim();
    const password = $("auth-password").value.trim();
    if (!email || !password) return alert("이메일과 비밀번호를 모두 입력해 주세요.");

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert("가입 실패: " + error.message);
    else alert("가입 완료! 자동 로그인되었습니다.");
  };

  const btnLoginModal = $("btn-login-modal");
  if (btnLoginModal) btnLoginModal.addEventListener("click", window.openAuthModal);

  const btnCloseAuth = $("btn-close-auth");
  if (btnCloseAuth) btnCloseAuth.addEventListener("click", window.closeAuthModal);

  const btnDoLogin = $("btn-do-login");
  if (btnDoLogin) btnDoLogin.addEventListener("click", window.doLogin);

  const btnDoSignup = $("btn-do-signup");
  if (btnDoSignup) btnDoSignup.addEventListener("click", window.doSignup);

  const btnLogout = $("btn-logout");
  if (btnLogout) btnLogout.addEventListener("click", window.doLogout);

  // Push Modal Events
  $("btn-close-push-modal").addEventListener("click", () => {
    $("push-modal").style.display = "none";
  });

  // Push Subscribe / Test Push
  let webPushClient = null;
  if (typeof WebPushClient !== "undefined") {
    webPushClient = new WebPushClient({
      serverUrl: window.location.origin,
      accessTokenProvider: async () => {
        if (!supabase || !currentUser) return null;
        const { data: { session } } = await supabase.auth.getSession();
        return session ? session.access_token : null;
      }
    });
    webPushClient.registerServiceWorker().catch((error) => {
      console.info("[Web Push] Service Worker registration skipped:", error.message);
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const message = event.data || {};
      if (message.type !== "WEB_PUSH_RECEIVED" || !message.notification) return;

      const notification = message.notification;
      showStatusMessage(
        notification.title || "시간표 알림",
        notification.body || "새로운 알림이 도착했습니다.",
        "푸시 알림"
      );
    });
  }

  async function updatePushStatusUI() {
    if (!webPushClient) return;
    try {
      const selectedApp = $("push-select-app");
      webPushClient.appKey = selectedApp ? selectedApp.value : '';
      const status = await webPushClient.getSubscriptionStatus();
      const sup = $("push-stat-supported");
      const perm = $("push-stat-permission");
      const sub = $("push-stat-subscribed");
      const btn = $("btn-toggle-push-sub");

      if (sup) sup.textContent = status.supported ? "지원됨 (Yes)" : "미지원 (No)";
      if (perm) perm.textContent = status.permission;
      if (sub) {
        sub.textContent = status.subscribed && status.serverRegistered
          ? "구독 중 (브라우저 + 서버 등록 완료)"
          : (status.subscribed ? "서버 재등록 필요" : "미구독 (Inactive)");
      }
      if (btn) {
        const fullyRegistered = status.subscribed && status.serverRegistered;
        btn.textContent = fullyRegistered ? "🔕 푸시 알림 구독 해제" : "🔔 웹 푸시 알림 등록/복구";
        btn.className = fullyRegistered ? "btn btn-outline-danger" : "btn btn-primary";
      }
    } catch (error) {
      console.error('[Web Push] Failed to update subscription status:', error);
    }
  }

  $("btn-toggle-push-sub").addEventListener("click", async () => {
    if (!currentUser) return alert("푸시 알림 설정은 로그인한 사용자만 이용할 수 있습니다.");
    if (!webPushClient) return alert("Web Push 클라이언트를 로드할 수 없습니다.");
    const selectedKey = $("push-select-app") ? $("push-select-app").value : "";
    if (!selectedKey) return alert("구독할 앱을 먼저 선택해 주세요.");
    const btn = $("btn-toggle-push-sub");
    btn.disabled = true;
    btn.textContent = "처리 중...";

    try {
      webPushClient.appKey = selectedKey;
      const status = await webPushClient.getSubscriptionStatus();
      if (status.subscribed && status.serverRegistered) {
        await webPushClient.unsubscribe();
        alert("푸시 알림 구독이 해제되었습니다.");
      } else {
        await webPushClient.subscribe();
        alert(`🔔 [${selectedKey}] 앱 키로 웹 푸시 알림 구독이 완료되었습니다!`);
      }
    } catch (err) {
      alert("푸시 알림 설정 실패: " + err.message);
    } finally {
      btn.disabled = false;
      await updatePushStatusUI();
    }
  });

  const btnTestLocal = $("btn-test-local-notify");
  if (btnTestLocal) {
    btnTestLocal.addEventListener("click", async () => {
      if (!webPushClient) return alert("Web Push 클라이언트를 로드할 수 없습니다.");
      try {
        await webPushClient.showSystemNotification("⏰ 시스템 알림 테스트", {
          body: "이 알림이 기기의 알림 센터에 표시되면 Web Push 수신 환경이 정상입니다.",
          requireInteraction: true
        });
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

async function loadAvailableApps() {
  const selectApp = $("push-select-app");
  if (!selectApp) return false;

  try {
    const res = await fetch("/api/v1/apps");
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || '앱 목록을 불러오지 못했습니다.');
    }
    if (!data.apps || data.apps.length === 0) {
      throw new Error('등록된 Web Push 앱이 없습니다. 관리자 화면에서 앱을 먼저 생성해 주세요.');
    }

    selectApp.innerHTML = "";
    data.apps.forEach(app => {
      const opt = document.createElement("option");
      opt.value = app.app_key;
      opt.textContent = `${app.app_name} (${app.app_key})`;
      selectApp.appendChild(opt);
    });
    return true;
  } catch (error) {
    selectApp.innerHTML = '<option value="" selected disabled>앱 목록을 불러오지 못했습니다.</option>';
    alert(error.message);
    return false;
  }
}

// Supabase Init
async function initSupabase() {
  try {
    const configRes = await fetch("/api/config");
    const { supabaseUrl, supabasePublishableKey } = await configRes.json();
    if (supabaseUrl && supabasePublishableKey) {
      if (!window.supabase) {
        const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        window.supabase = mod;
      }
      supabase = window.supabase.createClient(supabaseUrl, supabasePublishableKey);
      const { data: { session } } = await supabase.auth.getSession();
      await handleAuthChange(session ? session.user : null);
      supabase.auth.onAuthStateChange((_event, session) => {
        handleAuthChange(session ? session.user : null);
      });
    }
  } catch (e) {
    console.warn("[App] initSupabase notice:", e.message);
  }
}

async function handleAuthChange(user) {
  currentUser = user;
  currentUserIsAdmin = false;
  const userDisplay = $("user-display");
  const loginBtn = $("btn-login-modal");
  const logoutBtn = $("btn-logout");
  const cloudSaveBtn = $("btn-cloud-save");
  const avatar = $("user-avatar");
  const pushNav = $("nav-push");

  if (user) {
    if (userDisplay) userDisplay.textContent = `${user.email} (로그인 완료)`;
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (cloudSaveBtn) cloudSaveBtn.style.display = "inline-block";
    if (pushNav) {
      pushNav.style.display = "flex";
      pushNav.setAttribute("aria-hidden", "false");
    }
    if (avatar) {
      avatar.textContent = user.email.charAt(0).toUpperCase();
      avatar.title = user.email;
    }
    await checkAdminRole(user.id, user.email);
  } else {
    if (userDisplay) userDisplay.textContent = "게스트 모드 (공개 저장)";
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (cloudSaveBtn) cloudSaveBtn.style.display = "none";
    if (pushNav) {
      pushNav.style.display = "none";
      pushNav.setAttribute("aria-hidden", "true");
    }
    const pushModal = $("push-modal");
    if (pushModal) pushModal.style.display = "none";
    if (avatar) {
      avatar.textContent = "G";
      avatar.title = "게스트 모드";
    }
    const adminBtn = $("btn-admin-panel-link");
    if (adminBtn) adminBtn.style.display = "none";

    // Purge private schedules from local memory on logout
    allSchedules = allSchedules.filter(s => s.is_public === true || !s.user_id);
    saveHubSchedules();

    // Reset filter from "private" to "all" on logout
    if (currentFilter === "private") {
      currentFilter = "all";
      document.querySelectorAll(".g-filter-chip").forEach(c => {
        c.classList.toggle("active", c.dataset.filter === "all");
      });
    }
  }

  await loadSchedulesFromSupabase();
  renderDashboard();
}

async function checkAdminRole(userId, email) {
  const adminBtn = $("btn-admin-panel-link");
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      currentUserIsAdmin = false;
      if (adminBtn) adminBtn.style.display = "none";
      return;
    }

    const response = await fetch("/api/v1/auth/check-admin", {
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const data = await response.json();
    currentUserIsAdmin = Boolean(data.success && data.isAdmin);
    if (adminBtn) adminBtn.style.display = currentUserIsAdmin ? "inline-flex" : "none";
  } catch (e) {
    currentUserIsAdmin = false;
    if (adminBtn) adminBtn.style.display = "none";
  }
}

async function init() {
  setupTimeDropdowns();
  setupColorSpectrum();
  setupEvents();
  loadLocalSchedule();
  renderDashboard();
  renderList();
  renderSchedule();
  await initSupabase();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
