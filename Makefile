.PHONY: up down ps logs test lint build-all

up:
	docker-compose up -d

down:
	docker-compose down

ps:
	docker-compose ps

logs:
	docker-compose logs -f

test:
	go test -v ./...

lint:
	golangci-lint run

build-all:
	go build -o bin/gateway ./backend-gateway/main.go
	go build -o bin/chat ./backend-chat/main.go

# Helper to setup emulators (create instances/tables)
setup-dev:
	@echo "Setting up Spanner/Bigtable emulator schemas..."
	# Здесь будут скрипты инициализации таблиц
