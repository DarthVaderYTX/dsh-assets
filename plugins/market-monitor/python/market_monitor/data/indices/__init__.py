"""Generic index providers.

Each module in this package owns one index kind: its declarative definition, a
``build_snapshot`` function that turns provider payloads into diffable entries,
an ``ensure_registered`` bootstrap and a ``collect`` ingestion job handler that
projects changes into the canonical ``ref_*`` tables.

The framework itself (``index_def``, ``index_entry``, ``index_change``,
``index_refresh``) lives in :mod:`market_monitor.data.warehouse`; providers only
describe the universe and the projection rules.

Currently implemented kinds:

* :mod:`company_master` -- ``company:master``, listed operating companies
  (stocks and ADRs) from the official US listing files plus the curated seed.
* :mod:`china_securities` -- ``china:securities``, mainland A-shares and ETFs
  from the public Eastmoney lists.
* :mod:`china_commodities` -- ``china:commodities``, mainland commodity front
  contracts from the curated seed.
"""

from __future__ import annotations

from . import china_commodities, china_securities
from .china_commodities import (
    INDEX_ID as CHINA_COMMODITIES_INDEX_ID,
)
from .china_securities import (
    INDEX_ID as CHINA_SECURITIES_INDEX_ID,
)
from .company_master import (
    COMPANY_TYPES,
    INDEX_DEFINITION,
    INDEX_ID,
    build_snapshot,
    collect,
    ensure_registered,
    project_entries,
)

__all__ = [
    "CHINA_COMMODITIES_INDEX_ID",
    "CHINA_SECURITIES_INDEX_ID",
    "COMPANY_TYPES",
    "INDEX_DEFINITION",
    "INDEX_ID",
    "build_snapshot",
    "china_commodities",
    "china_securities",
    "collect",
    "ensure_registered",
    "project_entries",
]
