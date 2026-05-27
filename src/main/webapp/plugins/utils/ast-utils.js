import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import generate from '@babel/generator';
import { parse } from '@babel/parser';
import traverseBabel from '@babel/traverse';
import {
	isJSXIdentifier,
	isJSXMemberExpression,
} from '@babel/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VITE_PROJECT_ROOT = path.resolve(__dirname, '../..');

// Blacklist of components that should not be extracted (utility/non-visual components)
const COMPONENT_BLACKLIST = new Set([
	'Helmet',
	'HelmetProvider',
	'Head',
	'head',
	'Meta',
	'meta',
	'Script',
	'script',
	'NoScript',
	'noscript',
	'Style',
	'style',
	'title',
	'Title',
	'link',
	'Link',
]);

/**
 * Validates that a file path is safe to access
 * @param {string} filePath - Relative file path
 * @returns {{ isValid: boolean, absolutePath?: string, error?: string }} - Object containing validation result
 */
export function validateFilePath(filePath) {
	if (!filePath) {
		return { isValid: false, error: 'Missing filePath' };
	}

	const absoluteFilePath = path.resolve(VITE_PROJECT_ROOT, filePath);

	if (filePath.includes('..')
		|| !absoluteFilePath.startsWith(VITE_PROJECT_ROOT)
		|| absoluteFilePath.includes('node_modules')) {
		return { isValid: false, error: 'Invalid path' };
	}

	if (!fs.existsSync(absoluteFilePath)) {
		return { isValid: false, error: 'File not found' };
	}

	return { isValid: true, absolutePath: absoluteFilePath };
}

/**
 * Parses a file into a Babel AST
 * @param {string} absoluteFilePath - Absolute path to file
 * @returns {object} Babel AST
 */
export function parseFileToAST(absoluteFilePath) {
	const content = fs.readFileSync(absoluteFilePath, 'utf-8');

	return parse(content, {
		sourceType: 'module',
		plugins: ['jsx', 'typescript'],
		errorRecovery: true,
	});
}

/**
 * Finds a JSX opening element at a specific line and column
 * @param {object} ast - Babel AST
 * @param {number} line - Line number (1-indexed)
 * @param {number} column - Column number (0-indexed for get-code-block, 1-indexed for apply-edit)
 * @returns {object | null} Babel path to the JSX opening element
 */
export function findJSXElementAtPosition(ast, line, column) {
	let targetNodePath = null;
	let closestNodePath = null;
	let closestDistance = Infinity;
	const allNodesOnLine = [];

	const visitor = {
		JSXOpeningElement(path) {
			const node = path.node;
			if (node.loc) {
				// Exact match (with tolerance for off-by-one column differences)
				if (node.loc.start.line === line
					&& Math.abs(node.loc.start.column - column) <= 1) {
					targetNodePath = path;
					path.stop();
					return;
				}

				// Track all nodes on the same line
				if (node.loc.start.line === line) {
					allNodesOnLine.push({
						path,
						column: node.loc.start.column,
						distance: Math.abs(node.loc.start.column - column),
					});
				}

				// Track closest match on the same line for fallback
				if (node.loc.start.line === line) {
					const distance = Math.abs(node.loc.start.column - column);
					if (distance < closestDistance) {
						closestDistance = distance;
						closestNodePath = path;
					}
				}
			}
		},
		// Also check JSXElement nodes that contain the position
		JSXElement(path) {
			const node = path.node;
			if (!node.loc) {
				return;
			}

			// Check if this element spans the target line (for multi-line elements)
			if (node.loc.start.line > line || node.loc.end.line < line) {
				return;
			}

			// If we're inside this element's range, consider its opening element
			if (!path.node.openingElement?.loc) {
				return;
			}

			const openingLine = path.node.openingElement.loc.start.line;
			const openingCol = path.node.openingElement.loc.start.column;

			// Prefer elements that start on the exact line
			if (openingLine === line) {
				const distance = Math.abs(openingCol - column);
				if (distance < closestDistance) {
					closestDistance = distance;
					closestNodePath = path.get('openingElement');
				}
				return;
			}

			// Handle elements that start before the target line
			if (openingLine < line) {
				const distance = (line - openingLine) * 100; // Penalize by line distance
				if (distance < closestDistance) {
					closestDistance = distance;
					closestNodePath = path.get('openingElement');
				}
			}
		},
	};

	traverseBabel.default(ast, visitor);

	// Return exact match if found, otherwise return closest match if within reasonable distance
	// Use larger threshold (50 chars) for same-line elements, 5 lines for multi-line elements
	const threshold = closestDistance < 100 ? 50 : 500;
	return targetNodePath || (closestDistance <= threshold ? closestNodePath : null);
}

