.PHONY: dev down build lint format car-model fleet-models audio sim shell clean

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

# Rebuild public/models/fleet/*.glb (the Proving Ground's parked cars)
fleet-models:
	docker compose run --rm web npm run model:fleet

# Rebuild public/audio/drivetrain/*.mp3 from the CC0 recordings (assets/audio/LICENSE.txt);
# ffmpeg goes into a throwaway container, so the dev image stays slim
audio:
	docker compose run --rm web bash -c "apt-get update -qq && apt-get install -y -qq --no-install-recommends ffmpeg > /dev/null && npm run audio:build"

# Headless handling sim: driving, jump, ring and half-loop checks on both levels
sim:
	docker compose run --rm web npm run sim:car

shell:
	docker compose run --rm web bash

# Stop everything and remove the image and volumes
clean:
	docker compose down --rmi local --volumes
