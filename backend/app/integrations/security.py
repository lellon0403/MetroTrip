"""인증에 필요한 해시와 토큰 처리."""

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timezone


def hash_value(value: str) -> str:
    """인증 값이나 리프레시 토큰을 SHA-256으로 해시한다."""
    return hashlib.sha256(value.encode()).hexdigest()


def hash_code(code: str, secret: str) -> str:
    """이메일 인증 코드를 서버 비밀키로 해시한다."""
    return hmac.new(secret.encode(), code.encode(), hashlib.sha256).hexdigest()


def hash_password(password: str) -> str:
    """비밀번호를 scrypt로 단방향 해시한다."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt$16384$8$1${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """입력 비밀번호와 저장된 해시를 비교한다."""
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt),
            n=int(n),
            r=int(r),
            p=int(p),
        )
        return hmac.compare_digest(digest.hex(), expected)
    except (TypeError, ValueError):
        return False


def sign_token(payload: dict[str, object], secret: str) -> str:
    """전달받은 정보를 HMAC-SHA256 토큰으로 만든다."""

    def encode(value: object) -> str:
        """토큰 영역을 URL-safe Base64로 인코딩한다."""
        raw = json.dumps(value, separators=(",", ":")).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    header = encode({"alg": "HS256", "typ": "JWT"})
    body = encode(payload)
    signature = hmac.new(
        secret.encode(), f"{header}.{body}".encode(), hashlib.sha256
    ).digest()
    signature = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()
    return f"{header}.{body}.{signature}"


def decode_token(token: str, secret: str) -> dict[str, object]:
    """토큰의 서명과 만료 시간을 검증한다."""
    try:
        header, body, signature = token.split(".")
        expected = hmac.new(
            secret.encode(), f"{header}.{body}".encode(), hashlib.sha256
        ).digest()
        actual = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        payload = json.loads(
            base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
        )
        if not hmac.compare_digest(expected, actual):
            raise ValueError
        if int(payload["exp"]) <= int(datetime.now(timezone.utc).timestamp()):
            raise ValueError
        return payload
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise ValueError("유효하지 않거나 만료된 인증 토큰입니다.") from None
