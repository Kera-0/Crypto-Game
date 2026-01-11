.SILENT: run
run:
	docker compose build
	docker compose up -d --remove-orphans