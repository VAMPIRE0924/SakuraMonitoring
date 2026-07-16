const INJECTION_MARK = "data-injected";
const RESOURCE_LOAD_TIMEOUT_MS = 10_000;

type InjectionResult = {
	errors: Error[];
};

type InjectionOptions = {
	beforeInject?: () => void;
};

let injectedTextNodes: Text[] = [];
let injectionQueue: Promise<void> = Promise.resolve();

function copyAttributes(source: Element, target: Element) {
	for (const attribute of source.attributes) {
		target.setAttribute(attribute.name, attribute.value);
	}
	target.setAttribute(INJECTION_MARK, "true");
}

function cleanInjectedResources() {
	document.querySelectorAll(`[${INJECTION_MARK}]`).forEach((node) => {
		node.remove();
	});
	for (const node of injectedTextNodes) node.remove();
	injectedTextNodes = [];
}

function appendExternalResource(
	element: HTMLScriptElement | HTMLLinkElement,
	resourceUrl: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			window.clearTimeout(timeout);
			element.removeEventListener("load", handleLoad);
			element.removeEventListener("error", handleError);
		};
		const handleLoad = () => {
			cleanup();
			resolve();
		};
		const handleError = () => {
			cleanup();
			reject(new Error(`Failed to load resource: ${resourceUrl}`));
		};
		const timeout = window.setTimeout(() => {
			cleanup();
			element.remove();
			reject(new Error(`Timed out loading resource: ${resourceUrl}`));
		}, RESOURCE_LOAD_TIMEOUT_MS);

		element.addEventListener("load", handleLoad, { once: true });
		element.addEventListener("error", handleError, { once: true });
		document.head.appendChild(element);
	});
}

async function injectElement(source: Element) {
	switch (source.tagName) {
		case "SCRIPT": {
			const original = source as HTMLScriptElement;
			const script = document.createElement("script");
			copyAttributes(original, script);
			script.async = false;
			if (original.src) {
				await appendExternalResource(script, original.src);
			} else {
				script.textContent = original.textContent;
				document.body.appendChild(script);
			}
			return;
		}
		case "STYLE": {
			const style = document.createElement("style");
			copyAttributes(source, style);
			style.textContent = source.textContent;
			document.head.appendChild(style);
			return;
		}
		case "LINK": {
			const link = document.createElement("link");
			copyAttributes(source, link);
			if (link.rel.toLowerCase() === "stylesheet" && link.href) {
				await appendExternalResource(link, link.href);
			} else {
				document.head.appendChild(link);
			}
			return;
		}
		case "META": {
			const meta = document.createElement("meta");
			copyAttributes(source, meta);
			document.head.appendChild(meta);
			return;
		}
		default: {
			const element = source.cloneNode(true) as Element;
			element.setAttribute(INJECTION_MARK, "true");
			document.body.appendChild(element);
		}
	}
}

async function injectContent(
	content: string,
	options?: InjectionOptions,
): Promise<InjectionResult> {
	const template = document.createElement("template");
	template.innerHTML = content;
	cleanInjectedResources();
	options?.beforeInject?.();

	const errors: Error[] = [];
	for (const node of Array.from(template.content.childNodes)) {
		try {
			if (node instanceof Element) {
				await injectElement(node);
			} else if (node instanceof Text && node.data.trim()) {
				const text = document.createTextNode(node.data);
				injectedTextNodes.push(text);
				document.body.appendChild(text);
			}
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
	}

	return { errors };
}

export function InjectContext(
	content: string,
	options?: InjectionOptions,
): Promise<InjectionResult> {
	const injection = injectionQueue.then(() => injectContent(content, options));
	injectionQueue = injection.then(
		() => undefined,
		() => undefined,
	);
	return injection;
}
