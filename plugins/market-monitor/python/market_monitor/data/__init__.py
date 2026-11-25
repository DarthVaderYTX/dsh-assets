"""Data collection layer: warehouse, polite HTTP, governor, runner and sources.

The exported names are stable integration points for the service layer::

    warehouse = DataWarehouse(path)
    governor = RateGovernor(warehouse)
    governor.register(SOURCE_SPECS)
    client = PoliteHttpClient(warehouse, governor)
    runner = IngestionRunner(warehouse, client, governor, settings=...)
    runner.register_all(JOB_SPECS)
"""

from __future__ import annotations

from .errors import (
    DataNotFoundError,
    DataSourceError,
    JobRunningError,
    SourceBlockedError,
    SourceRateLimitedError,
)
from .governor import RateGovernor
from .http import PoliteHttpClient
from .models import (
    CollectContext,
    DOMAIN_MARKET,
    DOMAIN_NEWS,
    DOMAIN_REFERENCE,
    DOMAINS,
    FetchResult,
    IngestResult,
    SourceSpec,
    canonical_url,
    commodity_contract_id,
    commodity_root_id,
    content_hash,
    index_id,
    instrument_id,
    news_article_id,
)
from .manager import MarketDataManager, create_data_manager
from .runner import IngestionRunner, JobSpec
from .specs import (
    JOB_DEFINITIONS,
    NEWS_SOURCES,
    NEWS_SOURCE_IDS,
    SOURCE_SPECS,
    JobDefinition,
)
from .warehouse import DataWarehouse

__all__ = [
    "CollectContext",
    "DOMAINS",
    "DOMAIN_MARKET",
    "DOMAIN_NEWS",
    "DOMAIN_REFERENCE",
    "DataNotFoundError",
    "DataSourceError",
    "DataWarehouse",
    "FetchResult",
    "IngestResult",
    "IngestionRunner",
    "JobDefinition",
    "JobRunningError",
    "JobSpec",
    "JOB_DEFINITIONS",
    "MarketDataManager",
    "NEWS_SOURCES",
    "NEWS_SOURCE_IDS",
    "PoliteHttpClient",
    "RateGovernor",
    "SOURCE_SPECS",
    "SourceBlockedError",
    "SourceRateLimitedError",
    "SourceSpec",
    "canonical_url",
    "commodity_contract_id",
    "commodity_root_id",
    "content_hash",
    "create_data_manager",
    "index_id",
    "instrument_id",
    "news_article_id",
]

