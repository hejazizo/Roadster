.PHONY: dev down build lint format car-model shell clean

# Build the image and start the dev server on http://localhost:5173
dev:
	docker compose up --build --renew-anon-volumes

down:
	docker compose down

build:
	docker compose run --rm web npm run build

lint:
	docker compose run --rm web npm run lint

format:
	docker compose run --rm web npm run format

# Rebuild public/models/car.glb from the source model in assets/
car-model:
	docker compose run --rm web npm run model:car

shell:
	docker compose run --rm web bash

# Stop everything and remove the image and volumes
clean:
	docker compose down --rmi local --volumes
