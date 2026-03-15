import { askQuestion, isInitialized } from '../ai/engine.js';
import {
    generateHeatmap,
    generateDensityMap,
    generateThematicMap,
    filterMarkers,
    resetMap,
} from '../map/map.js';

let chatContainer = null;
let chatInput = null;
let sendBtn = null;

export function initSidebar() {
    chatContainer = document.getElementById('chat-messages');
    chatInput = document.getElementById('chat-input');
    sendBtn = document.getElementById('send-btn');

    // Send on click
    sendBtn.addEventListener('click', handleSend);

    // Send on Enter
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Quick action buttons
    document.querySelectorAll('.quick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            handleQuickAction(action);
        });
    });
}

async function handleSend() {
    const question = chatInput.value.trim();
    if (!question) return;

    if (!isInitialized()) {
        addMessage('Start local AI first (Ollama model + endpoint) from the modal.', 'ai');
        return;
    }

    // Add user message
    addMessage(question, 'user');
    chatInput.value = '';

    // Disable input
    setInputEnabled(false);

    // Show typing indicator
    const typingEl = showTyping();

    try {
        const response = await askQuestion(question);
        removeTyping(typingEl);

        // Add AI response
        addMessage(response.text, 'ai', response.mapAction);

        // Execute map action if present
        if (response.mapAction) {
            executeMapAction(response.mapAction);
        }
    } catch (err) {
        removeTyping(typingEl);
        addMessage(`❌ Error: ${err.message}`, 'ai');
    } finally {
        setInputEnabled(true);
        chatInput.focus();
    }
}

function handleQuickAction(action) {
    const prompts = {
        heatmap: 'Show me a heatmap of all accidents',
        severity: 'Show accidents color-coded by severity level',
        density: 'Show a density map of accidents by district',
        reset: 'Reset the map to default view',
    };

    const prompt = prompts[action];
    if (prompt) {
        chatInput.value = prompt;
        handleSend();
    }
}

function executeMapAction(action) {
    if (!action || !action.type) return;

    try {
        switch (action.type) {
            case 'heatmap':
                generateHeatmap();
                break;

            case 'density':
                generateDensityMap(action.params?.field || 'district');
                break;

            case 'thematic':
                generateThematicMap(action.params?.field || 'severity');
                break;

            case 'filter':
                if (action.params && Object.keys(action.params).length > 0) {
                    filterMarkers(action.params);
                }
                break;

            case 'reset':
                resetMap();
                break;

            default:
                console.warn('Unknown map action:', action.type);
        }
    } catch (err) {
        console.error('Map action error:', err);
    }
}

export function addMessage(text, role, mapAction = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}-message`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (role === 'ai') {
        // Parse markdown-like formatting
        contentDiv.innerHTML = formatAIText(text);

        // Add map action badge if present
        if (mapAction && mapAction.type) {
            const badge = document.createElement('div');
            badge.className = 'map-action-badge';
            const icons = { heatmap: '🔥', density: '📊', thematic: '🎨', filter: '🔍', reset: '🗺️' };
            badge.innerHTML = `${icons[mapAction.type] || '🗺️'} Map updated: ${mapAction.type}`;
            contentDiv.appendChild(badge);
        }
    } else {
        contentDiv.textContent = text;
    }

    msgDiv.appendChild(contentDiv);
    chatContainer.appendChild(msgDiv);
    scrollToBottom();
}

function formatAIText(text) {
    if (!text) return '';

    return text
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Inline code
        .replace(/`(.*?)`/g, '<code>$1</code>')
        // Bullet lists
        .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
        // Numbered lists
        .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
        // Paragraphs
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br/>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>')
        // Clean up empty paragraphs
        .replace(/<p>\s*<\/p>/g, '');
}

function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai-message';
    typingDiv.innerHTML = `
    <div class="typing-indicator">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
    chatContainer.appendChild(typingDiv);
    scrollToBottom();
    return typingDiv;
}

function removeTyping(element) {
    if (element && element.parentNode) {
        element.parentNode.removeChild(element);
    }
}

function setInputEnabled(enabled) {
    chatInput.disabled = !enabled;
    sendBtn.disabled = !enabled;
    if (enabled) {
        chatInput.focus();
    }
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}
