import asyncio
import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from dotenv import load_dotenv

load_dotenv(os.path.join("backend", ".env"))
DATABASE_URL = os.getenv("DATABASE_URL")

async def cleanup_duplicates():
    if not DATABASE_URL:
        print("DATABASE_URL not found")
        return
    
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        # Find telegram_ids with multiple entries
        result = await conn.execute(text("SELECT telegram_id FROM users GROUP BY telegram_id HAVING COUNT(*) > 1;"))
        tg_ids = [row[0] for row in result.fetchall()]
        
        for tg_id in tg_ids:
            print(f"Cleaning up duplicates for Telegram ID {tg_id}...")
            # Keep the one that is registered, or the latest one
            # We'll just delete all but the highest ID
            await conn.execute(text("""
                DELETE FROM users 
                WHERE telegram_id = :tg_id 
                AND id NOT IN (
                    SELECT id FROM users 
                    WHERE telegram_id = :tg_id 
                    ORDER BY is_registered DESC, created_at DESC 
                    LIMIT 1
                );
            """), {"tg_id": tg_id})
        
        # Now try to add the UNIQUE constraint
        try:
            print("Adding UNIQUE constraint to telegram_id...")
            await conn.execute(text("ALTER TABLE users ADD CONSTRAINT uq_user_telegram_id UNIQUE (telegram_id);"))
            print("UNIQUE constraint added successfully.")
        except Exception as e:
            print(f"Could not add unique constraint: {e}")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(cleanup_duplicates())
