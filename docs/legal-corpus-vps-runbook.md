# LegalZeka Legal Corpus VPS Runbook

Bu runbook, LegalZeka SaaS backend'i ile ayni Postgres uzerinde calisan karar/mevzuat corpus katmanini kurar.

Mimari:

- LegalZeka Express backend aramayi `/api/search`, `/api/search/semantic`, `/api/search/ask` uzerinden sunar.
- Python `legal-data-worker` dis kaynaklardan veriyi ceker ve Postgres'e yazar.
- SaaS kullanicisi dis kaynaklara anlik gitmez; once lokal corpus aranir.
- Ilk backfill'de `EMBEDDING_ENABLED=false` onerilir. Embedding daha sonra batch olarak acilabilir.

## 1. Env

```bash
cp .env.example .env
nano .env
```

Minimum kontrol edilecekler:

```env
DATABASE_URL=postgresql://postgres:postgrespassword@postgres:5432/emsal_atlasi
JWT_SECRET=change-this
LEGAL_CORPUS_ENABLED=true
LEGAL_CORPUS_SEMANTIC_ENABLED=false
EMSAL_LOCAL_VECTOR_ENABLED=false
EMBEDDING_ENABLED=false
BEDESTEN_PHRASE=karar
MEVZUAT_MODE=all
MEVZUAT_PAGE_SIZE=50
MEVZUAT_MAX_RECORDS=0
REQUEST_DELAY_MS=1500
REQUEST_DELAY_JITTER_MS=1000
BEDESTEN_PAGE_COOLDOWN_MS=10000
BEDESTEN_429_SLEEP_MS=90000
```

## 2. Build + DB Migration

```bash
docker compose up -d postgres
docker compose build backend legal-data-worker
docker compose run --rm --no-deps backend npm run migrate
```

Kontrol:

```bash
docker compose exec -T postgres psql -U postgres -d emsal_atlasi -c "\dt"
```

Su tablolar gorunmeli:

- `decisions`
- `decision_chunks`
- `legislation`
- `legislation_articles`
- `ingestion_log`

## 3. Once Mevzuat

```bash
docker compose run --rm --no-deps \
  -e EMBEDDING_ENABLED=false \
  -e MEVZUAT_MODE=all \
  -e MEVZUAT_PAGE_SIZE=50 \
  -e MEVZUAT_MAX_RECORDS=0 \
  legal-data-worker python backfill.py --source mevzuat --years 5
```

Kontrol:

```bash
docker compose exec -T postgres psql -U postgres -d emsal_atlasi -c \
"select count(*) as legislation, (select count(*) from legislation_articles) as articles from legislation"
```

Canli endpoint kontrolunde `Kanun` turu icin 914 mevzuat kaydi gorundu. Tam kosudan once kisa smoke icin ayni komutu `-e MEVZUAT_MAX_RECORDS=3` ile calistirabilirsin.

## 4. Sonra Ictihat

Ilk hafta uzun kosu icin `tmux` veya `screen` kullan:

```bash
tmux new -s legal-corpus
```

Yargitay genel son 5 yil:

```bash
docker compose run --rm --no-deps \
  -e EMBEDDING_ENABLED=false \
  -e BEDESTEN_PHRASE=karar \
  -e BEDESTEN_429_SLEEP_MS=90000 \
  -e BEDESTEN_PAGE_COOLDOWN_MS=10000 \
  legal-data-worker python fetch_bedesten_sample.py \
  --source bedesten_yargitay \
  --target 50000 \
  --years 5 \
  --page-size 10
```

BAM icin:

```bash
docker compose run --rm --no-deps \
  -e EMBEDDING_ENABLED=false \
  -e BEDESTEN_PHRASE=karar \
  legal-data-worker python fetch_bedesten_sample.py \
  --source bedesten_bam \
  --target 30000 \
  --years 5 \
  --page-size 10
```

## 5. Izleme

```bash
docker compose exec -T postgres psql -U postgres -d emsal_atlasi -c \
"select source,last_run_status,records_fetched_last_run,updated_at from ingestion_log order by updated_at desc"

docker compose exec -T postgres psql -U postgres -d emsal_atlasi -c \
"select source,count(*) from decisions group by source order by source"

docker compose exec -T postgres psql -U postgres -d emsal_atlasi -c \
"select count(*) from decision_chunks"

docker compose exec -T postgres psql -U postgres -d emsal_atlasi -c \
"select count(*) from legislation_articles"
```

## 6. Backend Search Smoke

MCP ve eski local vector'u kapatarak sadece lokal corpus smoke testi:

```bash
docker compose run --rm --no-deps \
  -e EMSAL_LIVE_MCP=false \
  -e EMSAL_LOCAL_VECTOR_ENABLED=false \
  -e LEGAL_CORPUS_ENABLED=true \
  backend node -e "const { searchEmsal } = require('./src/services/emsal/searchOrchestrator'); (async () => { const r = await searchEmsal({ query: 'tahliye kira', mode: 'keyword', limit: 5, includeLive: false, indexLiveResults: false }); console.log(JSON.stringify({ total: r.totalResults, local: r.diagnostics.local, first: r.results[0] }, null, 2)); process.exit(0); })().catch(e => { console.error(e); process.exit(1); });"
```

## 7. SaaS'i Ac

```bash
docker compose up -d backend client
```

Frontend zaten backend'e su endpointler ile baglidir:

- `GET /api/search?q=...`
- `POST /api/search/semantic`
- `POST /api/search/ask`

Corpus entegrasyonu backend tarafinda oldugu icin frontend tarafinda zorunlu degisiklik yoktur.
