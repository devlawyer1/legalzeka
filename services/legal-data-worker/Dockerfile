FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/worker

WORKDIR /app/worker

RUN apt-get update \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && rm -rf /usr/local/lib/python3.11/site-packages/pip* \
              /usr/local/lib/python3.11/site-packages/setuptools* \
              /usr/local/lib/python3.11/site-packages/wheel* \
              /usr/local/lib/python3.11/site-packages/jaraco*

RUN useradd --create-home --uid 10001 worker
COPY --chown=10001:10001 . .
USER worker

CMD ["python", "delta_sync.py", "--source", "mevzuat"]
