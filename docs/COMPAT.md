# Local compatibility service

The Compose stack builds the in-house `compat` FastAPI service; it does not run the LiteLLM Proxy image. `compat` listens on container port 4000 and has no host port mapping. CAPI calls it at `http://compat:4000` and remains independently startable when the service is unavailable.

```sh
docker compose up --build
curl http://localhost:3210/api/health
```

The SDK is pinned in `compat/requirements.txt`. Requests to `/internal/v1/execute` require `CAPI_COMPAT_TOKEN` when configured. Credentials and `api_base` are request-scoped; the service never writes them to disk or environment variables. `num_retries=0` is passed on every LiteLLM call.
Check the service without an upstream:

```sh
docker compose up --build -d compat
docker compose exec compat python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:4000/health/ready').read().decode())"
```
