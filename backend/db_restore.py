"""Restore a `db_backup.py` snapshot — the proven other half of the nightly backup.

`db_backup.py` JSON-dumps every table nightly and ships a zip to the Telegram dev
group. That zip carries DATA ONLY: no schema, no sequences. Until something can
turn it back into a working database it is not a backup, it is a hopeful archive.
This is that something.

  schema     ← rebuilt from the SQLAlchemy models (Base.metadata.create_all), which
               is why the data-only dump is sufficient: the models ARE the schema.
  data       ← the zip, loaded in Base.metadata.sorted_tables order so foreign keys
               resolve parents-before-children.
  sequences  ← re-synced with setval() at the end. Skipping this is THE classic
               restore bug: every identity PK keeps its dumped value but the
               sequence still sits at 1, so the first new INSERT dies on a
               duplicate key — a restore that looks perfect until someone signs up.

SAFETY — this script is built so it cannot overwrite production:
  * --target is required and never defaults;
  * a target that looks like Railway/production is refused outright;
  * a non-local target additionally needs --allow-remote;
  * nothing is written without --yes (a plain run parses and validates only);
  * a target that already holds rows needs --wipe.

Usage:
    # validate a snapshot, write nothing
    python db_restore.py --zip bfu_db_20260721_0130.zip \
        --target postgresql://postgres:pw@localhost:55432/bfu_restore_test

    # actually restore into a throwaway database
    python db_restore.py --zip bfu_db_20260721_0130.zip --target … --wipe --yes
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import zipfile
from datetime import date, datetime
from urllib.parse import urlparse

# A recovery box is often a Windows laptop, whose console defaults to cp1252 and
# raises UnicodeEncodeError on any non-ASCII output. Losing a restore to a tick
# mark would be a farce, so make stdout total.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# The app's config fails loudly when ENVIRONMENT=production is half-configured.
# A restore runs on a laptop or a recovery box, so declare dev before importing it.
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("WEBAPP_URL", "http://localhost:5173")

from sqlalchemy import Date, DateTime, insert, text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.database import Base  # noqa: E402
import app.models  # noqa: E402,F401 — registers every model on Base.metadata

# Hosts that mean "this is the live system". Matching one is a hard stop: a
# restore is a bulk overwrite, and the whole point of a backup is that you reach
# for it when things are already going badly — exactly when a typo costs the most.
PROD_MARKERS = ("rlwy.net", "railway.internal", "railway.app")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "host.docker.internal"}
BATCH = 500


def _normalise(url: str) -> str:
    """Accept whatever form of URL a human pastes, hand asyncpg what it needs."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


def _guard(url: str, allow_remote: bool) -> str:
    host = (urlparse(url.replace("postgresql+asyncpg://", "postgresql://")).hostname or "").lower()
    if any(m in host for m in PROD_MARKERS):
        raise SystemExit(
            f"REFUSED: target host {host!r} looks like production.\n"
            "Restore into a NEW, empty database and cut over to it — never over the live one."
        )
    if host not in LOCAL_HOSTS and not allow_remote:
        raise SystemExit(
            f"REFUSED: target host {host!r} is not local. Re-run with --allow-remote "
            "if you really mean to restore onto a remote recovery box."
        )
    return host


def load_zip(path: str) -> dict[str, list[dict]]:
    """Read the snapshot into {table_name: [row, …]}."""
    out: dict[str, list[dict]] = {}
    with zipfile.ZipFile(path) as zf:
        for name in zf.namelist():
            if not name.endswith(".json"):
                continue
            out[name[:-len(".json")]] = json.loads(zf.read(name).decode("utf-8"))
    return out


def _coerce(table, rows: list[dict]) -> list[dict]:
    """Undo db_backup's `_serialize`: ISO strings become datetimes/dates again.

    Everything else (JSON columns, ints, bools, None) round-trips as-is — the dump
    stores JSON columns as real nested JSON, so they come back as Python objects.
    """
    temporal = {
        c.name: type(c.type)
        for c in table.columns
        if isinstance(c.type, (DateTime, Date))
    }
    known = {c.name for c in table.columns}
    fixed = []
    for row in rows:
        r = {k: v for k, v in row.items() if k in known}  # tolerate dropped columns
        for col, kind in temporal.items():
            v = r.get(col)
            if isinstance(v, str) and v:
                try:
                    r[col] = (date.fromisoformat(v) if kind is Date
                              else datetime.fromisoformat(v))
                except ValueError:
                    pass  # leave it; the DB will complain loudly and specifically
        fixed.append(r)
    return fixed


