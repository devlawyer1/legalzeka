from __future__ import annotations

import argparse
import asyncio
import time

from ingestion import SOURCES, run_backfill


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, choices=sorted(SOURCES))
    parser.add_argument("--years", type=int, default=5)
    args = parser.parse_args()

    started = time.perf_counter()
    saved = asyncio.run(run_backfill(args.source, args.years))
    elapsed_s = time.perf_counter() - started
    print(f"backfill complete source={args.source} saved={saved} elapsed_s={elapsed_s:.2f}")


if __name__ == "__main__":
    main()
