import { getAccidents, summarize } from '../data/accidents.js';
import { getGeoserverContext, prewarmGeoserverContext } from './geoserverContext.js';

let chatSession = null;
let activeModelName = null;
let activeEndpoint = '/api';
let modelFallbackQueue = [];
let conversationHistory = [];
const questionCache = new Map();

const MODEL_CANDIDATES = ['qwen2.5:3b', 'phi3:mini'];
const DEFAULT_MODEL = MODEL_CANDIDATES[0];
const REQUEST_TIMEOUT_MS = 35000;
const HEAVY_REQUEST_TIMEOUT_MS = 50000;
const INIT_TIMEOUT_MS = 10000;
const GEO_CONTEXT_TIMEOUT_MS = 1200;
const MAX_HISTORY_MESSAGES = 4;
const MAX_DETAIL_ROWS = 12;
const CACHE_TTL_MS = 2 * 60 * 1000;
const GEOSERVER_WFS_ENDPOINT = '/geoserver/wfs';

const SYSTEM_PROMPT = `You are GeoNex AI, a GIS assistant for Tamil Nadu map.

Rules:
1. Answer only the user's direct question. Do not add greetings unless the user greets first.
2. Use only the provided evidence context and available layer context.
3. Always be goal-oriented: explain what is happening, what to do next, and which map/layer view is most useful.
4. Keep responses concise: 3-6 bullets or short paragraphs.
5. Include concrete counts when available.
6. Never discuss MVP scope, implementation internals, or training/data-collection limitations.
7. If evidence is partial, still provide practical recommendations and clearly mark them as recommendations.
8. Always return valid JSON only in this schema:
{
    "text": "plain-language insight",
    "mapAction": null or { "type": "heatmap|density|thematic|filter|reset", "params": {} }
}

Response style:
- Prioritize decision support over generic commentary.
- Reference relevant Tamil Nadu layers when useful (for example: districts, sub-districts, villages, assembly, parliament, state boundary, headquarters, accidents).
- Suggest next analysis steps that can be done on the map.
- If questions arised is irrelevent from the layers mentioned above, Tell them to add more layers to geoserver and ask again.

Map action guidance:
- heatmap for hotspots
- density for distribution by district
- thematic for category-based coloring (severity/cause/vehicles)
- filter for narrowed subsets
- reset to clear map state
`;

function normalizeEndpoint(endpoint = '') {
    const clean = `${endpoint || ''}`.trim();
    if (!clean) return '/api';
    return clean.replace(/\/+$/, '');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

function withTimeout(promise, timeoutMs, fallbackValue = null) {
    return Promise.race([
        promise,
        new Promise((resolve) => {
            setTimeout(() => resolve(fallbackValue), timeoutMs);
        }),
    ]);
}

function buildModelOrder(preferredModel = null) {
    const seen = new Set();
    const ordered = [];

    if (preferredModel && typeof preferredModel === 'string') {
        const cleanPreferred = preferredModel.trim();
        if (cleanPreferred) {
            seen.add(cleanPreferred);
            ordered.push(cleanPreferred);
        }
    }

    for (const candidate of MODEL_CANDIDATES) {
        if (!seen.has(candidate)) {
            seen.add(candidate);
            ordered.push(candidate);
        }
    }

    return ordered.length > 0 ? ordered : [DEFAULT_MODEL];
}

async function fetchAvailableModels(endpoint) {
    let response;

    try {
        response = await fetchWithTimeout(`${endpoint}/tags`, { method: 'GET' }, INIT_TIMEOUT_MS);
    } catch {
        throw new Error('Unable to reach Ollama. Start it with "ollama serve" and retry.');
    }

    if (!response.ok) {
        throw new Error(`Unable to reach Ollama tags endpoint (${response.status}).`);
    }

    const data = await response.json();
    return (data.models || []).map((m) => m.name).filter(Boolean);
}

function switchToNextAvailableModel() {
    while (modelFallbackQueue.length > 0) {
        const nextModel = modelFallbackQueue.shift();
        activeModelName = nextModel;
        conversationHistory = [];
        return true;
    }

    return false;
}

function isRecoverableModelError(err) {
    const message = `${err?.message || err || ''}`.toLowerCase();
    return (
        (message.includes('model') && message.includes('not found')) ||
        (message.includes('model') && message.includes('does not exist')) ||
        message.includes('unknown model')
    );
}

function isEndpointUnavailableError(err) {
    const message = `${err?.message || err || ''}`.toLowerCase();
    return (
        message.includes('unable to reach ollama') ||
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('connection refused') ||
        message.includes('aborted')
    );
}

function getTopEntry(counter = {}) {
    return Object.entries(counter).sort((a, b) => b[1] - a[1])[0] || null;
}

function getTopEntries(counter = {}, limit = 5) {
    return Object.entries(counter)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, count]) => ({ name, count }));
}