async def restore(zip_path: str, target: str, *, wipe: bool, execute: bool,
                  allow_remote: bool) -> int:
    url = _normalise(target)
    host = _guard(url, allow_remote)

    data = load_zip(zip_path)
    tables = list(Base.metadata.sorted_tables)  # FK-safe: parents before children

    print(f"snapshot : {zip_path}")
    print(f"target   : {host} ({'EXECUTE' if execute else 'DRY-RUN — nothing will be written'})")
    print(f"tables   : {len(tables)} in models, {len(data)} in snapshot")

    only_in_zip = sorted(set(data) - {t.name for t in tables})
    only_in_models = sorted({t.name for t in tables} - set(data))
    if only_in_zip:
        print(f"  ! in snapshot but not in models (skipped): {', '.join(only_in_zip)}")
    if only_in_models:
        print(f"  ! in models but not in snapshot (left empty): {', '.join(only_in_models)}")

    planned = {t.name: len(data.get(t.name, [])) for t in tables}
    total = sum(planned.values())
    print(f"rows     : {total} across {sum(1 for v in planned.values() if v)} non-empty tables")

    if not execute:
        for name, n in planned.items():
            if n:
                print(f"    {name:<28} {n}")
        print("\nDRY-RUN ok — snapshot parsed and validated. Re-run with --yes to write.")
        return 0

    engine = create_async_engine(url, echo=False)
    try:
        async with engine.begin() as conn:
            existing = await conn.scalar(text(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"))
            if existing and not wipe:
                raise SystemExit(
                    f"REFUSED: target already has {existing} tables. Pass --wipe to drop and rebuild.")
            if wipe:
                print("dropping existing schema…")
                await conn.run_sync(Base.metadata.drop_all)
            print("creating schema from models…")
            await conn.run_sync(Base.metadata.create_all)

        async with engine.begin() as conn:
            # FK triggers OFF for the bulk load. sorted_tables orders TABLES by
            # dependency but cannot order ROWS WITHIN a table, and users.referred_by
            # is self-referential — a referred user dumped before their referrer
            # fails on insert. (Found the hard way: the first restore test of this
            # snapshot died on users_referred_by_fkey.) The data came out of a
            # database that already enforced these constraints, so it is consistent
            # by construction; only the insertion ORDER is wrong. This is the same
            # thing pg_restore --disable-triggers does, and it's re-validated below.
            relaxed = False
            try:
                await conn.execute(text("SET session_replication_role = replica"))
                relaxed = True
            except Exception:
                print("  ! could not relax FK triggers (needs superuser) — "
                      "self-referential rows may fail")
            for t in tables:
                rows = data.get(t.name) or []
                if not rows:
                    continue
                payload = _coerce(t, rows)
                for i in range(0, len(payload), BATCH):
                    await conn.execute(insert(t), payload[i:i + BATCH])
                print(f"  loaded {t.name:<28} {len(payload)}")
            if relaxed:
                await conn.execute(text("SET session_replication_role = origin"))

        # Sequences: without this the data is right but the DB is a landmine.
        async with engine.begin() as conn:
            bumped = 0
            for t in tables:
                for c in t.columns:
                    if not (c.primary_key and c.autoincrement and str(c.type).upper().startswith(("INTEGER", "BIGINT"))):
                        continue
                    seq = await conn.scalar(text("SELECT pg_get_serial_sequence(:t, :c)"),
                                            {"t": t.name, "c": c.name})
                    if not seq:
                        continue
                    mx = await conn.scalar(text(f'SELECT MAX("{c.name}") FROM "{t.name}"'))
                    if mx is not None:
                        await conn.execute(text("SELECT setval(:s, :v, true)"),
                                           {"s": seq, "v": int(mx)})
                        bumped += 1
            print(f"resynced {bumped} sequences")

        # Because the load ran with FK triggers relaxed, prove after the fact that
        # every foreign key actually resolves. Without this a corrupt snapshot would
        # restore "successfully" and only reveal itself in production.
        async with engine.begin() as conn:
            orphans = 0
            for t in tables:
                for fk in t.foreign_key_constraints:
                    child = list(fk.columns)[0]
                    parent_col = list(fk.elements)[0].column
                    n = await conn.scalar(text(
                        f'SELECT count(*) FROM "{t.name}" c '
                        f'LEFT JOIN "{parent_col.table.name}" p '
                        f'  ON p."{parent_col.name}" = c."{child.name}" '
                        f'WHERE c."{child.name}" IS NOT NULL AND p."{parent_col.name}" IS NULL'))
                    if n:
                        print(f"  !! ORPHANS {t.name}.{child.name} -> "
                              f"{parent_col.table.name}.{parent_col.name}: {n}")
                        orphans += n
            print("integrity: every foreign key resolves ✓" if not orphans
                  else f"integrity: {orphans} ORPHANED ROWS — snapshot is NOT sound")

        print("\nRESTORE COMPLETE")
        return 0 if not orphans else 2
    finally:
        await engine.dispose()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--zip", required=True, help="snapshot produced by db_backup.py")
    p.add_argument("--target", required=True, help="destination Postgres URL (never production)")
    p.add_argument("--wipe", action="store_true", help="drop existing tables first")
    p.add_argument("--yes", action="store_true", help="actually write (default is dry-run)")
    p.add_argument("--allow-remote", action="store_true", help="permit a non-local target")
    a = p.parse_args()
    return asyncio.run(restore(a.zip, a.target, wipe=a.wipe, execute=a.yes,
                               allow_remote=a.allow_remote))


if __name__ == "__main__":
    raise SystemExit(main())
