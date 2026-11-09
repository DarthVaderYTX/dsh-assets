"""Unit tests for rubric parsing, dataset loading, judge parsing and splitting."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from popt import miniyaml
from popt.dataset import LoadOptions, load_dataset
from popt.errors import ConfigError, DatasetError, JudgeError
from popt.evaluate import build_judge_messages, parse_judge_response
from popt.models import load_models_config, resolve_api_key
from popt.optimize import parse_candidates, split_items
from popt.promptspec import PromptSpec, load_prompt
from popt.rubric import evaluate_check, normalize_rubric
from popt.util import extract_json


def _write_jsonl(rows: list[dict]) -> Path:
    handle = tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8")
    with handle as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
    return Path(handle.name)


class RubricTests(unittest.TestCase):
    def test_string_rubric(self):
        rubric = normalize_rubric("Answer cites a source.")
        self.assertEqual(len(rubric.criteria), 1)
        self.assertEqual(rubric.criteria[0].id, "c1")
        self.assertEqual(rubric.criteria[0].weight, 1.0)

    def test_list_of_strings(self):
        rubric = normalize_rubric(["one", "two"])
        self.assertEqual([criterion.id for criterion in rubric.criteria], ["c1", "c2"])

    def test_json_string_rubric(self):
        rubric = normalize_rubric(json.dumps([{"id": "x", "text": "has x"}]))
        self.assertEqual(rubric.criteria[0].id, "x")

    def test_dict_with_criteria(self):
        rubric = normalize_rubric({"criteria": [{"text": "a", "weight": 2}, {"text": "b"}]})
        self.assertEqual(rubric.criteria[0].weight, 2.0)
        self.assertEqual(len(rubric.criteria), 2)

    def test_single_object_rubric(self):
        rubric = normalize_rubric({"id": "only", "description": "do it"})
        self.assertEqual(rubric.criteria[0].text, "do it")

    def test_map_form_rubric(self):
        rubric = normalize_rubric({"Accuracy": "Factually correct", "Tone": "Polite"})
        self.assertEqual([criterion.id for criterion in rubric.criteria], ["Accuracy", "Tone"])
        self.assertEqual(rubric.criteria[0].text, "Factually correct")

    def test_check_string_shorthand(self):
        rubric = normalize_rubric(["ok"], )
        self.assertIsNone(rubric.criteria[0].check)
        rubric = normalize_rubric([{"text": "no urls", "check": "not_contains: http"}])
        self.assertEqual(rubric.criteria[0].check.type, "not_contains")

    def test_duplicate_ids_are_renamed(self):
        rubric = normalize_rubric([{"id": "a", "text": "one"}, {"id": "a", "text": "two"}])
        self.assertEqual([criterion.id for criterion in rubric.criteria], ["a", "a_2"])

    def test_invalid_rubrics(self):
        for raw in ([], "", {"criteria": []}, [{"weight": 2}], [{"text": "x", "weight": -1}]):
            with self.assertRaises(DatasetError):
                normalize_rubric(raw)

    def test_judged_and_deterministic_split(self):
        rubric = normalize_rubric(
            [
                {"text": "has GOOD", "check": {"type": "contains", "value": "GOOD"}},
                {"text": "is relevant"},
            ]
        )
        self.assertEqual(len(rubric.deterministic_criteria), 1)
        self.assertEqual(len(rubric.judged_criteria), 1)


class CheckTests(unittest.TestCase):
    def test_contains_ignore_case(self):
        rubric = normalize_rubric(
            [{"text": "refund", "check": {"type": "contains", "value": "Refund", "ignore_case": True}}]
        )
        score, _ = evaluate_check(rubric.criteria[0].check, "we issued a refund")
        self.assertEqual(score, 1.0)

    def test_not_contains(self):
        rubric = normalize_rubric([{"text": "no link", "check": "not_contains: http"}])
        self.assertEqual(evaluate_check(rubric.criteria[0].check, "see http://x")[0], 0.0)
        self.assertEqual(evaluate_check(rubric.criteria[0].check, "see docs")[0], 1.0)

    def test_regex_and_numeric(self):
        regex = normalize_rubric([{"text": "order id", "check": {"type": "regex", "value": r"ORD-\d{4}"}}])
        self.assertEqual(evaluate_check(regex.criteria[0].check, "order ORD-1234")[0], 1.0)
        numeric = normalize_rubric(
            [{"text": "42", "check": {"type": "numeric", "value": 42, "tolerance": 0.5}}]
        )
        self.assertEqual(evaluate_check(numeric.criteria[0].check, "answer is 42.3")[0], 1.0)
        self.assertEqual(evaluate_check(numeric.criteria[0].check, "no number")[0], 0.0)

    def test_json_and_length(self):
        json_rule = normalize_rubric([{"text": "json", "check": "json"}])
        self.assertEqual(evaluate_check(json_rule.criteria[0].check, '{"a": 1}')[0], 1.0)
        self.assertEqual(evaluate_check(json_rule.criteria[0].check, "not json")[0], 0.0)
        words = normalize_rubric([{"text": "short", "check": {"type": "max_words", "value": 3}}])
        self.assertEqual(evaluate_check(words.criteria[0].check, "one two three four")[0], 0.0)

    def test_bad_check_type(self):
        with self.assertRaises(DatasetError):
            normalize_rubric([{"text": "x", "check": {"type": "telepathy"}}])


class DatasetTests(unittest.TestCase):
    def test_detection_and_normalization(self):
        path = _write_jsonl(
            [
                {"id": "a", "question": "Q1", "rubrics": ["one"], "expected": "A1"},
                {"id": "b", "question": "Q2", "rubrics": [{"text": "two", "weight": 2}]},
            ]
        )
        dataset = load_dataset(path)
        try:
            self.assertEqual(dataset.size, 2)
            self.assertEqual(dataset.field_map["input"], "question")
            self.assertEqual(dataset.field_map["rubric"], "rubrics")
            self.assertEqual(dataset.field_map["reference"], "expected")
            self.assertEqual(dataset.items[1].rubric.criteria[0].weight, 2.0)
            self.assertEqual(dataset.items[0].reference, "A1")
        finally:
            path.unlink()

    def test_messages_input(self):
        path = _write_jsonl(
            [
                {
                    "id": "m",
                    "messages": [
                        {"role": "system", "content": "sys"},
                        {"role": "user", "content": "hello"},
                    ],
                    "rubric": ["greets"],
                }
            ]
        )
        dataset = load_dataset(path)
        try:
            self.assertEqual(dataset.items[0].input, "hello")
        finally:
            path.unlink()

    def test_missing_rubric_fails(self):
        path = _write_jsonl([{"input": "q", "rubric": ["ok"]}, {"input": "q2"}])
        with self.assertRaises(DatasetError):
            load_dataset(path)
        path.unlink()

    def test_skip_invalid(self):
        path = _write_jsonl([{"input": "q", "rubric": ["ok"]}, {"input": "q2"}])
        dataset = load_dataset(path, LoadOptions(skip_invalid=True))
        try:
            self.assertEqual(dataset.size, 1)
            self.assertEqual(len(dataset.skipped), 1)
        finally:
            path.unlink()

    def test_invalid_weight_fails(self):
        path = _write_jsonl([{"input": "q", "rubric": ["ok"], "weight": 0}])
        with self.assertRaises(DatasetError):
            load_dataset(path)
        path.unlink()


class PromptSpecTests(unittest.TestCase):
    def test_plain_prompt_becomes_system_message(self):
        spec = load_prompt(inline="Be nice.")
        self.assertEqual(spec.messages, [{"role": "system", "content": "Be nice."}])
        self.assertEqual(
            spec.rendered_messages("hi"),
            [
                {"role": "system", "content": "Be nice."},
                {"role": "user", "content": "hi"},
            ],
        )

    def test_plain_text_with_colon_is_not_yaml(self):
        spec = load_prompt(inline="Answer: be concise.")
        self.assertEqual(spec.messages[0]["content"], "Answer: be concise.")

    def test_yaml_messages_template(self):
        spec = load_prompt(
            inline="""
