---
title: SDKs
description: Official Capi SDKs for Python, Node.js, PHP, Java, Ruby, and Go.
---

Every SDK is a thin, typed wrapper over the REST API. They share the same surface — a client, per-modality namespaces, and a task helper that blocks until a result is ready.

## Install

```bash
pip install capi                 # Python
npm install @capi.ai/sdk         # Node.js
composer require capi-ai/sdk     # PHP
```

```bash
gem install capi                 # Ruby
go get github.com/capi-ai/capi-go
```

For Java, add the dependency to your build:

```xml
<dependency>
  <groupId>ai.capi</groupId>
  <artifactId>capi-java</artifactId>
  <version>3.2.0</version>
</dependency>
```

## Common shape

All SDKs expose the same four things:

1. A client constructed from `CAPI_API_KEY`.
2. Namespaces per modality: `.video`, `.image`, `.music`, `.audio`, `.chat`.
3. A `wait()` helper on async results.
4. Automatic retries with exponential backoff on `429` and `5xx`.

## Python

```python
from capi import Capi

client = Capi()  # reads CAPI_API_KEY

# Async task
task = client.video.generate(
    model="kling-v3-turbo-text-to-video",
    prompt="A paper kite above a coastal town at sunrise",
)
print(task.wait().videos[0].url)

# Sync call
reply = client.chat.completions.create(
    model="claude-opus-5",
    messages=[{"role": "user", "content": "Hello"}],
)
print(reply.choices[0].message.content)
```

An async client mirrors the same API for `asyncio` applications:

```python
from capi import AsyncCapi

async with AsyncCapi() as client:
    task = await client.video.generate(
        model="seedance-2.5-text-to-video",
        prompt="paper lanterns over a river",
    )
    result = await task.wait()
```

## Node.js

Ships ESM and CJS builds plus full TypeScript declarations:

```javascript
import { Capi } from "@capi.ai/sdk";

const client = new Capi();

const task = await client.video.generate({
  model: "kling-v3-turbo-text-to-video",
  prompt: "A paper kite above a coastal town at sunrise",
});

const result = await task.wait();
console.log(result.videos[0].url);
```

## Configuration

| Option | Default | Purpose |
| --- | --- | --- |
| `api_key` | `CAPI_API_KEY` | Credential. |
| `base_url` | `https://capi.ai/api/v1` | Point at a proxy or mock. |
| `timeout` | 60s | Per-request timeout for sync calls. |
| `max_retries` | 2 | Retries on `429` and `5xx`. |
| `poll_interval` | 2s | Initial `wait()` poll interval; backs off to 10s. |

## Errors

All SDKs raise the same hierarchy, with the HTTP status and the provider's message attached:

```python
from capi import Capi, CapiError, RateLimitError, TaskFailedError

try:
    task = client.video.generate(model="kling-v3-turbo-text-to-video", prompt="...")
    result = task.wait()
except RateLimitError as e:
    print(e.retry_after)
except TaskFailedError as e:
    print(e.code, e.message)
except CapiError as e:
    print(e.status, e.message)
```

## Next steps

- [CLI](/docs/resources/cli) — the same surface from a terminal.
- [Quickstart](/docs/guides/quickstart) — first request in five minutes.
