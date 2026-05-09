import asyncio
from sqlalchemy import text
from app.database import engine

async def check_table():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT to_regclass('public.project_applications');"))
        row = result.fetchone()
        print(f"Table exists: {row[0] is not None}")

if __name__ == "__main__":
    asyncio.run(check_table())