name: demo
messages:
  - role: system
    content: |
      System line one.
      System line two.
  - role: assistant
    content: "ok"
  - role: user
    content: "Question: {{input}}"
"""
        )
        self.assertEqual(spec.name, "demo")
        self.assertEqual([message["role"] for message in spec.messages], ["system", "assistant", "user"])
        self.assertEqual(spec.rendered_messages("why")[-1]["content"], "Question: why")
        self.assertIn("System line two.", spec.system_text)

    def test_no_placeholder_appends_user_message(self):
        spec = PromptSpec(messages=[{"role": "system", "content": "s"}])
        rendered = spec.rendered_messages("row")
        self.assertEqual(rendered[-1], {"role": "user", "content": "row"})

    def test_with_system_preserves_other_messages(self):
        spec = PromptSpec(
            messages=[
                {"role": "system", "content": "old"},
                {"role": "user", "content": "{{input}}"},
                {"role": "system", "content": "second"},
            ]
        )
        candidate = spec.with_system("new")
        self.assertEqual(
            candidate.messages,
            [{"role": "system", "content": "new"}, {"role": "user", "content": "{{input}}"}],
        )

    def test_legacy_json_prompt(self):
        spec = load_prompt(
            inline=json.dumps(
                {
                    "system": "System",
                    "user_template": "Question: {input}",
                    "temperature": 0.2,
                    "few_shot": [{"role": "assistant", "content": "ok"}],
                }
            )
        )
        self.assertEqual(spec.temperature, 0.2)
        self.assertEqual([message["role"] for message in spec.messages], ["system", "assistant", "user"])
        self.assertEqual(spec.rendered_messages("why")[-1]["content"], "Question: why")

    def test_display_text_roundtrip(self):
        spec = PromptSpec(
            name="demo",
            messages=[
                {"role": "system", "content": "Line one\nLine two"},
                {"role": "user", "content": "{{input}}"},
            ],
        )
        parsed = load_prompt(inline=spec.display_text())
        self.assertEqual([message["role"] for message in parsed.messages], ["system", "user"])
        self.assertEqual(parsed.messages[0]["content"], "Line one\nLine two")

    def test_invalid_message_roles(self):
        with self.assertRaises(ConfigError):
            load_prompt(inline='messages:\n  - role: robot\n    content: "x"\n')

    def test_empty_prompt_rejected(self):
        with self.assertRaises(ConfigError):
            load_prompt(inline="   ")


class MiniYamlTests(unittest.TestCase):
    def test_nested_mapping_sequence_and_flow(self):
        document = miniyaml.loads(
            """
