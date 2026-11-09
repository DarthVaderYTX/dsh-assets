#!/usr/bin/env python3
"""Entry point for the prompt-optimizer skill."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from popt.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
