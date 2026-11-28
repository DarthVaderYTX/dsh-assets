# https://github.com/facebook/react/blob/main/.prettierrc.js

> 来源：[https://github.com/facebook/react/blob/main/.prettierrc.js](https://github.com/facebook/react/blob/main/.prettierrc.js)  
> 抓取：2026-11-28 21:41 +0800 · HTTP 200 · 原始页面 1044 字节  
> 离线副本，版权归原公司所有；与线上版本不一致时以官网为准。

'use strict';

const {esNextPaths} = require('./scripts/shared/pathsByLanguageVersion');

module.exports = {
 bracketSpacing: false,
 singleQuote: true,
 bracketSameLine: true,
 trailingComma: 'es5',
 printWidth: 80,
 plugins: ['prettier-plugin-hermes-parser'],
 parser: 'hermes',
 arrowParens: 'avoid',
 overrides: [
 {
 files: ['*.code-workspace'],
 options: {
 parser: 'json-stringify',
 },
 },
 {
 files: esNextPaths,
 options: {
 trailingComma: 'all',
 },
 },
 {
 files: ['*.ts', '*.tsx'],
 options: {
 trailingComma: 'all',
 parser: 'typescript',
 },
 },
 {
 // Flow `match` syntax fixtures: prettier's built-in Flow parser cannot
 // parse the experimental syntax, hermes-parser can.
 files: [
 'compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler/match-*',
 ],
 options: {
 parser: 'hermes',
 plugins: ['prettier-plugin-hermes-parser'],
 },
 },
 ],
};
