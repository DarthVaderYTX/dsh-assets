"""Typed errors with stable exit codes for the CLI."""

from __future__ import annotations


class PromptOptError(Exception):
    """Base class for expected failures (no traceback needed)."""

    exit_code = 1


class ConfigError(PromptOptError):
    """Bad flags, missing prompt file, unusable model configuration."""

    exit_code = 2


class DatasetError(PromptOptError):
    """Dataset cannot be read or does not satisfy the contract."""

    exit_code = 2


class JudgeError(PromptOptError):
    """The grading model returned something that cannot be scored."""

    exit_code = 4


class LLMError(PromptOptError):
    """Transport or provider failure after retries."""

    exit_code = 4


class BudgetExceeded(PromptOptError):
    """The configured call budget would be exceeded."""

    exit_code = 3
