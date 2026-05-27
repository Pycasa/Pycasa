const ALLOWED_PARENT_ORIGINS = [
	'https://horizons.hostinger.com',
	'https://horizons.hostinger.dev',
	'https://horizons-frontend-local.hostinger.dev',
	'http://localhost:4000',
];

const IMPORTANT_STYLES = [
	'display',
	'position',
	'flex-direction',
	'justify-content',
	'align-items',
	'width',
	'height',
	'padding',
	'margin',
	'border',
	'background-color',
	'color',
	'font-size',
	'font-weight',
	'font-family',
	'border-radius',
	'box-shadow',
	'gap',
	'grid-template-columns',
];

const PRIMARY_400_COLOR = '#7B68EE';
const TEXT_CONTEXT_MAX_LENGTH = 500;
const DATA_SELECTION_MODE_ENABLED_ATTRIBUTE = 'data-selection-mode-enabled';
const MESSAGE_TYPE_ENABLE_SELECTION_MODE = 'enableSelectionMode';
const MESSAGE_TYPE_DISABLE_SELECTION_MODE = 'disableSelectionMode';

let selectionModeEnabled = false;
let currentHoverElement = null;
let overlayDiv = null;
let selectedOverlayDiv = null;
let selectedElement = null;


function injectStyles() {
	if (document.getElementById('selection-mode-styles')) {
		return;
	}

	const style = document.createElement('style');
	style.id = 'selection-mode-styles';
	style.textContent = `
		#selection-mode-overlay {
			position: absolute;
			border: 2px dashed ${PRIMARY_400_COLOR};
			pointer-events: none;
			z-index: 999999;
		}
		#selection-mode-selected-overlay {
			position: absolute;
			border: 3px solid ${PRIMARY_400_COLOR};
			pointer-events: none;
			z-index: 999998;
		}
	`;
	document.head.appendChild(style);
}

function getParentOrigin() {
	if (
		window.location.ancestorOrigins
		&& window.location.ancestorOrigins.length > 0
	) {
		return window.location.ancestorOrigins[0];
	}

	if (document.referrer) {
		try {
			return new URL(document.referrer).origin;
		} catch {
			console.warn('[SELECTION MODE] Invalid referrer URL:', document.referrer);
		}
	}

	return null;
}

/**
 * Extract file path from React Fiber metadata (simplified - only for filePath)
 * @param {*} node - DOM node
 * @returns {string|null} - File path if found, null otherwise
 */
function getFilePathFromNode(node) {
	const fiberKey = Object.keys(node).find(k => k.startsWith('__reactFiber'));
	if (!fiberKey) {
		return null;
	}

	const fiber = node[fiberKey];
	if (!fiber) {
		return null;
	}

	// Traverse up the fiber tree to find source metadata
	let currentFiber = fiber;
	while (currentFiber) {
		const source = currentFiber._debugSource
			|| currentFiber.memoizedProps?.__source
			|| currentFiber.pendingProps?.__source;

		if (source?.fileName) {
			return source.fileName;
		}

		currentFiber = currentFiber.return;
	}

	return null;
}

/**
 * Generate a CSS selector path to uniquely identify the element
 * @param {*} element
 * @returns {string} CSS selector path
 */
function getPathToElement(element) {
	const path = [];
	let current = element;
	let depth = 0;
	const maxDepth = 20; // Prevent infinite loops

	while (current && current.nodeType === Node.ELEMENT_NODE && depth < maxDepth) {
		let selector = current.nodeName.toLowerCase();

		if (current.id) {
			selector += `#${current.id}`;
			path.unshift(selector);
			break; // ID is unique, stop here
		}

		if (current.className && typeof current.className === 'string') {
			const classes = current.className.trim().split(/\s+/).filter(c => c.length > 0);
			if (classes.length > 0) {
				selector += `.${classes.join('.')}`;
			}
		}

		if (current.parentElement) {
			const siblings = Array.from(current.parentElement.children);
			const sameTypeSiblings = siblings.filter(s => s.nodeName === current.nodeName);
			if (sameTypeSiblings.length > 1) {
				const index = sameTypeSiblings.indexOf(current) + 1;
				selector += `:nth-of-type(${index})`;
			}
		}

		path.unshift(selector);
		current = current.parentElement;
		depth++;
	}

	return path.join(' > ');
}

function getComputedStyles(element) {
	const computedStyles = window.getComputedStyle(element);
	
	return Object.fromEntries(IMPORTANT_STYLES.map((style) => {
		const styleValue = computedStyles.getPropertyValue(style)?.trim();

		return styleValue && styleValue !== 'none' && styleValue !== 'normal'
			? [style, styleValue]
			: null;
	})
	.filter(Boolean));
}

function extractDOMContext(element) {
	if (!element) {
		return null;
	}

	const textContent = element.textContent?.trim();

	return {
		outerHTML: element.outerHTML,
		selector: getPathToElement(element),
		attributes: (element.attributes && element.attributes.length > 0) 
		? Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, attr.value]))
			: {},
		computedStyles: getComputedStyles(element),
		textContent: (textContent && textContent.length > 0 && textContent.length < TEXT_CONTEXT_MAX_LENGTH)
			? element.textContent?.trim()
			: null
	};
}

function createOverlay() {
	if (overlayDiv) {
		return;
	}

	injectStyles();

	overlayDiv = document.createElement('div');
	overlayDiv.id = 'selection-mode-overlay';
	document.body.appendChild(overlayDiv);
}

function createSelectedOverlay() {
	if (selectedOverlayDiv) {
		return;
	}

	injectStyles();

	selectedOverlayDiv = document.createElement('div');
	selectedOverlayDiv.id = 'selection-mode-selected-overlay';
	document.body.appendChild(selectedOverlayDiv);
}

