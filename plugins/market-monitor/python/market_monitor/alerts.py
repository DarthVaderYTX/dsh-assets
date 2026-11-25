"""Alert rule validation and evaluation.

The module is store-agnostic: :func:`prepare_rule` validates and normalises a
rule definition, :func:`rule_payload` renders the API shape (including the
``armed`` flag) and :func:`evaluate_rules` turns rules plus market data into
event dictionaries.  Persisting events and enforcing cooldowns on write is the
service's job; evaluation skips rules whose cooldown has not elapsed.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from . import indicators
from .catalog import normalize_symbol
from .errors import InvalidArgumentError
from .store import iso_to_epoch, new_id

#: Supported alert kinds and their threshold meaning.
ALERT_KINDS: tuple[str, ...] = (
    "price_above",
    "price_below",
    "change_pct_above",
    "change_pct_below",
    "rsi_above",
    "rsi_below",
    "ma_cross",
    "volume_spike",
)

#: Kinds that need daily bars (not just a quote) to evaluate.
BAR_KINDS: frozenset[str] = frozenset(
    {"rsi_above", "rsi_below", "ma_cross", "volume_spike"}
)

#: Default cooldown between two events of the same rule (seconds).
DEFAULT_COOLDOWN_S = 3600

#: Event severity per kind.
SEVERITIES: dict[str, str] = {
    "price_above": "warning",
    "price_below": "warning",
    "change_pct_above": "info",
    "change_pct_below": "info",
    "rsi_above": "info",
    "rsi_below": "info",
    "ma_cross": "warning",
    "volume_spike": "info",
}


def _finite_number(value: Any, field: str) -> float:
    """Validate a finite number, raising ``InvalidArgumentError`` otherwise."""
    if value is None or isinstance(value, bool):
        raise InvalidArgumentError(f"{field} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise InvalidArgumentError(f"{field} must be a finite number") from None
    if not math.isfinite(number):
        raise InvalidArgumentError(f"{field} must be a finite number")
    return number


def validate_symbol(value: Any) -> str:
    """Validate an alert symbol."""
    return normalize_symbol(value)


def validate_kind(value: Any) -> str:
    """Validate an alert kind string."""
    if not isinstance(value, str) or not value.strip():
        raise InvalidArgumentError(
            f"alert kind must be one of {', '.join(ALERT_KINDS)}"
        )
    kind = value.strip().lower()
    if kind not in ALERT_KINDS:
        raise InvalidArgumentError(
            f"invalid alert kind: {value!r} (expected one of {', '.join(ALERT_KINDS)})"
        )
    return kind


def validate_cooldown(value: Any) -> int:
    """Validate a cooldown in seconds (0..30 days, integer)."""
    if value is None:
        return DEFAULT_COOLDOWN_S
    if isinstance(value, bool):
        raise InvalidArgumentError("cooldown_s must be a non-negative integer")
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise InvalidArgumentError("cooldown_s must be a non-negative integer") from None
    if number < 0 or number > 30 * 24 * 3600:
        raise InvalidArgumentError("cooldown_s must be between 0 and 2592000 seconds")
    return number


def validate_note(value: Any) -> str:
    """Validate a free-text note (at most 500 characters)."""
    if value is None:
        return ""
    if not isinstance(value, str):
        raise InvalidArgumentError("note must be a string")
    if len(value) > 500:
        raise InvalidArgumentError("note must be at most 500 characters")
    return value


def validate_params(kind: str, params: Any) -> dict[str, Any]:
    """Validate and normalise the per-kind ``params`` object."""
    if params is None:
        params = {}
    if not isinstance(params, Mapping):
        raise InvalidArgumentError("params must be an object")
    result = dict(params)
    if kind == "ma_cross":
        fast = result.get("fast", 20)
        slow = result.get("slow", 50)
        if isinstance(fast, bool) or not isinstance(fast, int) or fast < 2:
            raise InvalidArgumentError("params.fast must be an integer >= 2")
        if isinstance(slow, bool) or not isinstance(slow, int) or slow < 3:
            raise InvalidArgumentError("params.slow must be an integer >= 3")
        if fast >= slow:
            raise InvalidArgumentError("params.fast must be smaller than params.slow")
        direction = result.get("direction", "golden")
        if direction not in ("golden", "death"):
            raise InvalidArgumentError(
                "params.direction must be either 'golden' or 'death'"
            )
        return {"fast": fast, "slow": slow, "direction": direction}
    return result


def prepare_rule(
    symbol: Any,
    kind: Any,
    threshold: Any = None,
    params: Any = None,
    note: Any = "",
    cooldown_s: Any = None,
) -> dict[str, Any]:
    """Validate and normalise a new alert rule definition."""
    validated_kind = validate_kind(kind)
    if validated_kind == "ma_cross":
        validated_threshold = 0.0
    else:
        if threshold is None:
            raise InvalidArgumentError(f"threshold is required for {validated_kind}")
        validated_threshold = _finite_number(threshold, "threshold")
    return {
        "symbol": validate_symbol(symbol),
        "kind": validated_kind,
        "threshold": validated_threshold,
        "params": validate_params(validated_kind, params),
        "note": validate_note(note),
        "enabled": True,
        "cooldown_s": validate_cooldown(cooldown_s),
    }


def prepare_rule_update(rule: Mapping[str, Any], fields: Mapping[str, Any]) -> dict[str, Any]:
    """Validate a partial alert-rule update against the existing rule."""
    kind = str(rule["kind"])
    changes: dict[str, Any] = {}
    if "enabled" in fields and fields["enabled"] is not None:
        enabled = fields["enabled"]
        if not isinstance(enabled, bool):
            raise InvalidArgumentError("enabled must be a boolean")
        changes["enabled"] = enabled
    if "threshold" in fields and fields["threshold"] is not None:
        changes["threshold"] = _finite_number(fields["threshold"], "threshold")
    if "params" in fields and fields["params"] is not None:
        changes["params"] = validate_params(kind, fields["params"])
    if "note" in fields and fields["note"] is not None:
        changes["note"] = validate_note(fields["note"])
    if "cooldown_s" in fields and fields["cooldown_s"] is not None:
        changes["cooldown_s"] = validate_cooldown(fields["cooldown_s"])
    return changes


def is_armed(rule: Mapping[str, Any], now_ts: float | None = None) -> bool:
    """Return ``True`` when the rule is enabled and its cooldown has elapsed."""
    if not rule.get("enabled", True):
        return False
    last = iso_to_epoch(rule.get("last_triggered_at"))
    if last is None:
        return True
    now = now_ts if now_ts is not None else datetime.now(tz=timezone.utc).timestamp()
    cooldown = int(rule.get("cooldown_s") or 0)
    return (now - last) >= cooldown


def rule_payload(rule: Mapping[str, Any], now_ts: float | None = None) -> dict[str, Any]:
    """Render the public ``alert rule`` payload from a stored rule."""
    return {
        "id": rule["id"],
        "symbol": rule["symbol"],
        "kind": rule["kind"],
        "threshold": rule.get("threshold"),
        "params": dict(rule.get("params") or {}),
        "note": rule.get("note") or "",
        "enabled": bool(rule.get("enabled", True)),
        "cooldown_s": int(rule.get("cooldown_s") or 0),
        "created_at": rule.get("created_at"),
        "last_triggered_at": rule.get("last_triggered_at"),
        "armed": is_armed(rule, now_ts),
    }


def _timestamp(now_ts: float | None) -> str:
    """Format an epoch timestamp as the API's ISO UTC form."""
    moment = (
        datetime.now(tz=timezone.utc)
        if now_ts is None
        else datetime.fromtimestamp(now_ts, tz=timezone.utc)
    )
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def _rsi_for_bars(bars: Sequence[Mapping[str, Any]]) -> float | None:
    """Compute RSI(14) from daily bars."""
    closes = [bar.get("c") for bar in bars]
    return indicators.rsi(closes, 14)


