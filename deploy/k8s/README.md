# MetroTrip Kubernetes 배포 예시

이 디렉터리는 실제 서비스와 유사한 Kubernetes 구성을 보여 주는 예시다. Traefik
Ingress Controller와 cert-manager가 클러스터에 이미 설치되어 있다고 가정한다. 현재
환경에서는 실제 클러스터 적용을 검증하지 않았다.

## 구성

- `frontend`와 `api`는 클러스터 내부 `ClusterIP` Service만 사용한다.
- Traefik이 `metrotrip.kro.kr` 요청을 `frontend` Service로 전달한다.
- 프론트 이미지는 `/api/v1` 요청을 `http://api:8000`으로 전달한다.
- cert-manager가 `metrotrip-tls` Secret을 생성하고 인증서를 갱신한다.
- 백엔드는 내장 Oracle 동기화 스케줄러의 중복 실행을 막기 위해 replica 1과
  `Recreate` 전략을 사용한다.
- `/app/media`는 5Gi PVC, `/app/var`는 Pod 수명 동안만 유지되는 `emptyDir`이다.

## 적용 전 수정

`cluster-issuer.yaml`의 이메일 placeholder를 실제 이메일로 바꾼다.

```yaml
email: replace-with-your-email@example.com
```

클러스터의 기본 StorageClass가 없다면 `media-pvc.yaml`에 `storageClassName`을
추가한다.

```bash
kubectl get storageclass
```

## 환경변수 Secret

기존 서버용 `deploy/docker/backend.env`의 인증서 경로가 다음과 같은지 확인한다.

```env
METROTRIP_SSL_CA_PATH=/run/certs/mysql/ca.pem
METROTRIP_ORACLE_WALLET_DIR=/run/certs/oracle
```

namespace를 먼저 만들고 환경변수 Secret을 생성한다. 실제 값은 YAML이나 Git에
포함하지 않는다.

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl create secret generic backend-env \
  --namespace metrotrip \
  --from-env-file=deploy/docker/backend.env
```

## DB 인증서 Secret

MySQL CA와 Oracle Wallet을 각각 Secret으로 만든다.

```bash
kubectl create secret generic mysql-ca \
  --namespace metrotrip \
  --from-file=ca.pem=backend/certs/mysql/ca.pem

kubectl create secret generic oracle-wallet \
  --namespace metrotrip \
  --from-file=backend/certs/oracle
```

## Manifest 적용

Secret을 준비한 뒤 나머지 리소스를 적용한다.

```bash
kubectl apply -k deploy/k8s
kubectl get all,pvc,ingress -n metrotrip
```

상태를 확인한다.

```bash
kubectl rollout status deployment/api -n metrotrip
kubectl rollout status deployment/frontend -n metrotrip
kubectl get certificate,certificaterequest,challenge -n metrotrip
kubectl logs deployment/api -n metrotrip --tail=200
```

`main` 태그를 갱신한 뒤 같은 태그의 이미지를 다시 배포하려면 rollout을 재시작한다.

```bash
kubectl rollout restart deployment/api deployment/frontend -n metrotrip
```

Docker Compose의 Caddy와 Kubernetes의 Traefik은 같은 서버에서 동시에 80/443을 사용할
수 없다. 실제 전환 시에는 한쪽 외부 진입점만 실행한다.