name: demo
messages:
  - role: system
    content: |
      line one
      line two
  - role: user
    content: "{{input}}"
headers:
  X-Tenant: acme
  X-Trace: "a: b"
flow: {a: 1, b: [x, y]}
"""
        )
        self.assertEqual(document["messages"][0]["content"], "line one\nline two\n")
        self.assertEqual(document["headers"], {"X-Tenant": "acme", "X-Trace": "a: b"})
        self.assertEqual(document["flow"], {"a": 1, "b": ["x", "y"]})

    def test_folded_and_comments(self):
        document = miniyaml.loads(
            """
a: >-
  one
  two
# a comment
b: 1  # trailing comment
"""
        )
        self.assertEqual(document["a"], "one two")
        self.assertEqual(document["b"], 1)

    def test_sequence_of_scalars_and_mappings(self):
        document = miniyaml.loads(
            """
- name: a
  tags:
    - x
    - y
- plain
"""
        )
        self.assertEqual(document, [{"name": "a", "tags": ["x", "y"]}, "plain"])

    def test_errors(self):
        for text in (
            "a: 1\na: 2\n",
            "a:\n\tb: 1\n",
            "a: &anchor 1\n",
            "---\na: 1\n---\nb: 2\n",
            "a: {b: 1\n",
        ):
            with self.assertRaises(miniyaml.MiniYamlError):
                miniyaml.loads(text)

    def test_json_style_flow(self):
        self.assertEqual(miniyaml.loads('{"a": 1, "b": true}'), {"a": 1, "b": True})


class ModelConfigTests(unittest.TestCase):
    def _write(self, text: str) -> Path:
        handle = tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False, encoding="utf-8")
        with handle as stream:
            stream.write(text)
        return Path(handle.name)

    def test_targets_and_role_sections(self):
        path = self._write(
            """
models:
  - name: a
    model: m-a
    base_url: https://a.example/v1
    api_key_env: KEY_A
    weight: 2
    headers:
      X-Tenant: acme
  - name: disabled
    enabled: false
    model: m-b
    base_url: https://b.example/v1
judge:
  model: j
  base_url: https://j.example/v1
optimizer:
  model: o
  base_url: https://o.example/v1
"""
        )
        try:
            config = load_models_config(path)
            self.assertEqual([target.name for target in config.targets], ["a"])
            self.assertEqual(config.targets[0].weight, 2.0)
            self.assertEqual(config.targets[0].headers["X-Tenant"], "acme")
            self.assertEqual(config.judge.model, "j")
            self.assertEqual(config.optimizer.model, "o")
            with patch.dict(os.environ, {"KEY_A": "secret"}, clear=False):
                self.assertEqual(resolve_api_key(config.targets[0]), "secret")
        finally:
            path.unlink()

    def test_mapping_form(self):
        path = self._write(
            """
models:
  first:
    model: m1
    base_url: https://one.example/v1
  second:
    model: m2
    base_url: https://two.example/v1
"""
        )
        try:
            config = load_models_config(path)
            self.assertEqual([target.name for target in config.targets], ["first", "second"])
        finally:
            path.unlink()

    def test_global_key_not_sent_to_local_endpoint(self):
        path = self._write(
            """
models:
  - name: local
    model: m
    base_url: http://127.0.0.1:11434/v1
