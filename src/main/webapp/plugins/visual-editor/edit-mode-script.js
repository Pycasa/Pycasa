import { POPUP_STYLES } from "./plugins/visual-editor/visual-editor-config.js";

const PLUGIN_APPLY_EDIT_API_URL = "/api/apply-edit";

const ALLOWED_PARENT_ORIGINS = [
	"https://horizons.hostinger.com",
	"https://horizons.hostinger.dev",
	"https://horizons-frontend-local.hostinger.dev",
	"http://localhost:4000",
];

let disabledTooltipElement = null;
let currentDisabledHoverElement = null;

let translations = {
	disabledTooltipText: "This text can be changed only through chat.",
	disabledTooltipTextImage: "This image can only be changed through chat.",
};

let areStylesInjected = false;

let globalEventHandlers = null;

let currentEditingInfo = null;

function injectPopupStyles() {
	if (areStylesInjected) return;

	const styleElement = document.createElement("style");
	styleElement.id = "inline-editor-styles";
	styleElement.textContent = POPUP_STYLES;
	document.head.appendChild(styleElement);
	areStylesInjected = true;
}

function findEditableElementAtPoint(event) {
	let editableElement = event.target.closest("[data-edit-id]");

	if (editableElement) {
		return editableElement;
	}

	const elementsAtPoint = document.elementsFromPoint(
		event.clientX,
		event.clientY
	);

	const found = elementsAtPoint.find(
		(el) => el !== event.target && el.hasAttribute("data-edit-id")
	);
	if (found) return found;

	return null;
}

function findDisabledElementAtPoint(event) {
	const direct = event.target.closest("[data-edit-disabled]");
	if (direct) return direct;
	const elementsAtPoint = document.elementsFromPoint(
		event.clientX,
		event.clientY
	);
	const found = elementsAtPoint.find(
		(el) => el !== event.target && el.hasAttribute("data-edit-disabled")
	);
	if (found) return found;
	return null;
}

function showPopup(targetElement, editId, currentContent, isImage = false) {
	currentEditingInfo = { editId, targetElement };

	const parentOrigin = getParentOrigin();

	if (parentOrigin && ALLOWED_PARENT_ORIGINS.includes(parentOrigin)) {
		const eventType = isImage ? "imageEditEnter" : "editEnter";

		window.parent.postMessage(
			{
				type: eventType,
				payload: { currentText: currentContent },
			},
			parentOrigin
		);
	}
}

function handleGlobalEvent(event) {
	if (
		!document.getElementById("root")?.getAttribute("data-edit-mode-enabled")
	) {
		return;
	}

	// Don't handle if selection mode is active
	if (document.getElementById("root")?.getAttribute("data-selection-mode-enabled") === "true") {
		return;
	}

	if (event.target.closest("#inline-editor-popup")) {
		return;
	}

	const editableElement = findEditableElementAtPoint(event);

	if (editableElement) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		if (event.type === "click") {
			const editId = editableElement.getAttribute("data-edit-id");
			if (!editId) {
				console.warn("[INLINE EDITOR] Clicked element missing data-edit-id");
				return;
			}

			const isImage = editableElement.tagName.toLowerCase() === "img";
			let currentContent = "";

			if (isImage) {
				currentContent = editableElement.getAttribute("src") || "";
			} else {
				currentContent = editableElement.textContent || "";
			}

			showPopup(editableElement, editId, currentContent, isImage);
		}
	} else {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
	}
}

function getParentOrigin() {
	if (
		window.location.ancestorOrigins &&
		window.location.ancestorOrigins.length > 0
	) {
		return window.location.ancestorOrigins[0];
	}

	if (document.referrer) {
		try {
			return new URL(document.referrer).origin;
		} catch (e) {
			console.warn("Invalid referrer URL:", document.referrer);
		}
	}

	return null;
}

async function handleEditSave(updatedText) {
	const newText = updatedText
		// Replacing characters that cause Babel parser to crash
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/{/g, "&#123;")
		.replace(/}/g, "&#125;");

	const { editId } = currentEditingInfo;

	try {
		const response = await fetch(PLUGIN_APPLY_EDIT_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				editId: editId,
				newFullText: newText,
			}),
		});

		const result = await response.json();
		if (result.success) {
			const parentOrigin = getParentOrigin();
			if (parentOrigin && ALLOWED_PARENT_ORIGINS.includes(parentOrigin)) {
				window.parent.postMessage(
					{
						type: "editApplied",
						payload: {
							editId: editId,
							fileContent: result.newFileContent,
							beforeCode: result.beforeCode,
							afterCode: result.afterCode,
						},
					},
					parentOrigin
				);
			} else {
				console.error("Unauthorized parent origin:", parentOrigin);
			}
		} else {
			console.error(
				`[vite][visual-editor] Error saving changes: ${result.error}`
			);
		}
	} catch (error) {
		console.error(
			`[vite][visual-editor] Error during fetch for ${editId}:`,
			error
		);
	}
}

