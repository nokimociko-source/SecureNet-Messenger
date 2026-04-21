# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN go build -o main cmd/server/main.go

# Run stage
FROM alpine:latest

WORKDIR /app

# Install necessary libraries
RUN apk add --no-cache ca-certificates libc6-compat

# Copy the binary from builder
COPY --from=builder /app/main .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8080

# Command to run
CMD ["./main"]
