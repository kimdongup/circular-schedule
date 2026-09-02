# Vercel 신규 배포 가이드

이 프로젝트는 Vercel Express Function과 Supabase PostgreSQL만 사용합니다.

## 0. 배포 전 확인

- 기존 Render 서비스는 새 Vercel 배포 검증이 끝날 때까지 유지하는 편이 안전합니다.
- 기존 로컬 SQLite DB는 새 코드에서 사용하지 않으며 자동으로 Supabase에 이관되지 않습니다. 필요한 데이터가 Supabase에 있는지 먼저 확인하세요.
- 과거 VAPID 개인키가 Git 기록에 포함되어 있었으므로 기존 키를 재사용하지 말고 반드시 새 키를 발급하세요.


## 1. Supabase 준비

1. Supabase Dashboard에서 사용할 프로젝트를 엽니다.
2. `SQL Editor`에서 저장소의 `supabase_schema.sql` 전체를 실행합니다.
3. `Project Settings → API Keys`의 `Publishable and secret API keys`에서 다음 값을 준비합니다.
   - Project URL
   - Publishable key (`sb_publishable_...`)
   - Secret key (`sb_secret_...`)
4. `Authentication → URL Configuration`에서 Site URL을 `https://kimdongup-circular-schedule.vercel.app`으로 변경합니다.
5. Redirect URLs에도 `https://kimdongup-circular-schedule.vercel.app/**`를 추가합니다.

`Legacy anon, service_role API keys`의 키는 사용하지 않습니다. `Secret key`는 서버 전용 비밀이며 HTML, 브라우저 JavaScript, Git 저장소에 넣으면 안 됩니다.

## 2. VAPID 키 재발급

프로젝트 루트에서 다음 명령을 실행합니다.

```bash
npx web-push generate-vapid-keys --json
```

출력된 공개키와 개인키는 Vercel 환경 변수에만 저장합니다. 도메인이 바뀌고 VAPID 키도 교체되므로 기존 Render 주소에서 생성된 웹 푸시 구독은 새 Vercel 주소에서 다시 등록해야 합니다.

## 3. GitHub에 변경 사항 반영

배포 전에 로컬 검사를 실행합니다.

```bash
npm ci
npm run check
```

검사가 성공하면 변경 사항을 `main` 브랜치에 커밋하고 GitHub에 push합니다.

## 4. Vercel에 새 프로젝트 생성

1. https://vercel.com/new 에서 `kimdongup/circular-schedule` 저장소를 Import합니다.
2. Project Name은 `kimdongup-circular-schedule`을 사용합니다.
3. Production Branch는 `main`으로 지정합니다.
4. Root Directory는 저장소 루트인 `./`로 둡니다.
5. Framework Preset은 자동 감지된 Express 설정을 사용합니다.
6. Build Command, Output Directory, Install Command는 Override하지 않습니다.
7. Node.js 버전은 `package.json`에 지정된 24.x를 사용합니다.

Vercel은 루트의 `server.js`가 내보내는 Express 앱을 하나의 Function으로 자동 배포하고 `public/**` 파일은 CDN에서 제공합니다.

- Express 배포 방식: https://vercel.com/kb/guide/ship-a-express-app-on-vercel

## 5. Vercel 환경 변수 등록

`Settings → Environment Variables`에서 아래 값을 등록합니다. 우선 Production에 등록하고 Preview 배포도 테스트하려면 Preview에도 같은 방식으로 등록합니다.

| 이름 | 용도 | 필수 |
|---|---|---|
| `SUPABASE_URL` | Supabase Project URL | 예 |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...`; 브라우저 로그인 및 시간표 RLS 접근 | 예 |
| `SUPABASE_SECRET_KEY` | `sb_secret_...`; Vercel 서버의 DB 접근 및 RLS 우회 | 예 |
| `ADMIN_EMAILS` | 쉼표로 구분한 관리자 이메일 | 예 |
| `VAPID_PUBLIC_KEY` | Web Push 공개키 | 푸시 사용 시 예 |
| `VAPID_PRIVATE_KEY` | Web Push 개인키 | 푸시 사용 시 예 |
| `VAPID_SUBJECT` | `mailto:admin@example.com` 형식 | 푸시 사용 시 예 |

이 프로젝트의 Supabase 값은 다음 형식으로 입력합니다.

```env
SUPABASE_URL=https://jtwjwbqgwreyyhjfoptj.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_전체값
SUPABASE_SECRET_KEY=sb_secret_전체값
```

키 화면에 일부만 표시된 문자열을 직접 드래그하지 말고 Copy 버튼으로 전체 값을 복사합니다. 기존 `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 환경 변수는 새 코드에서 읽지 않으므로 Vercel에서 제거합니다. 환경 변수를 추가하거나 변경한 뒤에는 Production을 Redeploy해야 적용됩니다.

