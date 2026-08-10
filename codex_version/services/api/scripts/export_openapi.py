import json
from pathlib import Path

from app.main import app


def main() -> None:
    root = Path(__file__).resolve().parents[3]
    output = root / "generated" / "openapi.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OpenAPI exported: {output}")


if __name__ == "__main__":
    main()