function inferLocalMapAction(question, summary) {
    const q = question.toLowerCase();

    if (q.includes('reset') || q.includes('clear') || q.includes('show all')) {
        return { type: 'reset', params: {} };
    }

    if (q.includes('heatmap') || q.includes('hotspot')) {
        return { type: 'heatmap', params: {} };
    }

    if (q.includes('density') || q.includes('cluster')) {
        return { type: 'density', params: { field: 'district' } };
    }

    if (q.includes('by severity') || q.includes('severity wise')) {
        return { type: 'thematic', params: { field: 'severity' } };
    }

    if (q.includes('by cause') || q.includes('cause wise')) {
        return { type: 'thematic', params: { field: 'cause' } };
    }

    if (q.includes('by vehicle') || q.includes('vehicle type')) {
        return { type: 'thematic', params: { field: 'vehicles' } };
    }

    const filterParams = {};

    const mentionedDistrict = summary.districts.find((d) => q.includes(d.toLowerCase()));
    if (mentionedDistrict) {
        filterParams.district = mentionedDistrict;
    }

    if (q.includes('fatal')) filterParams.severity = 'Fatal';
    else if (q.includes('major')) filterParams.severity = 'Major';
    else if (q.includes('minor')) filterParams.severity = 'Minor';

    const mentionedCause = summary.causes.find((cause) => q.includes(cause.toLowerCase()));
    if (mentionedCause) {
        filterParams.cause = mentionedCause;
    }

    if (Object.keys(filterParams).length > 0) {
        return { type: 'filter', params: filterParams };
    }

    return null;
}

function buildLocalFallbackResponse(question, summary, reason = null) {
    const topDistrict = getTopEntry(summary.byDistrict);
    const topCause = getTopEntry(summary.byCause);
    const topSeverity = getTopEntry(summary.bySeverity);
    const mapAction = inferLocalMapAction(question, summary);

    const intro = reason ||
        `Local model response is unavailable right now${activeModelName ? ` (${activeModelName})` : ''}.`;

    const text = [
        `**${intro}**`,
        '',
        `Using local summary context (${summary.totalAccidents} accidents):`,
        topDistrict ? `- Top district: ${topDistrict[0]} (${topDistrict[1]})` : '- Top district: unavailable',
        topCause ? `- Top cause: ${topCause[0]} (${topCause[1]})` : '- Top cause: unavailable',
        topSeverity ? `- Most common severity: ${topSeverity[0]} (${topSeverity[1]})` : '- Most common severity: unavailable',
        '',
        mapAction
            ? `Inferred map action: ${mapAction.type}.`
            : 'Tip: ask for heatmap, density map, thematic view, or filtered subsets.',
    ].join('\n');

    return { text, mapAction };
}