def _average_volume(bars: Sequence[Mapping[str, Any]]) -> float | None:
    """Average volume of the 20 completed daily bars before the latest one."""
    volumes = [
        float(bar["v"])
        for bar in bars
        if isinstance(bar.get("v"), (int, float)) and not isinstance(bar.get("v"), bool)
    ]
    if len(volumes) < 2:
        return None
    window = volumes[-21:-1]
    if not window:
        return None
    return sum(window) / len(window)


def _ma_values(
    bars: Sequence[Mapping[str, Any]], fast: int, slow: int
) -> tuple[float, float, float, float] | None:
    """Return (previous fast, previous slow, current fast, current slow) SMAs."""
    closes = [bar.get("c") for bar in bars]
    current_fast = indicators.sma(closes, fast)
    current_slow = indicators.sma(closes, slow)
    previous_fast = indicators.sma(closes[:-1], fast)
    previous_slow = indicators.sma(closes[:-1], slow)
    if None in (current_fast, current_slow, previous_fast, previous_slow):
        return None
    return previous_fast, previous_slow, current_fast, current_slow


def _evaluate_rule(
    rule: Mapping[str, Any],
    quote: Mapping[str, Any],
    bars: Sequence[Mapping[str, Any]],
    now_ts: float,
) -> dict[str, Any] | None:
    """Evaluate one rule; return an event dictionary when it triggers."""
    kind = rule["kind"]
    symbol = rule["symbol"]
    threshold = rule.get("threshold")
    threshold_value = float(threshold) if threshold is not None else 0.0
    price = quote.get("price")
    value: float | None = None
    event_threshold: float | None = threshold_value
    message = ""
    if kind in ("price_above", "price_below"):
        if not isinstance(price, (int, float)) or isinstance(price, bool):
            return None
        value = float(price)
        if kind == "price_above" and value >= threshold_value:
            message = f"{symbol} crossed above {threshold_value:,.2f} ({value:,.2f})"
        elif kind == "price_below" and value <= threshold_value:
            message = f"{symbol} crossed below {threshold_value:,.2f} ({value:,.2f})"
        else:
            return None
    elif kind in ("change_pct_above", "change_pct_below"):
        change_pct = quote.get("change_pct")
        if not isinstance(change_pct, (int, float)) or isinstance(change_pct, bool):
            return None
        value = float(change_pct)
        if kind == "change_pct_above" and value >= threshold_value:
            message = (
                f"{symbol} day change {value:+.2f}% reached {threshold_value:+.2f}%"
            )
        elif kind == "change_pct_below" and value <= threshold_value:
            message = (
                f"{symbol} day change {value:+.2f}% fell to {threshold_value:+.2f}%"
            )
        else:
            return None
    elif kind in ("rsi_above", "rsi_below"):
        value = _rsi_for_bars(bars)
        if value is None:
            return None
        if kind == "rsi_above" and value >= threshold_value:
            message = f"{symbol} RSI(14) {value:.1f} is at or above {threshold_value:.1f}"
        elif kind == "rsi_below" and value <= threshold_value:
            message = f"{symbol} RSI(14) {value:.1f} is at or below {threshold_value:.1f}"
        else:
            return None
    elif kind == "ma_cross":
        params = rule.get("params") or {}
        fast = int(params.get("fast", 20))
        slow = int(params.get("slow", 50))
        direction = str(params.get("direction", "golden"))
        values = _ma_values(bars, fast, slow)
        if values is None:
            return None
        previous_fast, previous_slow, current_fast, current_slow = values
        golden = previous_fast <= previous_slow and current_fast > current_slow
        death = previous_fast >= previous_slow and current_fast < current_slow
        if direction == "golden" and not golden:
            return None
        if direction == "death" and not death:
            return None
        value = current_fast
        event_threshold = current_slow
        suffix = "above" if direction == "golden" else "below"
        message = (
            f"{symbol} {fast}-day average crossed {suffix} the {slow}-day average "
            f"({current_fast:.2f} vs {current_slow:.2f})"
        )
    elif kind == "volume_spike":
        volume = quote.get("volume")
        if not isinstance(volume, (int, float)) or isinstance(volume, bool):
            return None
        average = _average_volume(bars)
        if average is None or average <= 0:
            return None
        ratio = float(volume) / average
        if ratio < threshold_value:
            return None
        value = float(volume)
        event_threshold = round(threshold_value * average, 4)
        message = (
            f"{symbol} volume {value:,.0f} is {ratio:.1f}x the 20-day average"
        )
    else:  # pragma: no cover - kind is validated on write
        return None
    return {
        "id": new_id(),
        "rule_id": rule["id"],
        "symbol": symbol,
        "kind": kind,
        "severity": SEVERITIES.get(kind, "info"),
        "message": message,
        "value": value,
        "threshold": event_threshold,
        "ts": _timestamp(now_ts),
        "acknowledged": False,
    }


