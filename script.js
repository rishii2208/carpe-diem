const jsonInput = document.getElementById("jsonInput");
const reelsContainer = document.getElementById("reelsContainer");
const statusDisplay = document.getElementById("status");
const shuffleButton = document.getElementById("shuffleButton");
const oldestButton = document.getElementById("oldestButton");

let currentReels = [];

jsonInput.addEventListener("change", handleFileUpload);
shuffleButton.addEventListener("click", () => {
    if (!currentReels.length) {
        return;
    }

    renderReels(shuffle([...currentReels]));
    statusDisplay.textContent = `Shuffled ${currentReels.length} reels.`;
});

oldestButton.addEventListener("click", () => {
    if (!currentReels.length || oldestButton.disabled) {
        return;
    }

    const sorted = [...currentReels].sort((a, b) => {
        const aTimestamp = typeof a.timestamp === "number" ? a.timestamp : Number.POSITIVE_INFINITY;
        const bTimestamp = typeof b.timestamp === "number" ? b.timestamp : Number.POSITIVE_INFINITY;
        return aTimestamp - bTimestamp;
    });

    renderReels(sorted);
    statusDisplay.textContent = `Showing ${currentReels.length} reels from oldest to newest.`;
});

function handleFileUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
        return;
    }

    statusDisplay.textContent = `Loading ${file.name}…`;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
        try {
            const parsed = JSON.parse(loadEvent.target?.result ?? "[]");
            const normalized = normalizeRecords(parsed);

            if (!normalized.length) {
                statusDisplay.textContent = "No valid reel entries were found in the JSON.";
                shuffleButton.disabled = true;
                oldestButton.disabled = true;
                reelsContainer.replaceChildren();
                return;
            }

            currentReels = normalized;
            const hasTimestamp = currentReels.some((reel) => typeof reel.timestamp === "number");
            renderReels(shuffle([...currentReels]));
            statusDisplay.textContent = hasTimestamp
                ? `Loaded ${normalized.length} reels. Scroll to explore.`
                : `Loaded ${normalized.length} reels. Timestamps not detected, oldest sort disabled.`;
            shuffleButton.disabled = false;
            oldestButton.disabled = !hasTimestamp;
        } catch (error) {
            console.error(error);
            statusDisplay.textContent = `Unable to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}.`;
            shuffleButton.disabled = true;
            oldestButton.disabled = true;
            reelsContainer.replaceChildren();
        }
    };

    reader.onerror = () => {
        statusDisplay.textContent = "Failed to read the file. Please try again.";
        shuffleButton.disabled = true;
        oldestButton.disabled = true;
    };

    reader.readAsText(file);
}

function normalizeRecords(data) {
    const items = extractItems(data);
    return items
        .map((entry) => normalizeItem(entry))
        .filter((entry) => Boolean(entry));
}

function extractItems(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (!data || typeof data !== "object") {
        return [];
    }

    const collected = [];
    const candidateKeys = [
        "reels",
        "items",
        "data",
        "saved_saved_media",
        "saved_media",
        "saved_posts",
        "saved_saved_collections",
        "saved_collections",
        "nodes",
        "edges",
        "children"
    ];

    candidateKeys.forEach((key) => {
        if (Array.isArray(data[key])) {
            collected.push(...data[key]);
        }
    });

    if (collected.length > 0) {
        return collected;
    }

    Object.values(data).forEach((value) => {
        if (Array.isArray(value)) {
            collected.push(...value);
        }
    });

    return collected;
}

function normalizeItem(item) {
    if (typeof item === "string") {
        return { url: item, description: "", timestamp: null };
    }

    if (!item || typeof item !== "object") {
        return null;
    }

    const url = findUrl(item);
    if (!url) {
        return null;
    }

    const description = findDescription(item);
    const timestamp = findTimestamp(item);
    return { url, description, timestamp };
}

function findUrl(source) {
    return findStringByPropName(source, ["url", "href", "permalink", "permalink_url", "link", "share_url"]);
}

function findDescription(source) {
    const notUrl = (value) => !isLikelyUrl(value);
    const prioritySets = [
        ["description", "caption", "text", "desc"],
        ["title", "name"],
        ["value"]
    ];

    for (const keys of prioritySets) {
        const result = findStringByPropName(source, keys, notUrl);
        if (result) {
            return result;
        }
    }

    return "";
}

function findTimestamp(source) {
    const value = findNumberByPropName(source, ["timestamp", "saved_at", "taken_at", "created_at", "added_time", "time"]);
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    return null;
}

