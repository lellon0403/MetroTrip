# 후기·커뮤니티·공지사항 수동 테스트 가이드
reviews / community / notices 세 도메인을 Swagger UI(`/docs`)나 curl로 직접 눌러보며
검증할 때 쓰는 체크리스트입니다. 자동 테스트(`pytest`)와 겹치는 항목도 있지만,
실제 HTTP 응답과 여러 계정 간 상호작용은 자동 테스트가 다루지 않아 직접 확인이 필요합니다.

## 0. 준비
### 서버 실행
**Windows (PowerShell)**
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

**macOS / Linux (zsh·bash)**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

가상환경을 아직 안 만들었다면 먼저 `python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`로 준비하세요.

- Swagger UI: `http://localhost:8000/docs`
- 헬스체크: `http://localhost:8000/health`

### 테스트 계정 만들기
1. `POST /api/v1/auth/email-verifications` — `purpose: SIGNUP`으로 인증 코드 요청
2. 서버를 띄운 **터미널 로그**에서 6자리 코드 확인 (개발 환경은 `email_mode=console`)
3. `POST /api/v1/auth/email-verifications/confirm` — 코드 확인 후 `verificationToken` 받기
4. `POST /api/v1/auth/register` — 위 토큰으로 가입
5. `POST /api/v1/auth/login` — `accessToken` 발급



### Swagger에 로그인 상태로 호출하기
Swagger 우측 상단 **Authorize** 버튼 → `Bearer <accessToken>` 입력.
이후 인증이 필요한 API는 자동으로 헤더가 붙습니다.

### 공통 에러 형식
```json
{ "code": "SOME_ERROR_CODE", "message": "...", "details": null }
```

각 항목에서 괄호 안 코드(`400 STATION_NOT_FOUND` 등)가 그대로 나오는지 확인하세요.

---

## 1. 후기 (Reviews)
`start_station_id`/`end_station_id`로 쓸 실제 역 ID가 필요합니다.
DB의 `stations` 테이블에서 아무 값이나 두 개 확인해두세요(예: 1, 5).

### 새 후기 작성 요청 예시 (`POST /reviews` body)
- `startStationId`/`endStationId`는 위에서 확인한 실제 역 ID로 바꾸세요.
- `rating`은 1~10 정수만 허용됩니다.
- `planId`는 없으면 `null`로 두거나 필드 자체를 생략해도 됩니다.
- 미디어를 같이 등록하려면 `media`에 아래 형태로 채웁니다(먼저 `POST /review-media`로 실제 업로드를 마친 URL이어야 합니다):

```json
"media": [
  { "mediaUrl": "http://localhost:8000/api/v1/media/reviews/xxxxx.jpg", "mediaType": "IMAGE" }
]
```

- **400 `STATION_NOT_FOUND` 테스트용**: `startStationId`를 `999999999`처럼 존재하지 않는 값으로 바꿔서 보내보세요.
- **400 `PLAN_NOT_FOUND` 테스트용**: `planId`를 `999999`처럼 존재하지 않는 값으로 바꿔서 보내보세요.

{
    "pw" : stringst@#12
    "userId": 21,
    "email": "hon_12@gmail.com",
    "nickname": "hon02"
},
{
    "pw" : stringst@#123
    "userId": 22,
    "email": "hon_123@gmail.com",
    "nickname": "hon123"
},
{
    "pw" : stringst@#1234
    "userId": 23,
    "email": "hon_1234@gmail.com",
    "nickname": "hon1234"
}

- [o] `POST /reviews` 정상 작성 → 201, 응답에 `startStationName`/`endStationName`/`authorNickname`이 채워짐
- [o] 존재하지 않는 `startStationId`로 작성 → 400 `STATION_NOT_FOUND`
- [o] 존재하지 않는 `planId`로 작성 → 400 `PLAN_NOT_FOUND`
- [o] `GET /reviews` 목록 조회 → `page`/`size`/`totalElements` 정상
- [o] `GET /reviews?keyword=X&searchField=TITLE` → 제목에만 X가 있는 후기만 나오는지
- [o] `GET /reviews?keyword=X&searchField=CONTENT` → 내용에만 X가 있는 후기만 나오는지
- [o] `GET /reviews?keyword=X` (searchField 생략) → 제목·내용 둘 중 하나만 맞아도 나오는지
- [o] `GET /reviews?tag=X` → 해당 태그가 달린 후기만 나오는지
- [o] `GET /reviews/{id}` 두 번 연속 호출 → `viewCount`가 1→2로 증가
- [o] 다른 계정으로 `PATCH /reviews/{id}` 시도 → 403 `REVIEW_FORBIDDEN`
- [o] 본인 계정으로 `PATCH /reviews/{id}` (태그 교체 포함) → 200, `tags`가 새 값으로 바뀜
- [o] 본인 계정으로 `DELETE /reviews/{id}` → 204, 이후 `GET`은 404
- [o] `POST /review-media` (`contentType: image/jpeg`) → `uploadUrl`/`mediaUrl`/`expiresIn` 발급
- [o] 위 `uploadUrl`에 아무 파일이나 **PUT**(raw body)으로 업로드 → 204
- [o] 위 `mediaUrl`을 브라우저로 열기 → 방금 올린 파일이 그대로 보임
- [o] `contentType: text/plain` 등 지원 안 하는 타입으로 업로드 URL 요청 → 400 `UNSUPPORTED_MEDIA_TYPE`
- [o] 인증 없이 `POST /reviews` 시도 → 401/403

