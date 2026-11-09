"""End-to-end test against a local OpenAI-compatible stub server."""

from __future__ import annotations

import json
import re
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from popt import cli

DATASET = [
    {
        "id": "row-1",
        "input": "What is 2 + 2?",
        "rubric": [
            {
                "id": "marker",
                "text": "The answer mentions GOOD",
                "weight": 1,
                "check": {"type": "contains", "value": "GOOD"},
            },
            {"id": "quality", "text": "Actually answers the question", "weight": 1},
        ],
    },
    {
        "id": "row-2",
        "input": "Name a color.",
        "rubric": [
            {
                "id": "marker",
                "text": "The answer mentions GOOD",
                "weight": 1,
                "check": {"type": "contains", "value": "GOOD"},
            },
            {"id": "quality", "text": "Names a color", "weight": 1},
        ],
    },
]

BASELINE_PROMPT = "Answer the question."


class StubHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # noqa: D401 - silence request logs
        pass

    def do_POST(self):  # noqa: N802 - stdlib API
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        messages = payload.get("messages") or []
        system = messages[0]["content"] if messages and messages[0].get("role") == "system" else ""
        user = messages[-1]["content"] if messages else ""

        if system.startswith("You are a senior prompt engineer"):
            content = json.dumps(
                {
                    "candidates": [
                        {
                            "prompt": "GOOD answers: answer the question directly, cite evidence, "
                            "and never fabricate details.",
                            "hypothesis": "Adding the required marker and evidence lifts both criteria.",
                            "changes": "Added the marker and an evidence requirement.",
                        },
                        {
                            "prompt": "You must begin every answer with GOOD, then answer the user's "
                            "question in one sentence.",
                            "hypothesis": "An explicit output contract makes the marker reliable.",
                            "changes": "Added a strict output contract.",
                        },
                    ]
                }
            )
        elif system.startswith("You are a rigorous, impartial grader"):
            match = re.search(r"<model_output>\n(.*?)\n</model_output>", user, re.S)
            output = match.group(1) if match else ""
            ids = re.findall(r"^- \[([^\]]+)\]", user, re.M)
            score = 1 if "GOOD" in output else 0
            content = json.dumps(
                {
                    "criteria": [
                        {"id": criterion_id, "score": score, "rationale": "stub rationale"}
                        for criterion_id in ids
                    ],
                    "summary": "stub verdict",
                }
            )
        else:
            model_name = payload.get("model")
            if model_name == "always-good":
                content = "GOOD answer with evidence."
            elif model_name == "needs-prompt":
                content = (
                    "GOOD answer with evidence."
                    if "GOOD" in system
                    else "an answer without the required marker"
                )
            else:
                content = (
                    "GOOD answer with evidence."
                    if "GOOD" in system
                    else "an answer without the required marker"
                )

        body = json.dumps(
            {
                "id": "stub",
                "object": "chat.completion",
                "model": payload.get("model", "stub"),
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 12, "completion_tokens": 6, "total_tokens": 18},
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class EndToEndTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), StubHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}/v1"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dir = Path(self.temp.name)
        self.dataset = self.dir / "data.jsonl"
        self.dataset.write_text(
            "\n".join(json.dumps(row, ensure_ascii=False) for row in DATASET) + "\n",
            encoding="utf-8",
        )
        self.prompt = self.dir / "prompt.txt"
        self.prompt.write_text(BASELINE_PROMPT, encoding="utf-8")
        self.prompt_yaml = self.dir / "prompt.yaml"
        self.prompt_yaml.write_text(
            """name: stub-prompt
messages:
  - role: system
    content: |
      Answer the question.
  - role: user
    content: |
      {{input}}
""",
            encoding="utf-8",
        )
        self.models_yaml = self.dir / "models.yaml"
        self.models_yaml.write_text(
            f"""models:
  - name: strong
    model: always-good
    base_url: {self.base_url}
    temperature: 0.0
    max_tokens: 256
    weight: 1
  - name: weak
    model: needs-prompt
    base_url: {self.base_url}
    temperature: 0.0
    max_tokens: 256
    weight: 3
judge:
  model: judge-stub
  base_url: {self.base_url}
  temperature: 0
  max_tokens: 256
optimizer:
  model: optimizer-stub
  base_url: {self.base_url}
  temperature: 0.7
  max_tokens: 512
""",
            encoding="utf-8",
        )

    def tearDown(self):
        self.temp.cleanup()

    def _args(self, out: Path, extra: list[str] | None = None) -> list[str]:
        return [
            "optimize",
            "--dataset",
            str(self.dataset),
            "--prompt-file",
            str(self.prompt),
            "--out",
            str(out),
            "--base-url",
            self.base_url,
            "--api-key",
            "test-key",
            "--cache-dir",
            str(self.dir / "cache"),
            "--rounds",
            "2",
            "--candidates",
            "2",
            "--concurrency",
            "2",
            "--max-calls",
            "200",
            "--quiet",
            "--header",
            "x-test: 1",
            *(extra or []),
        ]

    def _models_args(self, out: Path, extra: list[str] | None = None) -> list[str]:
        return [
            "optimize",
            "--dataset",
            str(self.dataset),
            "--prompt-file",
            str(self.prompt_yaml),
            "--models",
            str(self.models_yaml),
            "--out",
            str(out),
            "--cache-dir",
            str(self.dir / "cache"),
            "--rounds",
            "1",
            "--candidates",
            "2",
            "--concurrency",
            "2",
            "--max-calls",
            "300",
            "--quiet",
            *(extra or []),
        ]

    def test_multi_model_weighted_objective(self):
        out = self.dir / "run-multi"
        code = cli.main(self._models_args(out))
        self.assertEqual(code, 0)

        summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
        baseline = summary["baseline"]["metrics"]["all"]
        best = summary["best"]["metrics"]["all"]
        self.assertEqual(baseline["by_model"]["strong"]["score_mean"], 100.0)
        self.assertEqual(baseline["by_model"]["weak"]["score_mean"], 0.0)
        self.assertEqual(baseline["score_mean"], 25.0)
        self.assertEqual(best["score_mean"], 100.0)
        self.assertEqual(summary["improvement"]["full_mean_delta"], 75.0)
        self.assertEqual(summary["improvement"]["by_model"]["weak"]["delta"], 100.0)
        self.assertEqual(summary["improvement"]["by_model"]["strong"]["delta"], 0.0)

        targets = summary["models"]["targets"]
        self.assertEqual([target["name"] for target in targets], ["strong", "weak"])
        self.assertEqual([target["weight"] for target in targets], [1.0, 3.0])

        rows = [
            json.loads(line)
            for line in (out / "results" / "best_full.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(len(rows), 4)
        self.assertEqual({row["model"] for row in rows}, {"strong", "weak"})
        self.assertTrue(all(row["item_score"] == 100.0 for row in rows))

        report = (out / "report.md").read_text(encoding="utf-8")
        self.assertIn("分模型得分", report)
        self.assertIn("strong", report)
        self.assertIn("weak", report)

    def test_optimize_end_to_end(self):
        out = self.dir / "run"
        code = cli.main(self._args(out))
        self.assertEqual(code, 0)

        summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["baseline"]["metrics"]["all"]["score_mean"], 0.0)
        self.assertEqual(summary["best"]["metrics"]["all"]["score_mean"], 100.0)
        self.assertEqual(summary["improvement"]["full_mean_delta"], 100.0)
        self.assertTrue(summary["improvement"]["full_comparable"])
        self.assertTrue(summary["history"])
        self.assertTrue(summary["history"][0]["accepted"])

        best_prompt = (out / "prompts" / "best.txt").read_text(encoding="utf-8")
        self.assertIn("GOOD", best_prompt)
        report = (out / "report.md").read_text(encoding="utf-8")
        self.assertIn("Prompt 优化报告", report)
        self.assertIn("100.00", report)

        baseline_rows = [
            json.loads(line)
            for line in (out / "results" / "baseline_full.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        best_rows = [
            json.loads(line)
            for line in (out / "results" / "best_full.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        self.assertEqual(len(baseline_rows), 2)
        self.assertTrue(all(row["item_score"] == 0.0 for row in baseline_rows))
        self.assertTrue(all(row["item_score"] == 100.0 for row in best_rows))
        self.assertTrue(all(len(row["criteria"]) == 2 for row in best_rows))

    def test_holdout_split_reported(self):
        out = self.dir / "run-holdout"
        code = cli.main(self._args(out, ["--holdout", "0.5", "--rounds", "1"]))
        self.assertEqual(code, 0)
        summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["dataset"]["holdout_rows"], 1)
        self.assertEqual(summary["dataset"]["search_rows"], 1)
        self.assertIsNotNone(summary["best"]["metrics"]["holdout"])
        self.assertEqual(summary["improvement"]["holdout_mean_delta"], 100.0)

    def test_score_and_dry_run(self):
        out = self.dir / "score"
        code = cli.main(
            [
                "score",
                "--dataset",
                str(self.dataset),
                "--prompt-file",
                str(self.prompt),
                "--out",
                str(out),
                "--base-url",
                self.base_url,
                "--api-key",
                "test-key",
                "--cache-dir",
                str(self.dir / "cache"),
                "--quiet",
            ]
        )
        self.assertEqual(code, 0)
        summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual(summary["score_mean"], 0.0)
        self.assertEqual(summary["scored_items"], 2)

        dry = self.dir / "dry"
        code = cli.main(self._args(dry, ["--dry-run"]))
        self.assertEqual(code, 0)
        self.assertFalse((dry / "summary.json").exists())

    def test_report_command_rerenders(self):
        out = self.dir / "run-report"
        self.assertEqual(cli.main(self._args(out, ["--rounds", "1"])), 0)
        report_path = out / "report.md"
        original = report_path.read_text(encoding="utf-8")
        report_path.unlink()
        self.assertEqual(cli.main(["report", "--run", str(out)]), 0)
        self.assertEqual(report_path.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
