.SILENT: run
run:
	docker compose build
	docker compose up -d --remove-orphans

IMAGE=hh:latest
NAME=hardhat
.SILENT: hh
hh:
	docker rm -f hardhat
	docker build ./app -t $(IMAGE)
	docker run -d --rm -p 8545:8545 --name $(NAME) $(IMAGE)

.SILENT: hh-console
hh-console:
	docker exec -it $(NAME) sh -lc "pnpm hardhat console --network localhost"

.SILENT: qhh
qhh:
	docker rm -f hardhat

.SILENT: deploy-local
deploy-local:
	docker exec $(NAME) sh -lc "cd /app && pnpm hardhat run scripts/deploy-local.ts --network localhost"
	docker cp $(NAME):/app/deploy-frontend.env ./frontend/.env.local
	docker cp $(NAME):/app/deploy-root.env ./.env
