# NCP Docker Compose 수동 배포

개발 PC에서 `main` 태그로 이미지를 빌드해 Docker Hub에 Push하고, NCP 서버는 같은 태그를 Pull하여 컨테이너를 교체한다.

## 개발 PC: 이미지 빌드와 Push

프로젝트 루트에서 Docker Hub에 로그인하고 카카오 JavaScript 키를 입력한다.

```powershell
Set-Location "C:\path\to\MetroTrip"
docker login --username jeonseho00
$env:NEXT_PUBLIC_KAKAO_JS_KEY = Read-Host "카카오 JavaScript 키"
```

Linux AMD64 이미지를 빌드하고 Push한다.

```powershell
docker build --platform linux/amd64 -t "jeonseho00/metrotrip-backend:main" .\backend
docker push "jeonseho00/metrotrip-backend:main"

docker build `
  --platform linux/amd64 `
  --build-arg "NEXT_PUBLIC_KAKAO_JS_KEY=$env:NEXT_PUBLIC_KAKAO_JS_KEY" `
  -t "jeonseho00/metrotrip-frontend:main" `
  .\frontend
docker push "jeonseho00/metrotrip-frontend:main"
```

## NCP 서버: 최초 준비

- `metrotrip.kro.kr`의 A 레코드가 NCP 서버 공인 IP를 가리켜야 한다.
- NCP ACG와 Ubuntu 방화벽에서 TCP 80/443을 허용한다.
- Docker Engine과 Docker Compose 플러그인을 설치한다.
- Docker Hub 저장소가 비공개라면 `docker login --username jeonseho00`을 한 번 실행한다.

백엔드 환경변수 예시를 복사한 뒤 실제 값을 입력한다. `deploy/docker/backend.env`는 서버에만
보관하며 Git이나 Docker 이미지에 포함하지 않는다.

```bash
cp deploy/docker/backend.env.example deploy/docker/backend.env
chmod 600 deploy/docker/backend.env
```

인증서는 다음 위치에 서버로 별도 전송한다.

```text
backend/certs/mysql/ca.pem
backend/certs/oracle/tnsnames.ora
backend/certs/oracle/sqlnet.ora
backend/certs/oracle/ewallet.pem
backend/certs/oracle/ewallet.p12
backend/certs/oracle/cwallet.sso
```

컨테이너 안에서는 `/run/certs`로 마운트되므로 `deploy/docker/backend.env`에 다음 경로를
사용한다.

```env
METROTRIP_SSL_CA_PATH=/run/certs/mysql/ca.pem
METROTRIP_ORACLE_WALLET_DIR=/run/certs/oracle
```

## NCP 서버: 배포와 업데이트

최초 배포와 이후 업데이트 모두 프로젝트 루트에서 같은 명령을 사용한다.

```bash
cd /opt/metrotrip
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
```

한 줄로 업데이트하려면 다음을 실행한다.

```bash
cd /opt/metrotrip && docker compose pull && docker compose up -d
```

상태와 로그를 확인한다.

```bash
curl -I https://metrotrip.kro.kr
docker compose logs --tail=200 caddy frontend api
```

Caddy는 80/443 포트에 접근할 수 있으면 TLS 인증서를 자동으로 발급하고 갱신한다.
`docker compose down -v`는 영속 볼륨까지 삭제하므로 사용하지 않는다.
