# ===== Build Stage =====
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build standalone binary (NOT the Vercel handler)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o /bin/catlover-backend \
    ./cmd/server/main.go

# ===== Runtime Stage =====
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata postgresql-client

WORKDIR /app

# Copy binary
COPY --from=builder /bin/catlover-backend /app/catlover-backend

# Copy migration script
COPY --from=builder /app/scripts/create-partition.sh /app/scripts/create-partition.sh
RUN chmod +x /app/scripts/create-partition.sh

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

# Run
ENTRYPOINT ["/app/catlover-backend"]