"""
        )
        try:
            config = load_models_config(path)
            with patch.dict(os.environ, {"PROMPT_OPT_API_KEY": "global-secret"}, clear=False):
                self.assertIsNone(resolve_api_key(config.targets[0]))
        finally:
            path.unlink()

    def test_invalid_configs(self):
        cases = [
            "models:\n  - name: a\n    base_url: https://a/v1\n",
            "models:\n  - name: a\n    model: m\n",
            "models:\n  - name: a\n    model: m\n    base_url: https://a/v1\n    weight: 0\n",
            "models:\n  - name: a\n    model: m\n    base_url: https://a/v1\n    unknown: 1\n",
            "models:\n  - name: a\n    model: m\n    base_url: https://a/v1\n"
            "  - name: a\n    model: n\n    base_url: https://b/v1\n",
        ]
        for text in cases:
            path = self._write(text)
            try:
                with self.assertRaises(ConfigError):
                    load_models_config(path)
            finally:
                path.unlink()


class JudgeParsingTests(unittest.TestCase):
    def _criteria(self):
        rubric = normalize_rubric([{"id": "a", "text": "A"}, {"id": "b", "text": "B"}])
        return rubric.criteria

    def test_parse_list(self):
        result = parse_judge_response(
            '{"criteria": [{"id": "a", "score": 1}, {"id": "b", "score": 0.5}]}',
            self._criteria(),
        )
        self.assertEqual(result["a"][0], 1.0)
        self.assertEqual(result["b"][0], 0.5)

    def test_parse_mapping_and_fence(self):
        text = '```json\n{"criteria": {"a": {"score": "pass"}, "b": {"score": "fail"}}}\n```'
        result = parse_judge_response(text, self._criteria())
        self.assertEqual(result["a"][0], 1.0)

    def test_missing_and_out_of_range(self):
        with self.assertRaises(JudgeError):
            parse_judge_response('{"criteria": [{"id": "a", "score": 1}]}', self._criteria())
        with self.assertRaises(JudgeError):
            parse_judge_response(
                '{"criteria": [{"id": "a", "score": 4}, {"id": "b", "score": 1}]}',
                self._criteria(),
            )

    def test_judge_messages_include_rubric(self):
        from popt.dataset import Item

        rubric = normalize_rubric([{"id": "cite", "text": "Cites a source"}])
        item = Item(
            index=0,
            line=1,
            id="x",
            input="hello",
            rubric=rubric,
            reference=None,
            weight=1.0,
            raw={},
        )
        messages = build_judge_messages(item, "answer", rubric)
        self.assertIn("[cite]", messages[1]["content"])
        self.assertIn("answer", messages[1]["content"])


class SecurityTests(unittest.TestCase):
    def test_command_redaction(self):
        from popt.cli import _display_command

        rendered = _display_command(
            [
                "optimize",
                "--api-key",
                "sk-secret-value-123456",
                "--header",
                "Authorization: Bearer abc.def",
                "--header",
                "x-trace: keep-me",
            ]
        )
        self.assertNotIn("sk-secret-value-123456", rendered)
        self.assertNotIn("abc.def", rendered)
        self.assertIn("x-trace: keep-me", rendered)
        self.assertIn("--api-key ***", rendered)

    def test_command_backend_name_hides_command(self):
        from popt.llm import CommandBackend

        backend = CommandBackend("echo sk-live-secret-123456", label="task")
        self.assertNotIn("sk-live-secret-123456", backend.name)
        self.assertEqual(backend.model, "task")


class JsonTests(unittest.TestCase):
    def test_fenced_and_embedded(self):
        self.assertEqual(extract_json('```json\n{"a": 1}\n```'), {"a": 1})
        self.assertEqual(extract_json('prefix {"a": {"b": 2}} suffix'), {"a": {"b": 2}})
        with self.assertRaises(ValueError):
            extract_json("no json here")


class SplitTests(unittest.TestCase):
    def test_split_deterministic_and_disjoint(self):
        from popt.dataset import Item
        from popt.rubric import normalize_rubric

        items = [
            Item(i, i + 1, f"id{i}", "q", normalize_rubric(["x"]), None, 1.0, {}) for i in range(10)
        ]
        search_a, holdout_a = split_items(items, 0.2, seed=7)
        search_b, holdout_b = split_items(items, 0.2, seed=7)
        self.assertEqual([item.index for item in holdout_a], [item.index for item in holdout_b])
        self.assertEqual(len(holdout_a), 2)
        self.assertFalse({item.index for item in search_a} & {item.index for item in holdout_a})

    def test_parse_candidates(self):
        parsed = parse_candidates('{"candidates": [{"prompt": "p1"}, "p2"]}')
        self.assertEqual([entry["prompt"] for entry in parsed], ["p1", "p2"])


if __name__ == "__main__":
    unittest.main()