## 6. 배포 검증

배포가 `Ready`가 되면 실제 Production URL로 다음 경로를 확인합니다.

```bash
curl -i https://kimdongup-circular-schedule.vercel.app/
curl -i https://kimdongup-circular-schedule.vercel.app/health
curl -i https://kimdongup-circular-schedule.vercel.app/api/config
curl -i https://kimdongup-circular-schedule.vercel.app/api/v1/apps
curl -i https://kimdongup-circular-schedule.vercel.app/server-admin
curl -i https://kimdongup-circular-schedule.vercel.app/manifest.json
curl -i https://kimdongup-circular-schedule.vercel.app/sw.js
curl -i https://kimdongup-circular-schedule.vercel.app/s/test
```

정상 기준은 다음과 같습니다.

- `/` : 200, `원형 시간표 관리 허브` HTML
- `/health` : 200, `databaseConfigured: true`
- `/api/config` : 200, `supabaseUrl`과 `supabasePublishableKey` 반환
- `/api/v1/apps` : 200, 앱 목록 JSON
- `/server-admin` 및 `/admin/` : 로그인된 관리자만 관리 화면 표시, 그 외 사용자는 `/`로 이동
- `/manifest.json` 및 `/sw.js` : 200, PWA 설치와 시스템 알림 수신 파일
- `/s/test` : 메인 시간표 HTML

`/health`의 `webPushConfigured`가 `false`면 시간표와 DB 기능은 사용할 수 있지만 푸시 발송은 비활성화됩니다.

Web Push 수신 확인은 로그인 후 `/`의 사이드바에 표시되는 `푸시 알림 설정`에서 구독한 다음 시스템 알림 테스트로 진행합니다. 구독 등록·상태 확인·해제 API는 모두 유효한 Supabase 로그인 세션을 요구하며, 구독 사용자 ID에는 로그인 계정의 UUID가 자동으로 저장됩니다. 알림은 페이지 내부가 아니라 운영체제 알림 센터에 표시됩니다. iPhone과 iPad에서는 사이트를 홈 화면에 추가한 뒤 설치된 PWA에서 알림 권한을 허용해야 합니다.

공개 시간표는 누구나 열람할 수 있지만 복제와 삭제는 관리자만 할 수 있습니다. 공개 시간표 삭제는 관리자 인증이 적용된 Vercel API를 통해 실행됩니다. 기존 Supabase 프로젝트에서 브라우저의 직접 삭제까지 차단하려면 SQL Editor에서 `supabase_migrations/20260902_restrict_public_schedule_delete.sql`을 한 번 실행합니다.

## 7. 오류별 확인 위치

### `DEPLOYMENT_NOT_FOUND`

- 접속 주소가 현재 프로젝트의 Production Domain인지 확인합니다.
- `Settings → Domains`에서 도메인이 올바른 프로젝트와 Production 환경에 연결됐는지 확인합니다.
- 삭제된 고유 Deployment URL을 사용하고 있지 않은지 확인합니다.

### `FUNCTION_INVOCATION_FAILED`

- Vercel Dashboard의 `Logs`에서 첫 번째 uncaught exception을 확인합니다.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` 누락 여부를 확인합니다.
- 환경 변수를 추가한 뒤 Redeploy했는지 확인합니다.

### `/health`가 503인 경우

Supabase 설정이 빠진 상태입니다. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`를 등록하고 Redeploy합니다.

### 관리자 로그인이 되지만 권한이 없는 경우

먼저 메인 화면에서 관리자 계정으로 로그인합니다. 로그인 이메일을 `ADMIN_EMAILS`에 정확히 등록하거나 Supabase SQL Editor에서 다음을 실행합니다.

```sql
insert into public.user_roles (email, role)
values ('admin@example.com', 'admin')
on conflict (email) do update set role = 'admin';
```
