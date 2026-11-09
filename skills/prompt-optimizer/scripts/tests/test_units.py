"""Unit tests for rubric parsing, dataset loading, judge parsing and splitting."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from popt.dataset import LoadOptions, load_dataset
from popt.errors import ConfigError, DatasetError, JudgeError
from popt.evaluate import build_judge_messages, parse_judge_response
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
    def test_plain_prompt(self):
        spec = load_prompt(inline="Be nice.")
        self.assertEqual(spec.system, "Be nice.")
        self.assertEqual(spec.rendered_user("hi"), "hi")

    def test_json_prompt_with_template(self):
        spec = load_prompt(
            inline=json.dumps(
                {
                    "system": "System",
                    "user_template": "Question: {{input}}",
                    "temperature": 0.2,
                    "few_shot": [{"role": "assistant", "content": "ok"}],
                }
            )
        )
        self.assertEqual(spec.rendered_user("why"), "Question: why")
        messages = spec.messages("why")
        self.assertEqual([message["role"] for message in messages], ["system", "assistant", "user"])

    def test_input_placeholder_in_system_rejected(self):
        with self.assertRaises(ConfigError):
            load_prompt(inline="Answer {{input}}")

    def test_template_without_placeholder_appends_input(self):
        spec = PromptSpec(system="s", user_template="Template")
        self.assertEqual(spec.rendered_user("row"), "Template\n\nrow")


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