function normalizeAIResponse(response) {
    if (!response || typeof response !== 'object') {
        return { text: `${response || ''}`.trim() || 'No response content.', mapAction: null };
    }

    const text = typeof response.text === 'string' ? response.text.trim() : '';
    const mapAction = response.mapAction && typeof response.mapAction === 'object'
        ? response.mapAction
        : null;

    return {
        text: text || 'No insight generated for this question.',
        mapAction,
    };
}

function parseAIResponse(responseText) {
    try {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        const cleanJson = jsonMatch[1].trim();
        return normalizeAIResponse(JSON.parse(cleanJson));
    } catch {
        return normalizeAIResponse({
            text: responseText,
            mapAction: null,
        });
    }
}

function pushConversationHistory(userPrompt, modelReply) {
    conversationHistory.push({ role: 'user', content: userPrompt });
    conversationHistory.push({ role: 'assistant', content: modelReply });

    const maxEntries = MAX_HISTORY_MESSAGES * 2;
    if (conversationHistory.length > maxEntries) {
        conversationHistory = conversationHistory.slice(-maxEntries);
    }
}

function buildMessages(prompt) {
    return [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory,
        { role: 'user', content: prompt },
    ];
}

function shouldIncludeDetailedRows(question) {
    const q = question.toLowerCase();
    return (
        q.includes('show') ||
        q.includes('list') ||
        q.includes('detail') ||
        q.includes('table') ||
        q.includes('sample records')
    );
}

function buildCompactSummary(summary) {
    return {
        totalAccidents: summary.totalAccidents,
        totalFatalities: summary.totalFatalities,
        totalInjuries: summary.totalInjuries,
        topDistricts: getTopEntries(summary.byDistrict, 5),
        topCauses: getTopEntries(summary.byCause, 5),
        severityCounts: summary.bySeverity,
        topVehicleTypes: getTopEntries(summary.byVehicle, 4),
    };
}

function buildDetailedContext(question, summary, accidents) {
    if (!shouldIncludeDetailedRows(question)) {
        return '';
    }

    const q = question.toLowerCase();
    const detailSections = [];

    const mentionedDistrict = summary.districts.find((d) => q.includes(d.toLowerCase()));
    if (mentionedDistrict) {
        const districtRows = accidents
            .filter((a) => a.district === mentionedDistrict)
            .slice(0, MAX_DETAIL_ROWS)
            .map((a) => ({
                acc_id: a.acc_id,
                district: a.district,
                severity: a.severity,
                cause: a.cause,
                fatals: a.fatals,
                injuries: a.injuries,
                roadtype: a.roadtype,
            }));

        detailSections.push(
            `District detail sample (${mentionedDistrict}, ${districtRows.length} rows): ${JSON.stringify(districtRows)}`
        );
    }

    if (q.includes('fatal')) {
        const fatalRows = accidents
            .filter((a) => a.severity === 'Fatal')
            .slice(0, MAX_DETAIL_ROWS)
            .map((a) => ({
                acc_id: a.acc_id,
                district: a.district,
                cause: a.cause,
                fatals: a.fatals,
                injuries: a.injuries,
                acc_date: a.acc_date,
            }));

        detailSections.push(`Fatal detail sample (${fatalRows.length} rows): ${JSON.stringify(fatalRows)}`);
    }

    return detailSections.length > 0 ? detailSections.join('\n') : '';
}

function normalizeQuestionForCache(question, modelName) {
    return `${modelName || ''}::${question}`.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCachedResponse(cacheKey) {
    const cached = questionCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() - cached.ts > CACHE_TTL_MS) {
        questionCache.delete(cacheKey);
        return null;
    }

    return cached.value;
}

function setCachedResponse(cacheKey, value) {
    questionCache.set(cacheKey, {
        ts: Date.now(),
        value,
    });
}

async function getGeoserverContextSafe(question) {
    const context = await withTimeout(
        getGeoserverContext(question, GEOSERVER_WFS_ENDPOINT),
        GEO_CONTEXT_TIMEOUT_MS,
        null
    );

    return context?.text || '';
}

