"""Market Monitor: financial data engine for the ``market-monitor`` DSH plugin.

The package separates collection, storage, monitoring and analysis from the DSH
plugin transport layer.  Two faces share :class:`MarketMonitorService`:

* the in-process SDK (:class:`MarketMonitor`) for scripts and notebooks;
* the localhost JSON API served by ``python -m market_monitor serve``.

Typical SDK use::

    from market_monitor import MarketMonitor

    mm = MarketMonitor(provider="synthetic", data_dir=None)
    mm.add_watch("NVDA")
    print(mm.snapshot()["quotes"][0]["price"])
    print(mm.analysis("NVDA")["summary"]["headline"])
"""

from __future__ import annotations

#: Package version reported by health/meta/analysis payloads and the sidecar.
__version__ = "1.0.0"

from .errors import MarketMonitorError
from .service import MarketMonitorService
from .sdk import MarketMonitor

__all__ = [
    "MarketMonitor",
    "MarketMonitorService",
    "__version__",
    "MarketMonitorError",
]