function removeOverlay() {
	if (overlayDiv && overlayDiv.parentNode) {
		overlayDiv.parentNode.removeChild(overlayDiv);
		overlayDiv = null;
	}
	if (selectedOverlayDiv && selectedOverlayDiv.parentNode) {
		selectedOverlayDiv.parentNode.removeChild(selectedOverlayDiv);
		selectedOverlayDiv = null;
	}
}

function showOverlay(element) {
	if (!overlayDiv) {
		createOverlay();
	}

	const rect = element.getBoundingClientRect();
	overlayDiv.style.left = `${rect.left + window.scrollX}px`;
	overlayDiv.style.top = `${rect.top + window.scrollY}px`;
	overlayDiv.style.width = `${rect.width}px`;
	overlayDiv.style.height = `${rect.height}px`;
	overlayDiv.style.display = 'block';
}

function showSelectedOverlay(element) {
	if (!selectedOverlayDiv) {
		createSelectedOverlay();
	}

	const rect = element.getBoundingClientRect();
	selectedOverlayDiv.style.left = `${rect.left + window.scrollX}px`;
	selectedOverlayDiv.style.top = `${rect.top + window.scrollY}px`;
	selectedOverlayDiv.style.width = `${rect.width}px`;
	selectedOverlayDiv.style.height = `${rect.height}px`;
	selectedOverlayDiv.style.display = 'block';
}

function hideOverlay() {
	if (overlayDiv) {
		overlayDiv.style.display = 'none';
	}
}

function handleMouseMove(event) {
	if (!selectionModeEnabled) {
		return;
	}

	const element = document.elementFromPoint(event.clientX, event.clientY);
	if (!element) {
		hideOverlay();
		currentHoverElement = null;
		return;
	}

	if (element === overlayDiv || element === selectedOverlayDiv) {
		return;
	}

	// Only update if we're hovering a different element
	if (currentHoverElement !== element) {
		currentHoverElement = element;

		// Show outline on the element
		showOverlay(element);
	}
}

function handleTouchStart(event) {
	if (!selectionModeEnabled) {
		return;
	}

	const touch = event.touches[0];
	if (!touch) {
		return;
	}

	const element = document.elementFromPoint(touch.clientX, touch.clientY);
	if (!element) {
		currentHoverElement = null;
		return;
	}

	if (element === overlayDiv || element === selectedOverlayDiv) {
		return;
	}

	currentHoverElement = element;

	showOverlay(element);
}

function stripFilePath(filePath) {
	if (!filePath) {
		return filePath;
	}

	const publicHtmlIndex = filePath.indexOf('public_html/');
	if (publicHtmlIndex !== -1) {
		return filePath.substring(publicHtmlIndex + 'public_html/'.length);
	}

	return filePath;
}

function handleClick(event) {
	if (!selectionModeEnabled) {
		return;
	}

	if (!currentHoverElement) {
		const element = document.elementFromPoint(event.clientX, event.clientY);

		if (!element || element === overlayDiv || element === selectedOverlayDiv) {
			return;
		}

		currentHoverElement = element;
	}

	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();

	const domContext = extractDOMContext(currentHoverElement);

	if (!domContext) {
		return;
	}

	selectedElement = currentHoverElement;
	if (selectedElement) {
		showSelectedOverlay(selectedElement);
	}

	// Extract file path from React Fiber (if available)
	const filePath = getFilePathFromNode(currentHoverElement);
	const strippedFilePath = filePath ? stripFilePath(filePath) : undefined;

	// Send domContext and filePath to parent window
	const parentOrigin = getParentOrigin();
	if (parentOrigin && ALLOWED_PARENT_ORIGINS.includes(parentOrigin)) {
		window.parent.postMessage(
			{
				type: 'elementSelected',
				payload: {
					filePath: strippedFilePath,
					domContext,
				},
			},
			parentOrigin,
		);
	}
}

function handleMouseLeave() {
	if (!selectionModeEnabled) {
		return;
	}

	hideOverlay();
	currentHoverElement = null;
}

function enableSelectionMode() {
	if (selectionModeEnabled) {
		return;
	}

	selectionModeEnabled = true;
	document.getElementById('root')?.setAttribute(DATA_SELECTION_MODE_ENABLED_ATTRIBUTE, 'true');

	document.body.style.userSelect = 'none';

	createOverlay();
	document.addEventListener('mousemove', handleMouseMove, true);
	document.addEventListener('touchstart', handleTouchStart, true);
	document.addEventListener('click', handleClick, true);
	document.addEventListener('mouseleave', handleMouseLeave, true);
}

function disableSelectionMode() {
	if (!selectionModeEnabled) {
		return;
	}

	selectionModeEnabled = false;
	document.getElementById('root')?.removeAttribute(DATA_SELECTION_MODE_ENABLED_ATTRIBUTE);

	document.body.style.userSelect = '';

	hideOverlay();
	removeOverlay();
	currentHoverElement = null;
	selectedElement = null;

	document.removeEventListener('mousemove', handleMouseMove, true);
	document.removeEventListener('touchstart', handleTouchStart, true);
	document.removeEventListener('click', handleClick, true);
	document.removeEventListener('mouseleave', handleMouseLeave, true);
}

window.addEventListener('message', (event) => {
	if (event.data?.type === MESSAGE_TYPE_ENABLE_SELECTION_MODE) {
		enableSelectionMode();
	}
	if (event.data?.type === MESSAGE_TYPE_DISABLE_SELECTION_MODE) {
		disableSelectionMode();
	}
});
