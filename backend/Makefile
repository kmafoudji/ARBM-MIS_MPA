# ARBM-MES Backend — Commandes de test

.PHONY: test test-fast test-sf4 test-sf5 test-sf7 test-sf10 test-api coverage

# Tous les tests
test:
	docker compose -f ../infra/docker-compose.yml exec backend pytest tests/ -v

# Tests rapides (sans marqueurs lents)
test-fast:
	docker compose -f ../infra/docker-compose.yml exec backend pytest tests/ -v -x

# Par sous-fonction
test-sf4:
	docker compose -f ../infra/docker-compose.yml exec backend pytest tests/test_sf4_lifecycle.py -v

test-sf5:
	docker compose -f ../infra/docker-compose.yml exec backend pytest tests/test_sf5_reporting.py -v

test-sf7:
	docker compose -f ../infra/docker-compose.yml exec backend pytest tests/test_sf7_gadm.py -v

test-sf10:
	docker compose -f ../infra/docker-compose.yml exec backend pytest tests/test_sf10_workspace.py -v

test-api:
	docker compose -f ../infra/docker-compose.yml exec backend pytest tests/test_api_projects.py tests/test_sf1_wizard.py -v

# Rapport de couverture
coverage:
	docker compose -f ../infra/docker-compose.yml exec backend pytest tests/ --cov=apps --cov-report=term-missing
