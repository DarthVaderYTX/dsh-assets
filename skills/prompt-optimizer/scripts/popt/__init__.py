"""Rubric-driven prompt optimizer.

A small, dependency-free harness that evaluates a prompt against a JSONL
dataset whose rows carry rubrics, then iteratively proposes and selects
better prompts by measured score.
"""

__version__ = "1.1.0"
