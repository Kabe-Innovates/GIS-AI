import './styles/index.css';
import { setAccidents, parseFullCSV, summarize } from './data/accidents.js';
import { initMap, showAllMarkers } from './map/map.js';
import { initAI, getActiveModel, getActiveEndpoint, getSupportedModels } from './ai/engine.js';
import { initSidebar } from './ui/sidebar.js';

// CSV data embedded inline (501 records)
const CSV_URL = '/data/tn_accidents_500.csv';
const MODEL_STORAGE = 'geonex_model';
const OLLAMA_ENDPOINT_STORAGE = 'geonex_ollama_endpoint';

function updateModelStatus(state = 'idle') {
    const statusEl = document.getElementById('ai-model-status');
    if (!statusEl) return;

    const activeModel = getActiveModel();
    const activeEndpoint = getActiveEndpoint();

    if (!activeModel) {
        statusEl.textContent = `Model: not initialized (${state})`;
        return;
    }

    statusEl.textContent = `Model: ${activeModel} @ ${activeEndpoint}`;
}

function populateModelSelect(modelSelect) {
    const models = getSupportedModels();
    modelSelect.innerHTML = '';

    for (const modelName of models) {
        const option = document.createElement('option');
        option.value = modelName;
        option.textContent = modelName;
        modelSelect.appendChild(option);
    }
}

async function loadAccidentData() {
    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error(`Failed to load CSV: ${response.status}`);
        const csvText = await response.text();
        const data = parseFullCSV(csvText);
        setAccidents(data);
        return data;
    } catch (err) {
        console.error('Failed to load accident data:', err);
        throw err;
    }
}

function setupLocalAIModal() {
    const modal = document.getElementById('api-key-modal');
    const endpointInput = document.getElementById('ollama-endpoint-input');
    const modelSelect = document.getElementById('api-model-select');
    const submitBtn = document.getElementById('api-key-submit');
    populateModelSelect(modelSelect);

    const storedModel = localStorage.getItem(MODEL_STORAGE);
    if (storedModel) {
        modelSelect.value = storedModel;
    }

    const storedEndpoint = localStorage.getItem(OLLAMA_ENDPOINT_STORAGE);
    if (storedEndpoint) {
        endpointInput.value = storedEndpoint;
    }

    const tryInitialize = async (showErrors) => {
        const selectedModel = modelSelect.value || null;
        const endpoint = endpointInput.value.trim();

        try {
            const result = await initAI(selectedModel, endpoint);

            if (result?.model) {
                localStorage.setItem(MODEL_STORAGE, result.model);
                modelSelect.value = result.model;
            }

            if (result?.endpoint) {
                localStorage.setItem(OLLAMA_ENDPOINT_STORAGE, endpoint || '/api');
            }

            updateModelStatus('connected');
            modal.classList.add('hidden');

            return true;
        } catch (e) {
            updateModelStatus('unavailable');

            return false;
        }
    };

    // Attempt auto-init from saved settings
    void tryInitialize(false);

    submitBtn.addEventListener('click', async () => {
        const ok = await tryInitialize(true);
        if (!ok) {
            endpointInput.style.borderColor = '#ef4444';
        }
    });

    endpointInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitBtn.click();
    });

    endpointInput.addEventListener('input', () => {
        endpointInput.style.borderColor = '';
    });

    modelSelect.addEventListener('change', async () => {
        localStorage.setItem(MODEL_STORAGE, modelSelect.value);

        // If local AI is already initialized, switching model should re-init immediately.
        if (getActiveModel()) {
            await tryInitialize(true);
        }
    });

    if (!storedModel && !storedEndpoint) {
        updateModelStatus('waiting');
    }
}

async function boot() {
    // 1. Load accident data
    try {
        await loadAccidentData();
    } catch (err) {
        document.getElementById('stats-text').textContent = 'Failed to load data';
        console.error(err);
        return;
    }

    // 2. Initialize map
    initMap();

    // 3. Show all markers
    showAllMarkers();

    // 4. Initialize sidebar
    initSidebar();

    // 5. Setup local AI modal
    setupLocalAIModal();
    updateModelStatus();

    // 6. Update stats
    const summary = summarize();
    document.getElementById('stats-text').textContent =
        `${summary.totalAccidents} accidents | ${summary.totalFatalities} fatalities | ${summary.totalInjuries} injuries`;
}

// Boot the app
boot().catch(console.error);
