import Parser from "tree-sitter";
// @ts-ignore - The types for this specific sub-module can sometimes be missing, but it works in Bun
import tsx from "tree-sitter-typescript/tsx";
import { readFile, writeFile } from "node:fs/promises";
import { resolveAbsPath } from "./tools.js";

// Initialize the native parser synchronously
const parser = new Parser();
parser.setLanguage(tsx);

/**
 * TOOL 1: getFileSkeletonTool
 * Parses the file and returns a high-level map of all functions, classes, and interfaces.
 */
export async function getFileSkeletonTool(filename: string) {
  const fullPath = resolveAbsPath(filename);

  try {
    const code = await readFile(fullPath, "utf-8");
    const tree = parser.parse(code);

    // This query captures standard functions, exported functions, classes, and arrow functions
    const query = new Parser.Query(
      tsx,
      `
      (function_declaration name: (identifier) @name)
      (class_declaration name: (type_identifier) @name)
      (interface_declaration name: (type_identifier) @name)
      (export_statement (function_declaration name: (identifier) @name))
      (export_statement (class_declaration name: (type_identifier) @name))
      (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function)))
      `
    );

    const matches = query.matches(tree.rootNode);
    
    const symbols = matches.map((match) => {
      const cap = match.captures[0];
      if (!cap) return "";
      const node = cap.node;
      // Get the parent context to show the signature (e.g., "export async function doThing()")
      // We split by "{" to avoid returning the whole function body
      const parentBlock = node.parent?.text || node.text;
      const signature = (parentBlock.split("{")[0] ?? "").trim();
      return signature;
    });

    // Deduplicate and clean up the list
    const uniqueSymbols = [...new Set(symbols)].filter(s => s.length > 0);

    return { 
      file_path: fullPath, 
      symbols_found: uniqueSymbols 
    };
  } catch (e: any) {
    return { file_path: fullPath, error: e.message as string };
  }
}

/**
 * TOOL 2: readSymbolTool
 * Allows the LLM to read the implementation of ONE specific function without loading the whole file.
 */
export async function readSymbolTool(filename: string, symbolName: string) {
  const fullPath = resolveAbsPath(filename);

  try {
    const code = await readFile(fullPath, "utf-8");
    const tree = parser.parse(code);

    const query = new Parser.Query(
      tsx,
      `
      (function_declaration name: (identifier) @name (#eq? @name "${symbolName}"))
      (class_declaration name: (type_identifier) @name (#eq? @name "${symbolName}"))
      (interface_declaration name: (type_identifier) @name (#eq? @name "${symbolName}"))
      (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function) (#eq? @name "${symbolName}")))
      `
    );

    const matches = query.matches(tree.rootNode);
    
    if (matches.length === 0) {
      return { file_path: fullPath, error: `Symbol '${symbolName}' not found in file.` };
    }

    // Return the full text of the entire block
    const firstMatch = matches[0]!;
    const targetNode = firstMatch.captures[0]?.node.parent;
    return {
      file_path: fullPath,
      symbol: symbolName,
      content: targetNode?.text || "Could not resolve node block."
    };

  } catch (e: any) {
    return { file_path: fullPath, error: e.message as string };
  }
}

/**
 * TOOL 3: replaceSymbolTool
 * Surgically swaps an AST node using byte indices. Completely ignores formatting/whitespace.
 */
export async function replaceSymbolTool(filename: string, symbolName: string, newCode: string) {
  const fullPath = resolveAbsPath(filename);

  try {
    const code = await readFile(fullPath, "utf-8");
    const tree = parser.parse(code);

    const query = new Parser.Query(
      tsx,
      `
      (function_declaration name: (identifier) @name (#eq? @name "${symbolName}"))
      (class_declaration name: (type_identifier) @name (#eq? @name "${symbolName}"))
      (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function) (#eq? @name "${symbolName}")))
      `
    );

    const matches = query.matches(tree.rootNode);
    
    if (matches.length === 0) {
      return { file_path: fullPath, error: `Symbol '${symbolName}' not found.` };
    }

    const firstMatch = matches[0]!;
    const targetNode = firstMatch.captures[0]?.node.parent;
    if (!targetNode) {
      return { file_path: fullPath, error: "Could not resolve node boundaries." };
    }

    // Using exact byte indices for the slice prevents any hallucinated whitespace 
    // from breaking the diff.
    const before = code.slice(0, targetNode.startIndex);
    const after = code.slice(targetNode.endIndex);
    
    // Construct the new file content
    const updatedCode = before + newCode + after;

    await writeFile(fullPath, updatedCode, "utf-8");
    
    return { 
      file_path: fullPath, 
      action: `Successfully replaced AST node: ${symbolName}` 
    };
  } catch (e: any) {
    return { file_path: fullPath, error: e.message as string };
  }
}
