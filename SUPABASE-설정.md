# Supabase 붙이기 — 처음부터 끝까지

데모 모드는 브라우저에만 저장되므로 **각자 자기 화면만 봅니다.**
팀이 같은 목록을 보려면 데이터베이스가 필요합니다. 아래 여섯 단계면 됩니다.

무료 등급으로 충분합니다. 신용카드도 필요 없습니다.

---

## ① 계정과 프로젝트 만들기

1. https://supabase.com 접속 → **Start your project** → GitHub 계정으로 로그인.
2. **New project**
   - Name: `pct-workflow` (아무 이름이나 됩니다)
   - Database Password: 길게 하나 만들어 **어딘가 적어 두세요.** 다시 볼 수 없습니다.
   - Region: `Northeast Asia (Seoul)`
3. 2~3분 기다리면 준비됩니다.

## ② 스키마 올리기

1. 왼쪽 메뉴 → **SQL Editor** → **New query**
2. 이 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 전체를 복사해 붙여 넣습니다.
3. **Run** (또는 Ctrl+Enter).
4. `Success. No rows returned` 가 나오면 된 것입니다.

> 여러 번 실행해도 안전합니다. `NOTICE: relation "spec" already exists, skipping`
> 같은 메시지는 오류가 아니라 "이미 있어서 건너뛴다"는 뜻입니다.

## ③ 접속 정보 복사

왼쪽 메뉴 → **Settings(⚙) → API**

| 화면의 이름 | 복사해서 넣을 곳 |
|---|---|
| Project URL | `js/config.js` 의 `SUPABASE_URL` |
| Project API keys → **anon / public** | `js/config.js` 의 `SUPABASE_ANON_KEY` |

> ⚠️ **`service_role` 키는 절대 복사하지 마세요.**
> 그 키는 RLS 를 통째로 우회합니다. 브라우저에 들어가면 링크를 아는 누구나
> 전체 데이터를 지울 수 있습니다.
>
> `anon` 키는 공개해도 되는 키입니다. 실제 접근 제어는 키가 아니라
> `schema.sql` 의 RLS 정책이 합니다.

## ④ 본인 계정 만들고 관리자로 심기

스키마만 올리면 `app_user` 가 비어 있어 로그인해도 아무것도 안 보입니다.

1. **Authentication → Users → Add user → Create new user**
   - Email / Password 를 넣고 **Auto Confirm User** 를 켭니다.
2. 만들어진 사용자 줄의 **UUID** 를 복사합니다.
3. **SQL Editor** 에서 아래를 실행합니다 (uuid·이름·메일을 본인 것으로 바꾸세요):

```sql
insert into public.app_user (id, name, email, org, role, status)
values ('여기에-복사한-uuid', '한지혜', 'me@example.com', '원가기획팀', '관리자', '승인')
on conflict (id) do update set role = '관리자', status = '승인';
```

## ⑤ 켜기

`js/config.js` 를 열어 세 줄을 고칩니다.

```js
SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
USE_SUPABASE: true
```

페이지를 새로 고치면 로그인 창이 뜨고, 오른쪽 위 표시가 **Supabase 모드**로 바뀝니다.

> 커밋하지 않고 잠깐 확인만 하려면 `USE_SUPABASE` 는 `false` 로 두고
> 주소 뒤에 `?supabase=1` 을 붙이세요.

## ⑥ 팀원 추가

1. 팀원이 **Authentication → Users** 에 계정을 만들거나, 각자 가입합니다.
2. 그 사람의 uuid 로 `app_user` 에 한 줄을 넣습니다 (역할은 `작업 요청자` 또는 `작업 수행자`):

```sql
insert into public.app_user (id, name, email, org, role, status)
values ('팀원-uuid', '정민수', 'jms@dawon.example.com', '다원기술', '작업 수행자', '승인대기');
```

3. 관리자 계정으로 접속해 **[사용자 · 권한 관리]** 에서 **승인**을 누릅니다.
   승인하기 전에는 그 사람에게 배정도 되지 않고, 로그인해도 아무것도 보이지 않습니다.

---

## 잘 안 될 때

| 증상 | 원인과 해결 |
|---|---|
| "데모 모드로 엽니다" 토스트가 뜬다 | 스키마를 아직 안 올렸거나 URL/키가 틀렸습니다. ②③ 을 다시 하세요 |
| 로그인은 되는데 목록이 비어 있다 | `app_user` 에 본인 줄이 없습니다. ④ 를 하세요 |
| "로그인한 계정이 app_user 에 없습니다" | 같은 원인입니다 |
| 저장은 되는데 새로 고치면 사라진다 | RLS 가 INSERT 를 막고 있습니다. 본인 `status` 가 `승인` 인지 확인하세요 |
| `supabase-js 를 불러오지 못했습니다` | 사내망이 CDN 을 막고 있습니다. 데모 모드로 쓰거나 망 밖에서 여세요 |
| 표는 보이는데 수정이 안 된다 | 역할을 확인하세요. 검토/완료는 `작업 요청자`·`관리자`만 됩니다 |

## 용량은 얼마나 드나

거의 안 듭니다. **엑셀 원본도 사진도 데이터베이스에 넣지 않기 때문입니다.**
표에 남는 것은 품번·항목 값·어느 파일의 몇 번째 시트인지뿐이라,
사양서 수만 건을 넣어도 무료 등급(500MB) 안에서 여유가 있습니다.

원본까지 옮기고 싶어지면 Supabase Storage 를 쓸 수 있습니다. 다만 **그쪽은 금방 찹니다** —
사양서에는 부품 사진이 들어 있어 한 건이 수백 KB~수 MB 입니다.
기획자가 보낸 10건이 이미 4MB 였습니다. 지금처럼 사내 공유 폴더에 두고
색인만 올리는 편이 오래 갑니다.

## 색인은 어떻게 올리나

사내에서 `build_index.py` 로 색인을 만든 뒤, 그 내용을 `spec` 표에 넣습니다.

```bash
python3 scripts/build_index.py "//서버/공유/사양서 모음" --json -o index.json
```

색인 쓰기는 **생산기술팀(editor) 권한이 있어야** 됩니다.
`app_user` 표에서 본인 계정의 `role` 을 `editor` 로, `status` 를 `승인` 으로
바꿔 두세요. 가입만 해서는 `reader` 이고, 검색만 됩니다.
