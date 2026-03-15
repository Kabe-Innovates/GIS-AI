const DEFAULT_WFS_ENDPOINT = '/geoserver/wfs';
const CONTEXT_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

const LAYERS = [
    { typeName: 'geonex:accidents_tn', label: 'Accidents', keywords: ['accident', 'hotspot', 'injury', 'fatal'] },
    { typeName: 'geonex:tamil__nadu_districts', label: 'Districts', keywords: ['district'] },
    { typeName: 'geonex:tamilnadu_subdistricts', label: 'Sub-districts', keywords: ['sub district', 'sub-district', 'taluk'] },
    { typeName: 'geonex:tamil__nadu__villages', label: 'Villages', keywords: ['village'] },
    { typeName: 'geonex:tamil__nadu_assembly', label: 'Assembly Constituencies', keywords: ['assembly', 'constituency'] },
    { typeName: 'geonex:tamil__nadu_parliament', label: 'Parliament Constituencies', keywords: ['parliament', 'lok sabha'] },
    { typeName: 'geonex:tamil__nadu_state', label: 'State Boundary', keywords: ['state', 'boundary'] },
    { typeName: 'geonex:tamil__nadu__district__hq', label: 'District Headquarters', keywords: ['district hq', 'headquarter'] },
    { typeName: 'geonex:tamil__nadu__sub__district__hq', label: 'Sub-district Headquarters', keywords: ['sub district hq', 'sub-district hq'] },
    { typeName: 'geonex:tamil__nadu_villages', label: 'Villages (Alt Layer)', keywords: ['village'] },
];

let cachedLayerSummary = null;
let cacheTimestamp = 0;

function normalizeQuestion(question = '') {
    return `${question}`.toLowerCase();
}

function withTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error('GeoServer context request timed out.')), timeoutMs);
        }),
    ]);
}

async function fetchLayerFeatureCount(typeName, endpoint = DEFAULT_WFS_ENDPOINT) {
    const params = new URLSearchParams({
        service: 'WFS',
        version: '1.0.0',
        request: 'GetFeature',
        typeName,
        outputFormat: 'application/json',
        maxFeatures: '1',
    });

    const response = await withTimeout(fetch(`${endpoint}?${params.toString()}`), REQUEST_TIMEOUT_MS);
    if (!response.ok) {
        throw new Error(`GeoServer WFS request failed for ${typeName} (${response.status})`);
    }

    const payload = await response.json();
    const total = payload.totalFeatures;

    if (typeof total === 'number' && Number.isFinite(total)) {
        return total;
    }

    if (typeof total === 'string' && total !== 'unknown') {
        const parsed = Number(total);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    if (Array.isArray(payload.features)) {
        return payload.features.length;
    }

    return null;
}

function pickRelevantLayers(question) {
    const q = normalizeQuestion(question);
    const selected = [];

    for (const layer of LAYERS) {
        if (layer.keywords.some((keyword) => q.includes(keyword))) {
            selected.push(layer);
        }
    }

    if (selected.length > 0) {
        return selected.slice(0, 4);
    }

    // Default compact context for general questions.
    return LAYERS.filter((layer) => (
        layer.typeName === 'geonex:accidents_tn' ||
        layer.typeName === 'geonex:tamil__nadu_districts' ||
        layer.typeName === 'geonex:tamil__nadu_state'
    ));
}

async function buildLayerSummary(layers, endpoint) {
    const results = await Promise.all(
        layers.map(async (layer) => {
            try {
                const count = await fetchLayerFeatureCount(layer.typeName, endpoint);
                return {
                    ...layer,
                    count,
                    available: true,
                };
            } catch {
                return {
                    ...layer,
                    count: null,
                    available: false,
                };
            }
        })
    );

    return results;
}

function shouldUseCache(question) {
    const q = normalizeQuestion(question);
    return q.length === 0 || q.includes('overview') || q.includes('summary');
}

export async function getGeoserverContext(question = '', endpoint = DEFAULT_WFS_ENDPOINT) {
    const now = Date.now();
    const useCache = shouldUseCache(question);

    if (useCache && cachedLayerSummary && (now - cacheTimestamp) < CONTEXT_TTL_MS) {
        return cachedLayerSummary;
    }

    const layers = pickRelevantLayers(question);
    const summary = await buildLayerSummary(layers, endpoint);

    const contextText = summary
        .map((layer) => {
            if (!layer.available) {
                return `- ${layer.label} (${layer.typeName}): unavailable`;
            }

            const countText = layer.count === null ? 'count unavailable' : `${layer.count} features`;
            return `- ${layer.label} (${layer.typeName}): ${countText}`;
        })
        .join('\n');

    const result = {
        source: 'geoserver',
        layers: summary,
        text: contextText,
    };

    if (useCache) {
        cachedLayerSummary = result;
        cacheTimestamp = now;
    }

    return result;
}

export async function prewarmGeoserverContext(endpoint = DEFAULT_WFS_ENDPOINT) {
    try {
        await getGeoserverContext('summary', endpoint);
    } catch {
        // Best-effort prewarm only.
    }
}

export function clearGeoserverContextCache() {
    cachedLayerSummary = null;
    cacheTimestamp = 0;
}
