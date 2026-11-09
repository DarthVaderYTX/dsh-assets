"""A small, dependency-free YAML subset parser.

The skill runs on a bare Python runtime (no PyYAML), so this module supports
exactly the YAML used by prompt templates and model configs:

* block mappings and sequences, nested arbitrarily;
* plain / single-quoted / double-quoted scalars;
* literal (``|``) and folded (``>``) block scalars with ``-``/``+`` chomping;
* flow collections (``{a: b}``, ``[1, 2]``), including nesting;
* comments outside quotes and block scalars;
* document start markers ``---``.

It deliberately rejects anchors, aliases, tags, multiple documents and other
advanced YAML so a malformed config fails loudly instead of being guessed.
"""

from __future__ import annotations

import json
import re
from typing import Any

NUMBER_RE = re.compile(r"^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$")
INT_RE = re.compile(r"^[+-]?\d+$")
NULLS = {"", "~", "null", "Null", "NULL"}
TRUE_WORDS = {"true", "True", "TRUE", "yes", "Yes", "YES", "on", "On", "ON"}
FALSE_WORDS = {"false", "False", "FALSE", "no", "No", "NO", "off", "Off", "OFF"}
BLOCK_HEADER_RE = re.compile(r"^([|>])([+-]?)([1-9]?)$")


class MiniYamlError(ValueError):
    def __init__(self, message: str, line: int | None = None) -> None:
        self.line = line
        super().__init__(f"line {line}: {message}" if line else message)


def loads(text: str) -> Any:
    return _Parser(text).parse()


def load_file(path: str) -> Any:
    with open(path, "r", encoding="utf-8-sig") as handle:
        return loads(handle.read())


def _strip_comment(text: str) -> str:
    quote: str | None = None
    index = 0
    while index < len(text):
        char = text[index]
        if quote:
            if quote == '"' and char == "\\":
                index += 2
                continue
            if char == quote:
                quote = None
        else:
            if char in "\"'":
                quote = char
            elif char == "#" and (index == 0 or text[index - 1].isspace()):
                return text[:index].rstrip()
        index += 1
    return text.rstrip()


def _unescape_double(body: str) -> str:
    try:
        return json.loads('"' + body + '"')
    except json.JSONDecodeError:
        pass
    # Tolerate YAML-only escapes that JSON rejects.
    out: list[str] = []
    index = 0
    escapes = {"n": "\n", "t": "\t", "r": "\r", "0": "\0", "\\": "\\", '"': '"'}
    while index < len(body):
        char = body[index]
        if char != "\\":
            out.append(char)
            index += 1
            continue
        index += 1
        if index >= len(body):
            raise MiniYamlError("dangling backslash in double-quoted scalar")
        code = body[index]
        if code == "x" and index + 2 < len(body) + 1:
            out.append(chr(int(body[index + 1 : index + 3], 16)))
            index += 3
        elif code == "u" and index + 4 < len(body) + 1:
            out.append(chr(int(body[index + 1 : index + 5], 16)))
            index += 5
        else:
            out.append(escapes.get(code, code))
            index += 1
    return "".join(out)


def _decode_quoted(text: str) -> str:
    stripped = text.strip()
    if not stripped or stripped[0] not in "\"'":
        return stripped
    quote = stripped[0]
    end = _find_quote_end(stripped, 0)
    if end is None:
        raise MiniYamlError("unterminated quoted scalar")
    trailing = stripped[end + 1 :].strip()
    if trailing:
        raise MiniYamlError(f"unexpected text after quoted scalar: {trailing!r}")
    body = stripped[1:end]
    if quote == '"':
        return _unescape_double(body)
    return body.replace("''", "'")


def _find_quote_end(text: str, start: int) -> int | None:
    quote = text[start]
    index = start + 1
    while index < len(text):
        char = text[index]
        if quote == '"' and char == "\\":
            index += 2
            continue
        if char == quote:
            if quote == "'" and index + 1 < len(text) and text[index + 1] == "'":
                index += 2
                continue
            return index
        index += 1
    return None


