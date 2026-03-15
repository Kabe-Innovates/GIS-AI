import { getAccidents, summarize } from '../data/accidents.js';

let chatSession = null;
let activeModelName = null;
let activeEndpoint = '/api';
let modelFallbackQueue = [];
let conversationHistory = [];

const MODEL_CANDIDATES = ['qwen2.5:3b', 'phi3:mini'];
const DEFAULT_MODEL = MODEL_CANDIDATES[0];
const REQUEST_TIMEOUT_MS = 45000;
const INIT_TIMEOUT_MS = 10000;
const MAX_HISTORY_MESSAGES = 6;

const SYSTEM_PROMPT = `You are GeoNex AI, an expert assistant for analyzing road accident data in Tamil Nadu, India.

You have access to a dataset of 501 road accident records. Each record has these fields:
- acc_id: Unique accident identifier (e.g., TNACC0001)
- acc_date: Date of accident (YYYY-MM-DD)
- acc_time: Time of accident (HH:MM)
- district: District name (e.g., Chennai, Madurai, Coimbatore)
- severity: Minor, Major, or Fatal
- vehicles: Vehicle type (Car, Truck, Bus, Auto, Two Wheeler, Van, Bicycle)
- roadtype: Road type (City Road, National Hwy, State Hwy, Bypass, Junction, Village Road)
- weather: Weather condition (Clear, Cloudy, Rain, Fog)
- lightcond: Light condition (Daylight, Night-Lit, Night-Unlit, Dawn/Dusk)
- fatals: Number of fatalities (integer)
- injuries: Number of injuries (integer)
- cause: Accident cause (Overspeeding, Drunk Driving, Distracted Driving, Brake Failure, Wrong Turn, Poor Visibility, Road Damage, Lane Change, Animal Crossing, Pedestrian Crossing)
- lon: Longitude
- lat: Latitude

When the user asks a question, you MUST analyze the provided data summary and answer accurately.

IMPORTANT: You must ALWAYS respond with valid JSON in this exact format:
{
  "text": "Your response text here with analysis and insights. Use markdown formatting for readability.",
  "mapAction": null or { "type": "heatmap|density|thematic|filter|reset", "params": {} }
}

Map action types:
- "heatmap": Generate a heatmap overlay. params: {} (no params needed) or { "data": "filtered subset description" }
- "density": Generate density/cluster map. params: { "field": "district" } (the field to group by)
- "thematic": Color-code markers by a field. params: { "field": "severity|cause|vehicles" }
- "filter": Filter markers to show subset. params: { "district": "Chennai", "severity": "Fatal", "cause": "Overspeeding", etc. } (any combination of fields)
- "reset": Reset map to default view. params: {}

When to generate map actions:
- If user asks for heatmap, density map, or visual: include appropriate mapAction
- If user asks about a specific district or subset: include filter mapAction
- If user asks to show by a category: include thematic mapAction
- If user says reset/clear/show all: include reset mapAction
- For pure analytical questions: set mapAction to null

Keep responses concise, insightful, and data-driven. Mention specific numbers when relevant.
ALWAYS respond with valid JSON only. No text outside the JSON.`;

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
        response = await fetchWithTimeout(`${endpoint}/tags`, {
            method: 'GET',
        }, INIT_TIMEOUT_MS);
    } catch (err) {
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
        `⚠️ **${intro}**`,
        '',
        `Using local dataset summary instead (${summary.totalAccidents} accidents):`,
        topDistrict ? `- Top district by accidents: **${topDistrict[0]}** (${topDistrict[1]})` : '- Top district by accidents: unavailable',
        topCause ? `- Top cause: **${topCause[0]}** (${topCause[1]})` : '- Top cause: unavailable',
        topSeverity ? `- Most common severity: **${topSeverity[0]}** (${topSeverity[1]})` : '- Most common severity: unavailable',
        '',
        mapAction
            ? `I inferred a local map action: **${mapAction.type}**.`
            : 'Try map commands like "show heatmap", "density map", or "reset map" while quota is limited.',
    ].join('\n');

    return { text, mapAction };
}

function parseAIResponse(responseText) {
    try {
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
        const cleanJson = jsonMatch[1].trim();
        return JSON.parse(cleanJson);
    } catch {
        return {
            text: responseText,
            mapAction: null,
        };
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
    chatSession = { ready: true };

    return { model: activeModelName, endpoint: activeEndpoint };
}

export async function askQuestion(question) {
    if (!chatSession) {
        throw new Error('AI not initialized. Start local AI from the modal.');
    }

    // For data-intensive questions, include relevant raw data
    const accidents = getAccidents();
    const summary = summarize();

    // Build context based on question
    let context = '';
    const q = question.toLowerCase();

    // If asking about specific district, include those records
    const districts = summary.districts;
    const mentionedDistrict = districts.find((d) => q.includes(d.toLowerCase()));
    if (mentionedDistrict) {
        const districtData = accidents.filter((a) => a.district === mentionedDistrict);
        context = `\n\nRelevant data for ${mentionedDistrict} (${districtData.length} records):\n${JSON.stringify(districtData.slice(0, 50), null, 2)}`;
    }

    // If asking about fatal accidents
    if (q.includes('fatal')) {
        const fatalData = accidents.filter((a) => a.severity === 'Fatal');
        context += `\n\nFatal accidents (${fatalData.length} records):\n${JSON.stringify(fatalData, null, 2)}`;
    }

    // Always include latest summary
    const prompt = `User question: "${question}"\n\nCurrent data summary: ${JSON.stringify(summary)}\n${context}\n\nRespond with valid JSON only.`;

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
                    temperature: 0.2,
                },
            }),
        });

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