/**
 * Checks if a JSX element name is blacklisted
 * @param {object} jsxOpeningElement - Babel JSX opening element node
 * @returns {boolean} True if blacklisted
 */
function isBlacklistedComponent(jsxOpeningElement) {
	if (!jsxOpeningElement || !jsxOpeningElement.name) {
		return false;
	}

	// Handle JSXIdentifier (e.g., <Helmet>)
	if (isJSXIdentifier(jsxOpeningElement.name)) {
		return COMPONENT_BLACKLIST.has(jsxOpeningElement.name.name);
	}

	// Handle JSXMemberExpression (e.g., <React.Fragment>)
	if (isJSXMemberExpression(jsxOpeningElement.name)) {
		let current = jsxOpeningElement.name;
		while (isJSXMemberExpression(current)) {
			current = current.property;
		}
		if (isJSXIdentifier(current)) {
			return COMPONENT_BLACKLIST.has(current.name);
		}
	}

	return false;
}

/**
 * Generates code from an AST node
 * @param {object} node - Babel AST node
 * @param {object} options - Generator options
 * @returns {string} Generated code
 */
export function generateCode(node, options = {}) {
	const generateFunction = generate.default || generate;
	const output = generateFunction(node, options);
	return output.code;
}

/**
 * Generates a full source file from AST with source maps
 * @param {object} ast - Babel AST
 * @param {string} sourceFileName - Source file name for source map
 * @param {string} originalCode - Original source code
 * @returns {{code: string, map: object}} - Object containing generated code and source map
 */
export function generateSourceWithMap(ast, sourceFileName, originalCode) {
	const generateFunction = generate.default || generate;
	return generateFunction(ast, {
		sourceMaps: true,
		sourceFileName,
	}, originalCode);
}

/**
 * Extracts code blocks from a JSX element at a specific location
 * @param {string} filePath - Relative file path
 * @param {number} line - Line number
 * @param {number} column - Column number
 * @param {object} [domContext] - Optional DOM context to return on failure
 * @returns {{success: boolean, filePath?: string, specificLine?: string, error?: string, domContext?: object}} - Object with metadata for LLM
 */
export function extractCodeBlocks(filePath, line, column, domContext) {
	try {
		// Validate file path
		const validation = validateFilePath(filePath);
		if (!validation.isValid) {
			return { success: false, error: validation.error, domContext };
		}

		// Parse AST
		const ast = parseFileToAST(validation.absolutePath);

		// Find target node
		const targetNodePath = findJSXElementAtPosition(ast, line, column);

		if (!targetNodePath) {
			return { success: false, error: 'Target node not found at specified line/column', domContext };
		}

		// Check if the target node is a blacklisted component
		const isBlacklisted = isBlacklistedComponent(targetNodePath.node);

		if (isBlacklisted) {
			return {
				success: true,
				filePath,
				specificLine: '',
			};
		}

		// Get specific line code
		const specificLine = generateCode(targetNodePath.parentPath?.node || targetNodePath.node);

		return {
			success: true,
			filePath,
			specificLine,
		};
	} catch (error) {
		console.error('[ast-utils] Error extracting code blocks:', error);
		return { success: false, error: 'Failed to extract code blocks', domContext };
	}
}

/**
 * Project root path
 */
export { VITE_PROJECT_ROOT };
