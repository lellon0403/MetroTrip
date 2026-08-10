# 모바일 릴리스 체크리스트

기준일: 2026-08-09

이 문서는 Expo Web export가 아니라 실제 iOS·Android 배포 가능성을 판정한다. 체크하지 않은 항목은 완료로 추정하지 않는다.

## 1. 현재 자동 검증

- [x] TypeScript `tsc --noEmit`
- [x] Expo Router Web export
- [x] access token 메모리 저장, refresh token SecureStore 저장 구조
- [x] API 401 시 refresh 1회 재시도 구조
- [x] SQLite 계획 캐시·마지막 동기화 시각·로컬 완료 대기열
- [x] 위치 권한 거부 시 역 검색 대체 흐름
- [x] 알림 `resourceType`/`resourceId`의 계획·후기·모집·공지 route 변환
- [x] 모바일 로그아웃 시 refresh token 서버 폐기 요청과 SecureStore 삭제
- [x] 로그인 사용자 변경·로그아웃 시 SQLite 계획/진행 캐시 격리·삭제
- [x] refresh 네트워크 오류 시 credential을 보존하고 UI가 무한 loading에 머물지 않는 fallback

## 2. 출시 차단 설정

- [ ] `OPEN` 개인정보처리방침과 이용약관 HTTPS URL 확정
- [ ] `BLOCKED` Expo/EAS project ID, Apple Team, App Store Connect 앱, Android signing key와 Play Console 앱 연결
- [ ] `BLOCKED` 운영 API origin과 TLS 인증서 확정
- [ ] `BLOCKED` 운영 push provider 자격 증명과 APNs/FCM 설정
- [ ] 앱 이름, 아이콘, splash, 스토어 설명, 스크린샷, 연령 등급 확정
- [ ] iOS `NSLocationWhenInUseUsageDescription`과 Android 위치 권한 설명을 실제 사용 목적 문구로 검토
- [ ] 알림·위치·사진 권한을 첫 실행에 일괄 요청하지 않는지 확인
- [ ] 운영 build에서 개발 기본 JWT·S3·push secret 사용 시 부팅 실패하는지 확인

## 3. 실제 기기 기능 검증

아래는 현재 모두 `NOT VERIFIED`다. iOS 1대와 Android 1대 이상에서 각각 확인한다.

- [ ] 신규 설치 → 로그인 → 앱 종료/재실행 후 세션 복원
- [ ] 액세스 토큰 만료 뒤 화면 이탈 없이 refresh 회전
- [ ] 로그아웃·탈퇴 뒤 SecureStore refresh와 보호 화면 캐시 제거
- [ ] 위치 허용: 가까운 역과 주변 장소 표시
- [ ] 위치 거부·정밀 위치 비활성: 수동 역 검색으로 탐색 가능
- [ ] 네트워크 단절: 캐시된 계획, 마지막 동기화 시각, 오늘 모드 표시
- [ ] 오프라인 완료 체크 → 재연결 → 중복 없이 동기화
- [ ] 앱이 열린 상태·백그라운드·종료 상태에서 알림 수신
- [ ] 계획·후기·모집·공지 알림을 눌렀을 때 올바른 상세 화면으로 이동
- [ ] `metrotrip://` 및 HTTPS universal/app link의 cold start·warm start
- [ ] 키보드가 로그인·검색·작성 CTA를 가리지 않음
- [ ] safe area, 회전 제한, 뒤로가기, Android hardware back 동작
- [ ] 글꼴 200%, VoiceOver/TalkBack, 충분한 touch target과 색 대비
- [ ] 저전력·셀룰러에서 원본 이미지 자동 다운로드 억제

## 4. 오류·보안·개인정보

- [ ] refresh token·비밀번호·push token·위치 좌표가 로그와 crash report에 남지 않음
- [ ] 인증 실패, 429, 5xx, 오프라인 상태가 서로 구분된 복구 안내를 제공
- [ ] 앱 전환 화면과 screenshot에 민감 정보가 노출되지 않는지 정책 결정
- [ ] push token 변경·무효화·로그아웃 시 서버 device 상태 갱신
- [ ] 탈퇴 전 현재 비밀번호와 `DELETE` 확인, 탈퇴 뒤 보호 화면 접근 차단
- [ ] 로컬 DB/캐시 보존 기간과 계정 전환 시 격리 확인

## 5. 성능·관측·승인

- [ ] 대표 중급 기기에서 cold start, 홈 표시, 탐색 지도, 계획 상세 시간을 기록
- [ ] API request ID와 mobile release/version을 오류 보고에 연결
- [ ] crash-free session 99.5% 목표 대시보드와 경보 설정 (`OPEN`)
- [ ] 최소 지원 OS와 기기 범위 확정
- [ ] TestFlight/Internal testing에서 PM·개발·접근성 검수 승인
- [ ] rollback 가능한 직전 store build와 운영 API 호환 범위 기록

## 6. 판정

현재 판정은 `NOT READY FOR STORE RELEASE`다. 코드 수준 Phase H는 구현됐지만, 운영 자격 증명과 실제 iOS/Android 기기 증거가 없으므로 스토어 출시 완료로 표시하지 않는다.
