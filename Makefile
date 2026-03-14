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
	docker exec -it $(NAME) sh -lc "pnpm hardhat console --network localhost"

.SILENT: qhh
qhh:
	docker rm -f hardhat