FROM oven/bun:1.2.21
WORKDIR /app
COPY package.json bun.lock* package-lock.json* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun --bun next build
EXPOSE 3210
CMD ["bun", "--bun", "next", "start", "-p", "3210"]
