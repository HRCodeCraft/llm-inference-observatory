.PHONY: up down logs migrate build sdk dev-ingestion dev-frontend

COMPOSE = docker-compose

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

migrate:
	$(COMPOSE) exec ingestion alembic upgrade head

build:
	$(COMPOSE) build

sdk:
	cd sdk && npm install && npm run build

dev-ingestion:
	cd ingestion && pip3 install -r requirements.txt && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm install && npm run dev
