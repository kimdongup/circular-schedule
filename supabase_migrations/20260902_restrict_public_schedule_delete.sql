-- 공개 시간표는 Vercel의 관리자 인증 API를 통해서만 삭제합니다.
-- 비공개 시간표는 작성자 본인이 계속 삭제할 수 있습니다.

drop policy if exists "Users can delete schedules" on public.schedules;

create policy "Users can delete schedules"
on public.schedules for delete
using (is_public = false and auth.uid() = user_id);