export async function initAI(preferredModel = null, endpoint = '') {
    activeEndpoint = normalizeEndpoint(endpoint);

    const modelOrder = buildModelOrder(preferredModel);
    const availableModels = await fetchAvailableModels(activeEndpoint);
    const availableSet = new Set(availableModels);

    const selectedModel = modelOrder.find((modelName) => availableSet.has(modelName));
    if (!selectedModel) {
        chatSession = null;
        activeModelName = null;
        modelFallbackQueue = [];
        conversationHistory = [];

        if (availableModels.length === 0) {
            throw new Error(
                'Ollama is running but no models were found. Run: ollama pull qwen2.5:3b and ollama pull phi3:mini'
            );
        }

        throw new Error(
            `Requested local models are not available. Found: ${availableModels.slice(0, 10).join(', ')}`
        );
    }

    activeModelName = selectedModel;
    modelFallbackQueue = modelOrder.filter((name) => name !== selectedModel && availableSet.has(name));
    conversationHistory = [];
    questionCache.clear();
    chatSession = { ready: true };
    void prewarmGeoserverContext(GEOSERVER_WFS_ENDPOINT);

    return { model: activeModelName, endpoint: activeEndpoint };
}

export async function askQuestion(question) {
    if (!chatSession) {
        throw new Error('AI not initialized. Start local AI from the modal.');
    }

    const cacheKey = normalizeQuestionForCache(question, activeModelName);
    const cached = getCachedResponse(cacheKey);
    if (cached) {
        return cached;
    }

    const accidents = getAccidents();
    const summary = summarize();

    const compactSummary = buildCompactSummary(summary);
    const geoserverContextText = await getGeoserverContextSafe(question);
    const detailedContext = buildDetailedContext(question, summary, accidents);

    const promptParts = [
        `User question: "${question}"`,
        `Compact accident summary: ${JSON.stringify(compactSummary)}`,
    ];

    if (geoserverContextText) {
        promptParts.push(`GeoServer layer context:\n${geoserverContextText}`);
    }

    if (detailedContext) {
        promptParts.push(detailedContext);
    }

    promptParts.push('Respond with valid JSON only.');
    const prompt = promptParts.join('\n\n');

    const timeoutMs = detailedContext ? HEAVY_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS;

    try {
        const response = await fetchWithTimeout(`${activeEndpoint}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: activeModelName,
                messages: buildMessages(prompt),
                stream: false,
                options: {
                    temperature: 0.1,
                },
            }),
        }, timeoutMs);

        if (!response.ok) {
            const errorPayload = await response.text();
            throw new Error(`Ollama request failed (${response.status}): ${errorPayload}`);
        }

        const data = await response.json();
        const responseText = data?.message?.content?.trim();

        if (!responseText) {
            throw new Error('Ollama returned an empty response.');
        }

        const parsed = parseAIResponse(responseText);
        pushConversationHistory(prompt, responseText);
        setCachedResponse(cacheKey, parsed);

        return parsed;
    } catch (err) {
        if (isRecoverableModelError(err)) {
            if (switchToNextAvailableModel()) {
                return askQuestion(question);
            }
        }

        if (isEndpointUnavailableError(err)) {
            return buildLocalFallbackResponse(
                question,
                summary,
                'Ollama endpoint is unavailable. Start "ollama serve" and try again.'
            );
        }

        console.error('OLLAMA_ERROR:', err);
        return buildLocalFallbackResponse(
            question,
            summary,
            `Local model request failed${activeModelName ? ` (${activeModelName})` : ''}.`
        );
    }
}

export function isInitialized() {
    return !!chatSession;
}

export function getActiveModel() {
    return activeModelName;
}

export function getActiveEndpoint() {
    return activeEndpoint;
}

export function getSupportedModels() {
    return [...MODEL_CANDIDATES];
}
