import asyncio
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.database import AsyncSessionLocal, engine
from app.models.region import Region, School, LearningCenter

REGIONS = [
    {"en": "Andijan", "uz": "Andijon", "ru": "Андижан"},
    {"en": "Bukhara", "uz": "Buxoro", "ru": "Бухара"},
    {"en": "Fergana", "uz": "Farg'ona", "ru": "Фергана"},
    {"en": "Jizzakh", "uz": "Jizzax", "ru": "Джизак"},
    {"en": "Xorazm", "uz": "Xorazm", "ru": "Хорезм"},
    {"en": "Namangan", "uz": "Namangan", "ru": "Наманган"},
    {"en": "Navoiy", "uz": "Navoiy", "ru": "Навоий"},
    {"en": "Qashqadaryo", "uz": "Qashqadaryo", "ru": "Кашкадарья"},
    {"en": "Samarkand", "uz": "Samarqand", "ru": "Самарканд"},
    {"en": "Sirdaryo", "uz": "Sirdaryo", "ru": "Сырдарья"},
    {"en": "Surxondaryo", "uz": "Surxondaryo", "ru": "Сурхандарья"},
    {"en": "Tashkent", "uz": "Toshkent", "ru": "Ташкент"},
    {"en": "Tashkent City", "uz": "Toshkent shahri", "ru": "Город Ташкент"},
    {"en": "Republic of Karakalpakstan", "uz": "Qoraqalpog'iston Respublikasi", "ru": "Республика Каракалпакстан"},
]

async def seed_data():
    async with AsyncSessionLocal() as session:
        # Check if regions already exist
        result = await session.execute(select(Region))
        existing_regions = result.scalars().all()
        
        if not existing_regions:
            print("Seeding Regions...", flush=True)
            db_regions = []
            for r in REGIONS:
                reg = Region(name_en=r["en"], name_uz=r["uz"], name_ru=r["ru"])
                session.add(reg)
                db_regions.append(reg)
            
            await session.commit()
            for r in db_regions:
                await session.refresh(r)
            
            print("Seeding sample Schools and Learning Centers...", flush=True)
            # Add some dummy schools and LCs to the first region (e.g. Tashkent City if we find it, or just all)
            for reg in db_regions:
                # Add 2 schools
                session.add(School(name=f"Presidential School ({reg.name_en})", region_id=reg.id))
                session.add(School(name=f"Specialized IT School ({reg.name_en})", region_id=reg.id))
                
                # Add 3 LCs
                session.add(LearningCenter(name=f"Cambridge Learning Center ({reg.name_en})", region_id=reg.id))
                session.add(LearningCenter(name=f"Najot Ta'lim ({reg.name_en})", region_id=reg.id))
                session.add(LearningCenter(name=f"Everest ({reg.name_en})", region_id=reg.id))
                
            await session.commit()
            print("Seed complete!", flush=True)
        else:
            print("Regions already exist in the database. Skipping seed.", flush=True)

    await engine.dispose()

if __name__ == "__main__":
    # Ensure working directory is backend
    if not os.path.exists("app"):
        print("Please run this script from the backend directory.")
        exit(1)
    
    asyncio.run(seed_data())
