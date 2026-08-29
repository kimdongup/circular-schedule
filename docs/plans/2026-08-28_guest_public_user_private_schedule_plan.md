# 게스트 모드 공개 시간표 및 로그인 회원 전용 비공개 시간표 분리 저장 계획

게스트 모드에서 작성된 시간표는 **모든 사용자가 볼 수 있는 공개(Public) 시간표**로 저장되고, 로그인한 회원이 작성한 시간표는 **작성자 본인만 열람 및 수정할 수 있는 비공개(Private) 시간표**로 격리 저장되도록 데이터 모델과 권한 시스템을 구현합니다.

---

## 🎯 핵심 요구사항 및 정책

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. 게스트 모드 (비로그인 사용자)                                                        │
│    • 작성 시: user_id = null, is_public = true (공개 저장)                             │
│    • 대시보드 조회 시: 모든 사용자가 공유한 공개 시간표(Public Library) 표시 🌐       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. 로그인 회원 모드 (인증된 사용자)                                                    │
│    • 작성 시: user_id = currentUser.id, is_public = false (나만의 시간표)              │
│    • 대시보드 조회 시: 내가 작성한 비공개 시간표(🔒 My Private) 및 공개 시간표 필터링   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Changes

### 1. 데이터베이스 스키마 및 보안 규칙 (`supabase_schema.sql`)

#### [MODIFY] [supabase_schema.sql](file:///Users/mac/Antigravity/circular-schedule/supabase_schema.sql)
- `schedules` 테이블의 RLS 정책 확인 및 강화:
  - `SELECT`: `is_public = true OR auth.uid() = user_id` (공개 시간표이거나 본인 시간표인 경우만 조회 허용).
  - `INSERT`: 비로그인은 `is_public = true`로만 생성 가능, 로그인은 본인 `user_id`로 생성.
  - `UPDATE / DELETE`: `auth.uid() = user_id` (본인 소유 시간표만 수정/삭제 허용).

---

### 2. 클라이언트 데이터 관리 및 대시보드 (`public/app.js`)

#### [MODIFY] [app.js](file:///Users/mac/Antigravity/circular-schedule/public/app.js)
- **시간표 생성 및 저장 로직 분기**:
  - `createNewSchedule()` & `saveSchedule()`:
    - **게스트**: `is_public: true`, `user_id: null` 로컬 및 Supabase 공개 저장.
    - **로그인 회원**: `is_public: false`, `user_id: currentUser.id` 본인 계정에 영구 저장.
- **대시보드 실시간 동기화 (`loadSchedulesFromSupabase()`)**:
  - 비로그인 시: Supabase에서 `is_public = true`인 공개 시간표 목록 로드.
  - 로그인 시: 본인의 비공개 시간표(`user_id = currentUser.id`) 및 공개 시간표를 분리 로드.
- **카드 뱃지 및 필터 추가**:
  - 각 카드에 `🌐 공개 (Public)` 또는 `🔒 나만 보기 (Private)` 뱃지 표시.
  - 필터 탭에 `[🔒 내 시간표]`, `[🌐 공개 시간표]` 필터 옵션 추가.

---

## Verification Plan

### 브라우저 및 계정별 권한 검증
1. **게스트 모드 테스트**:
   - 시크릿 창(비로그인)에서 새 시간표 작성 -> `🌐 공개` 뱃지로 저장되는지 확인.
   - 다른 브라우저 창에서도 해당 공개 시간표가 보이는지 확인.
2. **로그인 회원 모드 테스트**:
   - `kimdongup@gmail.com` 로그인 후 새 시간표 작성 -> `🔒 나만 보기` 뱃지로 저장.
   - 로그아웃하거나 다른 계정으로 접속 시 해당 시간표가 보이지 않는지(권한 격리) 확인.
