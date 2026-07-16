type BrowserStorageName = "localStorage" | "sessionStorage";

function getStorage(name: BrowserStorageName): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window[name];
	} catch {
		return null;
	}
}

export function getStoredItem(name: BrowserStorageName, key: string) {
	try {
		return getStorage(name)?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

export function setStoredItem(
	name: BrowserStorageName,
	key: string,
	value: string,
) {
	try {
		getStorage(name)?.setItem(key, value);
	} catch {
		// Storage is optional; the in-memory UI state remains authoritative.
	}
}

export function removeStoredItem(name: BrowserStorageName, key: string) {
	try {
		getStorage(name)?.removeItem(key);
	} catch {
		// Storage is optional; absence already matches the requested result.
	}
}
