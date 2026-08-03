/**
 * public/ 안의 파일 주소를 만든다.
 *
 * GitHub Pages 는 /MetroTrip/ 하위 경로로 서비스되므로 '/logo.png' 처럼
 * 슬래시로 시작하는 주소를 쓰면 배포본에서 404가 난다.
 * BASE_URL 은 개발에서 '/', 빌드에서 '/MetroTrip/' 이다 (vite.config.ts 참고).
 */
export function asset(fileName: string): string {
  return `${import.meta.env.BASE_URL}${fileName}`;
}