function findStringByPropName(source, propNames, predicate = () => true) {
    if (!source || typeof source !== "object") {
        return null;
    }

    const targets = new Set(propNames.map((name) => name.toLowerCase()));
    const queue = [source];

    while (queue.length > 0) {
        const current = queue.shift();

        if (!current) {
            continue;
        }

        if (Array.isArray(current)) {
            current.forEach((entry) => {
                if (entry && typeof entry === "object") {
                    queue.push(entry);
                }
            });
            continue;
        }

        if (typeof current !== "object") {
            continue;
        }

        for (const [key, value] of Object.entries(current)) {
            const lowerKey = key.toLowerCase();
            if (targets.has(lowerKey) && typeof value === "string") {
                const trimmed = value.trim();
                if (trimmed && predicate(trimmed)) {
                    return trimmed;
                }
            }

            if (value && typeof value === "object") {
                queue.push(value);
            }
        }
    }

    return null;
}

function isLikelyUrl(value) {
    return /^https?:\/\//i.test(value) || /^www\./i.test(value);
}

function findNumberByPropName(source, propNames) {
    if (!source || typeof source !== "object") {
        return null;
    }

    const targets = new Set(propNames.map((name) => name.toLowerCase()));
    const queue = [source];

    while (queue.length > 0) {
        const current = queue.shift();

        if (!current) {
            continue;
        }

        if (Array.isArray(current)) {
            current.forEach((entry) => {
                if (entry && typeof entry === "object") {
                    queue.push(entry);
                }
            });
            continue;
        }

        if (typeof current !== "object") {
            continue;
        }

        for (const [key, value] of Object.entries(current)) {
            const lowerKey = key.toLowerCase();
            if (targets.has(lowerKey)) {
                const numeric = typeof value === "number" ? value : Number(value);
                if (Number.isFinite(numeric)) {
                    return numeric;
                }
            }

            if (value && typeof value === "object") {
                queue.push(value);
            }
        }
    }

    return null;
}

function renderReels(reels) {
    reelsContainer.replaceChildren();

    reels.forEach((reel, index) => {
        const embedUrl = buildInstagramEmbedUrl(reel.url);

        const article = document.createElement("article");
        article.className = "reel-card";

        if (embedUrl) {
            const wrapper = document.createElement("div");
            wrapper.className = "embed-wrapper";

            const iframe = document.createElement("iframe");
            iframe.className = "embed-frame";
            iframe.src = embedUrl;
            iframe.title = `Instagram reel ${index + 1}`;
            iframe.loading = "lazy";
            iframe.allow = "autoplay; clipboard-write; encrypted-media; picture-in-picture";
            iframe.setAttribute("allowfullscreen", "true");

            wrapper.appendChild(iframe);
            article.appendChild(wrapper);
        } else {
            const placeholder = document.createElement("div");
            placeholder.className = "placeholder";
            const message = document.createElement("span");
            message.textContent = "Unable to build an embed for ";

            const anchor = document.createElement("a");
            anchor.href = reel.url;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.textContent = reel.url;

            placeholder.append(message, anchor, document.createTextNode("."));
            article.appendChild(placeholder);
        }

        if (reel.description) {
            const description = document.createElement("p");
            description.className = "description";
            description.textContent = reel.description;
            article.appendChild(description);
        }

        if (!article.children.length) {
            // Fallback in case neither embed nor description was appended.
            const emptyNotice = document.createElement("div");
            emptyNotice.className = "placeholder";
            emptyNotice.textContent = "This reel entry is missing usable data.";
            article.appendChild(emptyNotice);
        }

        reelsContainer.appendChild(article);
    });
}

function buildInstagramEmbedUrl(rawUrl) {
    if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
        return null;
    }

    const preparedUrl = rawUrl.match(/^https?:\/\//i) ? rawUrl : `https://${rawUrl}`;

    try {
        const url = new URL(preparedUrl);
        if (!url.hostname.includes("instagram.com")) {
            return null;
        }

        const pattern = /\/(reel|p)\/([^/?#]+)/i;
        const match = url.pathname.match(pattern);
        if (!match) {
            return null;
        }

        const type = match[1].toLowerCase();
        const shortcode = match[2];
        return `https://www.instagram.com/${type}/${shortcode}/embed`;
    } catch (error) {
        console.warn("Could not parse URL", rawUrl, error);
        return null;
    }
}

function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