function createDisabledTooltip() {
	if (disabledTooltipElement) return;

	disabledTooltipElement = document.createElement("div");
	disabledTooltipElement.id = "inline-editor-disabled-tooltip";
	document.body.appendChild(disabledTooltipElement);
}

function showDisabledTooltip(targetElement, isImage = false) {
	if (!disabledTooltipElement) createDisabledTooltip();

	disabledTooltipElement.textContent = isImage
		? translations.disabledTooltipTextImage
		: translations.disabledTooltipText;

	if (!disabledTooltipElement.isConnected) {
		document.body.appendChild(disabledTooltipElement);
	}
	disabledTooltipElement.classList.add("tooltip-active");

	const tooltipWidth = disabledTooltipElement.offsetWidth;
	const tooltipHeight = disabledTooltipElement.offsetHeight;
	const rect = targetElement.getBoundingClientRect();

	// Ensures that tooltip is not off the screen with 5px margin
	let newLeft = rect.left + window.scrollX + rect.width / 2 - tooltipWidth / 2;
	let newTop = rect.bottom + window.scrollY + 5;

	if (newLeft < window.scrollX) {
		newLeft = window.scrollX + 5;
	}
	if (newLeft + tooltipWidth > window.innerWidth + window.scrollX) {
		newLeft = window.innerWidth + window.scrollX - tooltipWidth - 5;
	}
	if (newTop + tooltipHeight > window.innerHeight + window.scrollY) {
		newTop = rect.top + window.scrollY - tooltipHeight - 5;
	}
	if (newTop < window.scrollY) {
		newTop = window.scrollY + 5;
	}

	disabledTooltipElement.style.left = `${newLeft}px`;
	disabledTooltipElement.style.top = `${newTop}px`;
}

function hideDisabledTooltip() {
	if (disabledTooltipElement) {
		disabledTooltipElement.classList.remove("tooltip-active");
	}
}

function handleDisabledElementHover(event) {
	const isImage = event.currentTarget.tagName.toLowerCase() === "img";

	showDisabledTooltip(event.currentTarget, isImage);
}

function handleDisabledElementLeave() {
	hideDisabledTooltip();
}

function handleDisabledGlobalHover(event) {
	const disabledElement = findDisabledElementAtPoint(event);
	if (disabledElement) {
		if (currentDisabledHoverElement !== disabledElement) {
			currentDisabledHoverElement = disabledElement;
			const isImage = disabledElement.tagName.toLowerCase() === "img";
			showDisabledTooltip(disabledElement, isImage);
		}
	} else {
		if (currentDisabledHoverElement) {
			currentDisabledHoverElement = null;
			hideDisabledTooltip();
		}
	}
}

function enableEditMode() {
	// Don't enable if selection mode is active
	if (document.getElementById("root")?.getAttribute("data-selection-mode-enabled") === "true") {
		console.warn("[EDIT MODE] Cannot enable edit mode while selection mode is active");
		return;
	}

	document
		.getElementById("root")
		?.setAttribute("data-edit-mode-enabled", "true");

	injectPopupStyles();

	if (!globalEventHandlers) {
		globalEventHandlers = {
			mousedown: handleGlobalEvent,
			pointerdown: handleGlobalEvent,
			click: handleGlobalEvent,
		};

		Object.entries(globalEventHandlers).forEach(([eventType, handler]) => {
			document.addEventListener(eventType, handler, true);
		});
	}

	document.addEventListener("mousemove", handleDisabledGlobalHover, true);

	document.querySelectorAll("[data-edit-disabled]").forEach((el) => {
		el.removeEventListener("mouseenter", handleDisabledElementHover);
		el.addEventListener("mouseenter", handleDisabledElementHover);
		el.removeEventListener("mouseleave", handleDisabledElementLeave);
		el.addEventListener("mouseleave", handleDisabledElementLeave);
	});
}

function disableEditMode() {
	document.getElementById("root")?.removeAttribute("data-edit-mode-enabled");

	hideDisabledTooltip();

	if (globalEventHandlers) {
		Object.entries(globalEventHandlers).forEach(([eventType, handler]) => {
			document.removeEventListener(eventType, handler, true);
		});
		globalEventHandlers = null;
	}

	document.removeEventListener("mousemove", handleDisabledGlobalHover, true);
	currentDisabledHoverElement = null;

	document.querySelectorAll("[data-edit-disabled]").forEach((el) => {
		el.removeEventListener("mouseenter", handleDisabledElementHover);
		el.removeEventListener("mouseleave", handleDisabledElementLeave);
	});
}

window.addEventListener("message", function (event) {
	if (event.data?.type === "edit-save") {
		handleEditSave(event.data?.payload?.newText);
	}
	if (event.data?.type === "enable-edit-mode") {
		if (event.data?.translations) {
			translations = { ...translations, ...event.data.translations };
		}

		enableEditMode();
	}
	if (event.data?.type === "disable-edit-mode") {
		disableEditMode();
	}
});
