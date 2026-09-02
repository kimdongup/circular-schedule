# 🗓️ 원형 하루 시간표 PWA (Circular Schedule Hub)

> **Google Workspace Migrate 스타일의 카드 대시보드, 극좌표 기반 원형 시간표, 표준 Web Push 시스템 알림을 통합한 PWA입니다.**

---

## 🌟 주요 기능 (Key Features)

### 1. 📊 Google Workspace Migrate 스타일 시간표 대시보드 (Schedule Hub)
- **카드 그리드 레이아웃**: 각 시간표의 실시간 SVG 썸네일, 등록된 활동 수, 총 계획 시간, 최근 수정일 표시.
- **수평 점 세개(`⋯`) 옵션 드롭다운**: 시간표 **복제하기**, **이름 변경**, **삭제하기** 원클릭 지원.
- **`+ New` (새 시간표) Material Floating Pill 버튼**: 클릭 즉시 새 시간표를 생성하고 편집기로 전환.
- **필터 칩 바**: `전체 (All)`, `이름순 (Name)`, `활동 많은 순 (Items)`, `최근 수정순 (Started)` 실시간 정렬.
- **작업 상태 메시지**: 저장, 복제, 삭제 같은 화면 내 작업의 완료 상태 표시.
- **사이드바 메뉴 토글 (☰)**: 좌측 내비게이션 사이드바 슬라이드 접기/펼치기.

### 2. 🎨 원형 일주일 시간표 편집기 (Circular SVG Canvas)
- **극좌표 기반 원형 시각화**: 9시(북쪽)부터 21시까지 12시간 시계방향 회전. 안쪽(월요일)부터 바깥쪽(일요일)까지 7개 레이어.
- **연속 요일 띠(Band) 렌더링**: 월~금 등 연속된 요일 활동을 하나의 두꺼운 원호 띠로 깔끔하게 렌더링.
- **PNG 고화질 이미지 내보내기 & 공유 링크 발급**: 원클릭으로 완성된 시간표를 다운로드하거나 고유 링크(`/s/:id`)로 공유.

### 3. 🔔 PWA 웹 푸시 알림 & 관리자 시스템
- **표준 Web Push API (VAPID)**: Firebase SDK 없이 브라우저의 Push API와 Service Worker로 구독 및 수신.
- **운영체제 시스템 알림 전용**: 수신 메시지는 페이지 팝업으로 복제하지 않고 모바일·데스크톱 알림 센터에만 표시.
- **서버 관리자 콘솔 (`/server-admin`)**: 멀티 테넌트 App Key 발급, 기기 구독자 관리, 전체 브로드캐스트 푸시 발송.
- **관리자 롤(Admin Role) RBAC**: 권한이 부여된 사용자만 관리자 콘솔 접근 및 버튼 표시.

### 4. ☁️ Supabase PostgreSQL 영구 저장
- **서버리스 호환 데이터 계층**: 모든 서버 데이터는 Supabase PostgreSQL에 저장하며 로컬 파일이나 SQLite에 의존하지 않습니다.
- **Vercel Function 호환**: 요청 단위로 실행되는 환경에서도 여러 인스턴스가 동일한 데이터를 안전하게 사용합니다.

---

## 🏗️ 시스템 아키텍처 (Architecture)

```
[ Frontend Client ] ──────────────────────────────────────────────┐
│  • Google Workspace Style Hub UI (Dashboard & Sidebar)          │
│  • Circular Schedule SVG Renderer (polar math: angle & radius)  │
│  • Web Push Client (sw.js & Service Worker pushManager)         │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ HTTP / REST / WebPush
[ Vercel Express Function (server.js) ] ─────────────────────────┤
│  • Schedule Sharing & ID Generator API                          │
│  • Push Dispatcher (web-push VAPID Gateway)                     │
│  • Admin Auth & Role Validator (RBAC)                           │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
[ Supabase PostgreSQL (Cloud) ]
• public.schedules
• public.apps
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
| **2026-08-28** | 게스트 모드 공개 시간표 및 로그인 회원 전용 비공개 시간표 분리 저장 | [📄 계획서 보기](docs/plans/2026-08-28_guest_public_user_private_schedule_plan.md) | [📝 보고서 보기](docs/walkthroughs/2026-08-28_guest_public_user_private_schedule_walkthrough.md) |

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
ADMIN_EMAILS=admin@example.com
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:admin@example.com
```

### 3. 서버 실행
```bash
npm start
```
- 📅 **원형 시간표 대시보드**: `http://localhost:3000/`
- 🔔 **푸시 서버 관리자 콘솔**: `http://localhost:3000/server-admin`
- 📱 **PWA 설치 및 알림 구독**: `http://localhost:3000/`의 `푸시 알림 설정`

Vercel에 처음부터 배포하는 방법과 검증 절차는 [`deploy.md`](deploy.md)를 참고하세요.

---

## 📄 라이선스 (License)
MIT License.