def evaluate_rules(
    rules: Sequence[Mapping[str, Any]],
    quotes: Mapping[str, Mapping[str, Any]],
    daily_bars: Mapping[str, Sequence[Mapping[str, Any]]],
    now_ts: float | None = None,
) -> list[dict[str, Any]]:
    """Evaluate armed rules against quotes/bars and return triggered events.

    Rules whose cooldown has not elapsed, whose quote is missing, or whose
    required data is unavailable are skipped without raising.
    """
    if now_ts is None:
        now_ts = datetime.now(tz=timezone.utc).timestamp()
    events: list[dict[str, Any]] = []
    for rule in rules:
        if not is_armed(rule, now_ts):
            continue
        symbol = rule.get("symbol")
        quote = quotes.get(symbol) if symbol is not None else None
        if not isinstance(quote, Mapping):
            continue
        bars = daily_bars.get(symbol, ()) if symbol is not None else ()
        event = _evaluate_rule(rule, quote, bars, now_ts)
        if event is not None:
            events.append(event)
    return events


__all__ = [
    "ALERT_KINDS",
    "BAR_KINDS",
    "DEFAULT_COOLDOWN_S",
    "SEVERITIES",
    "validate_symbol",
    "validate_kind",
    "validate_cooldown",
    "validate_note",
    "validate_params",
    "prepare_rule",
    "prepare_rule_update",
    "is_armed",
    "rule_payload",
    "evaluate_rules",
]
