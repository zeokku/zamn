// The extension's only code: folding for zamn, in `.zamn` files and in
// `<template lang="zamn">` of Vue files. In a Vue file the Vue extension
// folds the blocks of the component, and VS Code merges our ranges with its.
import * as vscode from "vscode";
import { vueFolds, zamnFolds, type Fold } from "./folding.js";

const toRange = ({ start, end, comment }: Fold) =>
  new vscode.FoldingRange(start, end, comment ? vscode.FoldingRangeKind.Comment : undefined);

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: "zamn" },
      { provideFoldingRanges: (document) => zamnFolds(document.getText()).map(toRange) },
    ),
    vscode.languages.registerFoldingRangeProvider(
      { language: "vue" },
      { provideFoldingRanges: (document) => vueFolds(document.getText()).map(toRange) },
    ),
  );
}
