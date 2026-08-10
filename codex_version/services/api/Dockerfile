FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY services/api/pyproject.toml services/api/pyproject.toml
COPY services/api/app services/api/app
COPY services/worker services/worker
RUN pip install ./services/api
COPY alembic.ini ./alembic.ini
COPY db ./db
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--app-dir", "services/api", "--host", "0.0.0.0", "--port", "8000"]
