install:
	pip install -r requirements.txt

dev:
	cd backend && uvicorn app.main:app --reload --port 8000

# ── Database (run from backend/ directory) ────────────────────────────────────
# Step 1: Apply the bot's existing schema first (run once from the bot project):
#   cd C:\Projects\BrightFuturesUzbekistanNew && alembic upgrade head
#
# Step 2: Stamp this backend's alembic so it knows the baseline is already applied:
#   cd backend && alembic stamp head
#
# Step 3: Create new migrations for any additions made by this backend:
migrate:
	alembic revision --autogenerate -m "$(msg)"

upgrade:
	alembic upgrade head

downgrade:
	alembic downgrade -1

stamp:
	alembic stamp head