def _find_pair_colon(text: str) -> int:
    quote: str | None = None
    index = 0
    while index < len(text):
        char = text[index]
        if quote:
            if quote == '"' and char == "\\":
                index += 2
                continue
            if char == quote:
                quote = None
        else:
            if char in "\"'":
                quote = char
            elif char == ":" and (index + 1 == len(text) or text[index + 1] in " \t"):
                return index
        index += 1
    return -1


def _scalar(text: str) -> Any:
    text = _strip_comment(text).strip()
    if not text:
        return None
    if text[0] in "\"'":
        return _decode_quoted(text)
    if text in NULLS:
        return None
    if text in TRUE_WORDS:
        return True
    if text in FALSE_WORDS:
        return False
    if INT_RE.match(text):
        return int(text)
    if NUMBER_RE.match(text):
        return float(text)
    if text.startswith(("&", "*", "!")):
        raise MiniYamlError(f"anchors, aliases and tags are not supported: {text!r}")
    return text


class _FlowParser:
    def __init__(self, text: str, line: int) -> None:
        self.text = text
        self.pos = 0
        self.line = line

    def error(self, message: str) -> MiniYamlError:
        return MiniYamlError(message, self.line)

    def skip_ws(self) -> None:
        while self.pos < len(self.text) and self.text[self.pos] in " \t":
            self.pos += 1

    def parse_value(self) -> Any:
        self.skip_ws()
        if self.pos >= len(self.text):
            raise self.error("unexpected end of flow collection")
        char = self.text[self.pos]
        if char == "{":
            return self.parse_mapping()
        if char == "[":
            return self.parse_sequence()
        if char in "\"'":
            end = _find_quote_end(self.text, self.pos)
            if end is None:
                raise self.error("unterminated quoted scalar")
            raw = self.text[self.pos : end + 1]
            self.pos = end + 1
            return _decode_quoted(raw)
        start = self.pos
        while self.pos < len(self.text) and self.text[self.pos] not in ",]}":
            self.pos += 1
        return _scalar(self.text[start : self.pos])

    def parse_mapping(self) -> dict[str, Any]:
        self.pos += 1  # {
        result: dict[str, Any] = {}
        self.skip_ws()
        if self.pos < len(self.text) and self.text[self.pos] == "}":
            self.pos += 1
            return result
        while True:
            self.skip_ws()
            if self.pos >= len(self.text):
                raise self.error("unterminated flow mapping")
            if self.text[self.pos] in "\"'":
                end = _find_quote_end(self.text, self.pos)
                if end is None:
                    raise self.error("unterminated quoted key")
                key = _decode_quoted(self.text[self.pos : end + 1])
                self.pos = end + 1
            else:
                start = self.pos
                while self.pos < len(self.text) and self.text[self.pos] not in ":,}":
                    self.pos += 1
                key = self.text[start : self.pos].strip()
            self.skip_ws()
            if self.pos >= len(self.text) or self.text[self.pos] != ":":
                raise self.error(f"expected ':' after flow key {key!r}")
            self.pos += 1
            result[str(key)] = self.parse_value()
            self.skip_ws()
            if self.pos < len(self.text) and self.text[self.pos] == ",":
                self.pos += 1
                self.skip_ws()
                if self.pos < len(self.text) and self.text[self.pos] == "}":
                    self.pos += 1
                    return result
                continue
            if self.pos < len(self.text) and self.text[self.pos] == "}":
                self.pos += 1
                return result
            raise self.error("expected ',' or '}' in flow mapping")

    def parse_sequence(self) -> list[Any]:
        self.pos += 1  # [
        result: list[Any] = []
        self.skip_ws()
        if self.pos < len(self.text) and self.text[self.pos] == "]":
            self.pos += 1
            return result
        while True:
            result.append(self.parse_value())
            self.skip_ws()
            if self.pos < len(self.text) and self.text[self.pos] == ",":
                self.pos += 1
                self.skip_ws()
                if self.pos < len(self.text) and self.text[self.pos] == "]":
                    self.pos += 1
                    return result
                continue
            if self.pos < len(self.text) and self.text[self.pos] == "]":
                self.pos += 1
                return result
            raise self.error("expected ',' or ']' in flow sequence")


