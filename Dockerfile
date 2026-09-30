FROM oven/bun:1.2.21
WORKDIR /app
COPY package.json bun.lock* package-lock.json* ./
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 && rm -rf /var/lib/apt/lists/*
RUN bun install --frozen-lockfile
COPY . .
RUN bun --bun next build
EXPOSE 3210
CMD ["bun", "--bun", "next", "start", "-p", "3210"]
