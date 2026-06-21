from __future__ import annotations

import argparse
import asyncio

from ingestion import SOURCES, run_delta


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, choices=sorted(SOURCES))
    args = parser.parse_args()

    saved = asyncio.run(run_delta(args.source))
    print(f"delta sync complete source={args.source} saved={saved}")


if __name__ == "__main__":
    main()
