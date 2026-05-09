import asyncio
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join("backend", ".env"))
DATABASE_URL = os.getenv("DATABASE_URL")

async def check_duplicates():
    if not DATABASE_URL:
        print("DATABASE_URL not found in .env")
        return
    
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT telegram_id, COUNT(*) 
            FROM users 
            WHERE is_deleted = False 
            GROUP BY telegram_id 
            HAVING COUNT(*) > 1;
        """))
        rows = result.fetchall()
        if not rows:
            print("No duplicates found with is_deleted=False.")
        for row in rows:
            print(f"Telegram ID {row[0]} has {row[1]} active user entries!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_duplicates())