class _Parser:
    def __init__(self, text: str) -> None:
        if text.startswith("\ufeff"):
            text = text[1:]
        self.raw = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        self.i = 0

    # ------------------------------------------------------------- helpers
    def error(self, message: str, index: int | None = None) -> MiniYamlError:
        return MiniYamlError(message, (index if index is not None else self.i) + 1)

    @staticmethod
    def _blank(raw: str) -> bool:
        stripped = raw.strip()
        return not stripped or stripped.startswith("#")

    def _indent(self, raw: str) -> int:
        leading = raw[: len(raw) - len(raw.lstrip(" \t"))]
        if "\t" in leading:
            raise self.error("tabs are not allowed for indentation")
        return len(leading)

    def _line(self) -> tuple[int, str]:
        raw = self.raw[self.i]
        indent = self._indent(raw)
        return indent, raw[indent:].rstrip()

    def _skip(self) -> None:
        while self.i < len(self.raw) and self._blank(self.raw[self.i]):
            self.i += 1

    def _skip_directives(self) -> None:
        while self.i < len(self.raw):
            stripped = self.raw[self.i].strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("%"):
                self.i += 1
                continue
            break

    # --------------------------------------------------------------- parse
    def parse(self) -> Any:
        self._skip_directives()
        if self.i >= len(self.raw):
            return {}
        if self.raw[self.i].strip() == "---":
            self.i += 1
            self._skip_directives()
            if self.i >= len(self.raw):
                return {}
        indent, _content = self._line()
        value = self._parse_block(indent)
        self._skip()
        if self.i < len(self.raw) and self.raw[self.i].strip() == "...":
            self.i += 1
            self._skip()
        if self.i < len(self.raw):
            if self.raw[self.i].strip() == "---":
                raise self.error("multiple YAML documents are not supported")
            raise self.error("unexpected content")
        return value

    def _parse_block(self, indent: int) -> Any:
        self._skip()
        if self.i >= len(self.raw):
            return None
        current, content = self._line()
        if current < indent:
            return None
        if current > indent:
            raise self.error(f"unexpected indentation (expected {indent} spaces)")
        if content == "-" or content.startswith("- "):
            return self._parse_sequence(indent)
        if content.startswith(("[", "{")):
            self.i += 1
            return self._parse_flow(content, self.i - 1)
        return self._parse_mapping(indent)

    def _parse_sequence(self, indent: int) -> list[Any]:
        result: list[Any] = []
        while True:
            self._skip()
            if self.i >= len(self.raw):
                break
            current, content = self._line()
            if current < indent:
                break
            if current > indent:
                raise self.error(f"unexpected indentation in sequence (expected {indent} spaces)")
            if not (content == "-" or content.startswith("- ")):
                break
            line_index = self.i
            rest_raw = content[1:]
            rest = rest_raw.lstrip(" ")
            key_indent = indent + 1 + (len(rest_raw) - len(rest))
            self.i += 1

            if not rest or rest.startswith("#"):
                self._skip()
                if self.i < len(self.raw):
                    next_indent, _ = self._line()
                    if next_indent > indent:
                        item = self._parse_block(next_indent)
                    else:
                        item = None
                else:
                    item = None
            elif rest[0] in "|>":
                item = self._block_scalar(indent, rest, line_index)
            elif rest[0] in "[{":
                item = self._parse_flow(rest, line_index)
            else:
                colon = _find_pair_colon(rest)
                if colon != -1:
                    key = _decode_key(rest[:colon].strip(), line_index)
                    value_text = rest[colon + 1 :].lstrip()
                    if key in ():
                        raise self.error("empty mapping key", line_index)
                    item = {
                        key: self._parse_value(value_text, key_indent, line_index)
                    }
                    item = self._parse_mapping(key_indent, initial=item)
                else:
                    item = _scalar(rest)
            result.append(item)
        return result

    def _parse_mapping(self, indent: int, initial: dict[str, Any] | None = None) -> dict[str, Any]:
        result: dict[str, Any] = dict(initial or {})
        while True:
            self._skip()
            if self.i >= len(self.raw):
                break
            current, content = self._line()
            if current < indent:
                break
            if current > indent:
                raise self.error(f"unexpected indentation in mapping (expected {indent} spaces)")
            if content == "-" or content.startswith("- "):
                raise self.error("sequence item is not valid where a mapping key was expected")
            line_index = self.i
            colon = _find_pair_colon(content)
            if colon == -1:
                raise self.error("expected 'key: value'")
            key = _decode_key(content[:colon].strip(), line_index)
            if not key:
                raise self.error("empty mapping key", line_index)
            value_text = content[colon + 1 :].lstrip()
            self.i += 1
            value = self._parse_value(value_text, indent, line_index)
            if key in result:
                raise self.error(f"duplicate mapping key {key!r}", line_index)
            result[key] = value
        return result

    def _parse_value(self, value_text: str, parent_indent: int, line_index: int) -> Any:
        stripped = value_text.strip()
        if stripped.startswith("#"):
            stripped = ""
        if not stripped:
            self._skip()
            if self.i < len(self.raw):
                next_indent, _ = self._line()
                if next_indent > parent_indent:
                    return self._parse_block(next_indent)
            return None
        if stripped[0] in "|>":
            header = _strip_comment(stripped)
            return self._block_scalar(parent_indent, header, line_index)
        if stripped[0] in "[{":
            return self._parse_flow(stripped, line_index)
        return _scalar(stripped)

    def _parse_flow(self, text: str, line_index: int) -> Any:
        # Strip a trailing comment only when it is outside quotes.
        cleaned = _strip_comment(text).strip()
        parser = _FlowParser(cleaned, line_index + 1)
        value = parser.parse_value()
        parser.skip_ws()
        if parser.pos != len(cleaned):
            raise self.error("unexpected text after flow collection", line_index)
        return value

    def _block_scalar(self, parent_indent: int, header: str, line_index: int) -> str:
        match = BLOCK_HEADER_RE.match(header.strip())
        if not match:
            raise self.error(f"invalid block scalar header {header!r}", line_index)
        style, chomp, explicit = match.groups()
        explicit_indent = int(explicit) if explicit else None

        start = self.i
        block_lines: list[str] = []
        nonblank_indents: list[int] = []
        while self.i < len(self.raw):
            raw = self.raw[self.i]
            if raw.strip() == "":
                block_lines.append("")
                self.i += 1
                continue
            current = self._indent(raw)
            if current <= parent_indent:
                break
            block_lines.append(raw)
            nonblank_indents.append(current)
            self.i += 1

        if not block_lines:
            return ""
        if nonblank_indents:
            min_indent = min(nonblank_indents)
            content_indent = parent_indent + explicit_indent if explicit_indent else min_indent
            if min_indent < content_indent:
                raise self.error("block scalar line is less indented than the block", line_index)
        else:
            content_indent = parent_indent + (explicit_indent or 1)

        body: list[str] = []
        for raw in block_lines:
            if raw.strip() == "":
                body.append("")
            else:
                current = self._indent(raw)
                if current < content_indent:
                    raise self.error("inconsistent indentation in block scalar", line_index)
                body.append(raw[content_indent:])

        if style == "|":
            text = "\n".join(body)
        else:
            pieces: list[str] = []
            for body_line in body:
                if body_line == "":
                    pieces.append("\n")
                else:
                    if pieces and not pieces[-1].endswith("\n") and not pieces[-1].endswith(" "):
                        pieces.append(" ")
                    pieces.append(body_line)
            text = "".join(pieces)

        if chomp == "-":
            return text.rstrip("\n")
        if chomp == "+":
            return text
        text = text.rstrip("\n")
        return text + "\n" if text else ""


def _decode_key(raw: str, line_index: int) -> str:
    if raw.startswith(("&", "*", "!")):
        raise MiniYamlError(f"anchors, aliases and tags are not supported: {raw!r}", line_index + 1)
    if raw.startswith(("\"", "'")):
        try:
            return _decode_quoted(raw)
        except MiniYamlError as error:
            error.line = error.line or line_index + 1
            raise
    return raw
