# 🗓️ 원형 하루 시간표 & Pushwing 웹 푸시 통합 허브 (Circular Schedule Hub)

> **Google Workspace Migrate 스타일의 모던 카드 대시보드와 극좌표(Polar) 기반 원형 시간표 시각화, 그리고 Pushwing 실시간 웹 푸시 알림 시스템이 통합된 올인원 웹 애플리케이션입니다.**

---

## 🌟 주요 기능 (Key Features)

### 1. 📊 Google Workspace Migrate 스타일 시간표 대시보드 (Schedule Hub)
- **카드 그리드 레이아웃**: 각 시간표의 실시간 SVG 썸네일, 등록된 활동 수, 총 계획 시간, 최근 수정일 표시.
- **수평 점 세개(`⋯`) 옵션 드롭다운**: 시간표 **복제하기**, **이름 변경**, **삭제하기** 원클릭 지원.
- **`+ New` (새 시간표) Material Floating Pill 버튼**: 클릭 즉시 새 시간표를 생성하고 편집기로 전환.
- **필터 칩 바**: `전체 (All)`, `이름순 (Name)`, `활동 많은 순 (Items)`, `최근 수정순 (Started)` 실시간 정렬.
- **상단 펄스 알림 바**: 웹 푸시 수신 시 상단 블루 헤더에 실시간 알림 티커 표시.
- **사이드바 메뉴 토글 (☰)**: 좌측 내비게이션 사이드바 슬라이드 접기/펼치기.

### 2. 🎨 원형 일주일 시간표 편집기 (Circular SVG Canvas)
- **극좌표 기반 원형 시각화**: 9시(북쪽)부터 21시까지 12시간 시계방향 회전. 안쪽(월요일)부터 바깥쪽(일요일)까지 7개 레이어.
- **연속 요일 띠(Band) 렌더링**: 월~금 등 연속된 요일 활동을 하나의 두꺼운 원호 띠로 깔끔하게 렌더링.
- **PNG 고화질 이미지 내보내기 & 공유 링크 발급**: 원클릭으로 완성된 시간표를 다운로드하거나 고유 링크(`/s/:id`)로 공유.

### 3. 🔔 Pushwing 웹 푸시 알림 & 관리자 시스템
- **표준 Web Push API (VAPID)**: 영구 고정 VAPID 키를 기반으로 백그라운드 Service Worker 푸시 알림 수신.
- **실시간 상단 티커 & In-App Toast**: 맥 OS 알림이 억제되어 있어도 웹 화면 상단 헤더에 즉시 푸시 팝업 표시.
- **서버 관리자 콘솔 (`/server-admin`)**: 멀티 테넌트 App Key 발급, 기기 구독자 관리, 전체 브로드캐스트 푸시 발송.
- **관리자 롤(Admin Role) RBAC**: 권한이 부여된 사용자만 관리자 콘솔 접근 및 버튼 표시.

### 4. 🔄 Supabase PostgreSQL ↔ SQLite 양방향 자동 동기화
- **24시간 주기 자동 백그라운드 동기화**: Render 서버 재부팅 시에도 데이터가 100% 영구 보존되도록 클라우드 DB와 로컬 캐시를 지속적으로 동기화.
- **관리자 즉시 동기화 (`/api/v1/admin/sync`)**: 관리자 화면에서 `[⚡ 지금 즉시 DB 동기화 실행]` 버튼으로 언제든 1초 만에 양방향 병합.

---

## 🏗️ 시스템 아키텍처 (Architecture)

```
[ Frontend Client ] ──────────────────────────────────────────────┐
│  • Google Workspace Style Hub UI (Dashboard & Sidebar)          │
│  • Circular Schedule SVG Renderer (polar math: angle & radius)  │
│  • Pushwing Client SDK (sw.js & Service Worker pushManager)     │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ HTTP / REST / WebPush
[ Node.js Express Server (server.js) ] ───────────────────────────┤
│  • Schedule Sharing & ID Generator API                          │
│  • Push Dispatcher (web-push VAPID Gateway)                     │
│  • Admin Auth & Role Validator (RBAC)                           │
│  • Database Sync Service (src/db/syncService.js - 24h Cron)     │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
          ┌───────────────────────┴───────────────────────┐
          ▼                                               ▼
[ Supabase PostgreSQL (Cloud) ]                [ Local SQLite / Cache ]
• public.schedules                             • pushwing.db (Fallback)
• public.apps                                  • In-Memory / JSON Store
• public.subscriptions
• public.push_logs
• public.user_roles
```

---

## 📑 계획 및 작업 일지 아카이브 (Plans & Walkthroughs Archive)

새로운 기능 개발 및 리팩터링 진행 시 작성된 **구현 계획서(`implementation_plan.md`)**와 **작업 완료 보고서(`walkthrough.md`)**가 아래 디렉토리에 일자별로 영구 기록됩니다:

| 날짜 (Date) | 작업 주제 (Topic) | 구현 계획서 (Plan) | 작업 완료 보고서 (Walkthrough) |
|:---|:---|:---:|:---:|
| **2026-08-28** | Google Workspace Migrate 스타일 카드 대시보드 UI/UX 전면 개편 | [📄 계획서 보기](docs/plans/2026-08-28_google_workspace_dashboard_plan.md) | [📝 보고서 보기](docs/walkthroughs/2026-08-28_google_workspace_dashboard_walkthrough.md) |

---

## 🚀 빠른 시작 (Quick Start)

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정 (`.env`)
```env
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAILS=kimdongup@gmail.com
```

### 3. 서버 실행
```bash
npm start
```
- 📅 **원형 시간표 대시보드**: `http://localhost:3000/`
- 🔔 **푸시 서버 관리자 콘솔**: `http://localhost:3000/server-admin`
- 📱 **Pushwing PWA 클라이언트**: `http://localhost:3000/client/index.html`

---

## 📄 라이선스 (License)
MIT License.
