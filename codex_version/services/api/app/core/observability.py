import json
import logging
import threading
from collections import defaultdict

logger = logging.getLogger("metrotrip.http")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

_lock = threading.Lock()
_requests: dict[tuple[str, str, int], int] = defaultdict(int)
_duration_ms: dict[tuple[str, str], float] = defaultdict(float)


def record_request(
    method: str, route: str, status_code: int, duration_ms: float, request_id: str
) -> None:
    with _lock:
        _requests[(method, route, status_code)] += 1
        _duration_ms[(method, route)] += duration_ms
    logger.info(
        json.dumps(
            {
                "event": "http.request",
                "method": method,
                "route": route,
                "status": status_code,
                "durationMs": round(duration_ms, 2),
                "requestId": request_id,
            },
            ensure_ascii=False,
        )
    )


def prometheus_snapshot() -> str:
    with _lock:
        lines = ["# TYPE metrotrip_http_requests_total counter"]
        for (method, route, status_code), count in sorted(_requests.items()):
            labels = f'method="{method}",route="{route}",status="{status_code}"'
            lines.append(f"metrotrip_http_requests_total{{{labels}}} {count}")
        lines.append("# TYPE metrotrip_http_duration_milliseconds_total counter")
        for (method, route), duration in sorted(_duration_ms.items()):
            labels = f'method="{method}",route="{route}"'
            lines.append(f"metrotrip_http_duration_milliseconds_total{{{labels}}} {duration:.2f}")
    return "\n".join(lines) + "\n"