---

## 2. 커뮤니티 (Community)
- [o] `POST /posts` (`recruitCapacity`, `recruitDeadline` 필수) → 201, `recruitment.status`가 `RECRUITING`
- [o] `GET /posts` 목록 조회, `recruitStatus=RECRUITING` 필터
- [o] `GET /posts/{id}` 두 번 호출 → `viewCount` 증가
- [o] 본인 글 `PATCH /posts/{id}` 수정 → 200
- [o] 이미 수락된 인원보다 적은 `recruitCapacity`로 수정 시도 → 400 `RECRUIT_CAPACITY_TOO_LOW`
- [o] 본인 글 `DELETE /posts/{id}` → 204
- [o] **본인 글**에 `POST /posts/{id}/participants` 신청 시도 → 400 `CANNOT_APPLY_OWN_POST`
- [o] **다른 계정**으로 같은 글에 신청 → 201, `status: APPLIED`
- [o] 정원이 다 찬 글에 신청 시도 → 409 `RECRUIT_FULL`
- [o] 마감(`CLOSED`)된 글에 신청 시도 → 409 `RECRUIT_CLOSED`
- [o] 신청자 계정으로 `GET /posts/{id}/participants` 조회 시도 → 403 (작성자만 가능)
- [o] 작성자 계정으로 `GET /posts/{id}/participants` 조회 → 신청자 목록 정상
- [o] 작성자가 `PATCH /posts/{id}/participants/{pid}` (`ACCEPTED`) → 200. 
    - **정원이 그 시점에 다 차면** 글 상세의 `recruitment.status`가 자동으로 `CLOSED`로 바뀌는지 확인
- [o] 이미 수락/거절된 신청을 다시 처리 시도 → 409 `PARTICIPANT_NOT_PENDING`
- [o] 신청자 본인이 `PATCH /posts/{id}/participants/me` (`CANCELED`) → 200
- [o] 취소 후 같은 글에 재신청 → 201, `status: APPLIED`로 돌아옴 (신규 생성이 아니라 기존 신청 재사용인지 `participantId` 비교)
- [o] `GET /users/me/posts` — 내가 쓴 모집 글만, 최근 작성순으로 나오는지 (자동 테스트: `test_list_my_posts_*`)
- [o] `GET /users/me/participating-posts?status=APPLIED` — 내가 신청 중인 글만 나오는지 (자동 테스트: `test_list_my_applied_posts_*`)
- [o] `GET /users/me/participating-posts?status=ACCEPTED` — 내가 수락된 글만 나오는지 (자동 테스트: `test_list_my_accepted_posts_*`)

---

## 3. 공지사항 (Notices)
관리자 전용 API는 **회원가입만으로는 role이 ADMIN이 되지 않습니다.**
테스트 전에 DB에서 직접 승격해야 합니다.

**`mysql` 클라이언트가 있는 경우 (Windows/macOS 공통)**
```sql
UPDATE users SET role = 'ADMIN' WHERE email = '테스트계정@example.com';
```

**macOS에서 `mysql` 클라이언트가 따로 없는 경우**
`mysql` CLI를 설치하지 않았다면(macOS 기본값), 백엔드가 이미 쓰는
SQLAlchemy 연결을 그대로 빌려 아래처럼 실행하면 됩니다(`backend/.env`의
`METROTRIP_DATABASE_URL`을 그대로 사용하므로 별도 접속 정보 입력이 없습니다).

```bash
cd backend
source .venv/bin/activate
python -c "
from sqlalchemy import text
from app.database import SessionLocal
db = SessionLocal()
try:
    db.execute(
        text(\"UPDATE users SET role='ADMIN' WHERE email=:email\"),
        {'email': '테스트계정@example.com'},
    )
    db.commit()
finally:
    db.close()
"
```

- [o] role이 `USER`인 상태로 `POST /admin/notices` 시도 → 403 `ADMIN_ONLY`
- [o] 위 SQL로 승격 후 `POST /admin/notices` → 201
- [o] `GET /notices` — **로그아웃 상태(토큰 없이)**로 호출해도 200
- [o] `GET /notices?noticeType=ALARM` — 유형 필터 확인
- [o] `GET /notices/{id}` — 토큰 없이도 200
- [o] **다른 관리자 계정**으로 `PATCH /admin/notices/{id}` 수정 → 200 (작성자가 아니어도 관리자면 수정 가능한 것이 정책)
- [o] **다른 관리자 계정**으로 `DELETE /admin/notices/{id}` → 204, 이후 조회 404

---

## 자동 테스트 재실행
**Windows (PowerShell)**
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
ruff check .
```

**macOS / Linux (zsh·bash)**
```bash
cd backend
source .venv/bin/activate
pytest
ruff check .
```

- reviews: `tests/test_reviews_service.py`, `tests/test_review_media.py`
- community: `tests/test_community_service.py` (`내가 쓴 글`/`내가 참여한 글` 포함)
- notices: `tests/test_notices_service.py`, `tests/test_contract.py`(관리자 권한)

테스트 계정을 DB에 남기고 싶지 않다면, `users` 테이블에서 이메일로 찾아 직접
`DELETE` 하세요(연결된 후기·게시글·신청 내역은 CASCADE로 함께 삭제됩니다).