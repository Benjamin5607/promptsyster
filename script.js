/* -------------------------------------------------------------------------- */
/* [1] 전역 설정 및 상태 관리                                                 */
/* -------------------------------------------------------------------------- */

const roles = [
    { id: "TeamManager", label: "Team Manager", icon: "fa-users" },
    { id: "HRBP", label: "HRBP", icon: "fa-user-tie" },
    { id: "QualityManager", label: "Quality Manager", icon: "fa-check-double" },
    { id: "OpsManager", label: "Ops Manager", icon: "fa-gears" },
    { id: "ProductManager", label: "Product Manager", icon: "fa-clipboard-list" },
    { id: "WorkflowManager", label: "Workflow Manager", icon: "fa-share-nodes" },
    { id: "CapacityPlanning", label: "Capacity Planner", icon: "fa-chart-pie" },
    { id: "BudgetWorkforce", label: "Budget & Workforce", icon: "fa-money-bill-trend-up" }
];

let state = {
    step: 1, role: null, task: null, 
    personas: [], selectedPersona: null, chatMessages: [], 
    latestPrompt: "", latestSimulation: ""
};

/* -------------------------------------------------------------------------- */
/* [2] 초기화 및 이벤트 리스너                                                */
/* -------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    renderRoles();
    loadSettings();

    document.getElementById('settingsBtn').addEventListener('click', toggleSettings);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveAndClose);
    document.getElementById('fetchModelsBtn').addEventListener('click', () => fetchModels(false));
    document.getElementById('clearKeysBtn').addEventListener('click', clearKeys);
    
    document.getElementById('generatePersonasBtn').addEventListener('click', generatePersonas);
    document.getElementById('backToStep1').addEventListener('click', () => goToStep(1));
    document.getElementById('backToStep2').addEventListener('click', () => goToStep(2));
    
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    document.getElementById('restartBtn').addEventListener('click', () => location.reload());
    
    const copyBtn = document.getElementById('copyPreviewBtn');
    copyBtn.innerText = "Copy Prompt Code"; 
    copyBtn.addEventListener('click', copyPromptCode);
});

/* -------------------------------------------------------------------------- */
/* [3] 위자드 UI 로직                                                         */
/* -------------------------------------------------------------------------- */

function renderRoles() {
    const grid = document.getElementById('roleGrid');
    grid.innerHTML = roles.map(r => `
        <div data-id="${r.id}" class="role-card cursor-pointer bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-500 hover:bg-indigo-50 transition flex flex-col items-center gap-3 text-center group">
            <div class="bg-slate-100 p-3 rounded-full group-hover:bg-white transition">
                <i class="fa-solid ${r.icon} text-2xl text-slate-400 group-hover:text-indigo-600"></i>
            </div>
            <span class="font-bold text-sm text-slate-600 group-hover:text-indigo-700">${r.label}</span>
        </div>
    `).join('');

    document.querySelectorAll('.role-card').forEach(card => {
        card.addEventListener('click', () => {
            const roleId = card.getAttribute('data-id');
            state.role = roles.find(r => r.id === roleId);
            goToStep(2);
        });
    });
}

function goToStep(step) {
    state.step = step;
    [1, 2, 3, 4].forEach(i => document.getElementById(`step-${i}`).classList.add('hidden'));
    document.getElementById(`step-${step}`).classList.remove('hidden');
}

/* -------------------------------------------------------------------------- */
/* [4] 페르소나 생성 (핵심: 질문 쪼개기 전략)                                  */
/* -------------------------------------------------------------------------- */

async function generatePersonas() {
    const task = document.getElementById('taskInput').value.trim();
    if (!task) return alert("Please describe your goal first.");
    
    state.task = task;
    goToStep(3);
    document.getElementById('loader').classList.remove('hidden');

    // 🔥 핵심 변경: 질문을 한 번에 하나씩만 하도록(Persona Constraints) 강력하게 지시
    const prompt = `
    You are a Meta-Prompt Engineer.
    User Role: ${state.role.label}
    User Goal: ${state.task}

    Create 3 personas that will interview the user to build a perfect prompt.
    
    CRITICAL CONSTRAINT: 
    The personas must use a **"Step-by-Step Interview"** method.
    They must NEVER ask multiple questions at once.
    They must ask **ONE** single question per turn to gather requirements (e.g., Context -> Audience -> Format -> Constraints).

    Strategies:
    1. "The Sequential Builder": Starts with context, then moves to audience, then format. Very linear.
    2. "The Minimalist": Asks only the most critical missing piece of information. Short and direct.
    3. "The Socratic Partner": Asks "Why" or "How" to clarify intent before writing the prompt.

    Output JSON Only:
    [
        {
            "title": "Persona Name",
            "description": "How they interview (e.g., One question at a time)",
            "system_instruction": "You are [Persona]. You are building a prompt for the user's task: '${state.task}'. \n\nRULES:\n1. Ask EXACTLY ONE question at a time.\n2. Wait for the user's answer before asking the next.\n3. After every answer, update the Draft Prompt in a code block.\n4. Do NOT overwhelm the user.",
            "first_message": "Hello! To make this prompt perfect, I need to ask you a few questions one by one. First, who is the **target audience** for this result?"
        }
    ]
    `;

    try {
        const response = await callLLM(prompt, true);
        const jsonStr = response.replace(/```json|```/g, '').trim();
        state.personas = JSON.parse(jsonStr);
        renderPersonas();
    } catch (e) {
        console.error(e);
        alert("Generation failed. Check API Key.");
        goToStep(2);
    } finally {
        document.getElementById('loader').classList.add('hidden');
    }
}

function renderPersonas() {
    const list = document.getElementById('personaList');
    list.innerHTML = state.personas.map((p, i) => `
        <div data-index="${i}" class="persona-card p-5 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 cursor-pointer transition group">
            <h3 class="font-bold text-slate-700 text-sm mb-1 group-hover:text-indigo-700 flex justify-between items-center">
                ${p.title} <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-indigo-400 text-xs"></i>
            </h3>
            <p class="text-xs text-slate-500 leading-relaxed">${p.description}</p>
        </div>
    `).join('');

    document.querySelectorAll('.persona-card').forEach(card => {
        card.addEventListener('click', () => {
            startChat(card.getAttribute('data-index'));
        });
    });
}

/* -------------------------------------------------------------------------- */
/* [5] 채팅 엔진 (Sequential Interview Loop)                                  */
/* -------------------------------------------------------------------------- */

function startChat(idx) {
    state.selectedPersona = state.personas[idx];
    goToStep(4);

    state.chatMessages = [
        { 
            role: "system", 
            // 시스템 프롬프트에 '절대 규칙' 박아넣기
            content: state.selectedPersona.system_instruction + 
            "\n\n[GLOBAL RULES]\n1. Ask ONLY ONE question per turn.\n2. Do NOT list multiple questions.\n3. If you have enough info, output the final prompt inside ```prompt\n...\n```.\n4. Keep your chat messages short and conversational." 
        }
    ];
    document.getElementById('chatHistory').innerHTML = '';
    
    addMessageToUI("assistant", state.selectedPersona.first_message);
    state.chatMessages.push({ role: "assistant", content: state.selectedPersona.first_message });
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addMessageToUI("user", text);
    state.chatMessages.push({ role: "user", content: text });

    const loadingId = addMessageToUI("assistant", "Thinking...", true);

    try {
        const aiResponse = await callChat(state.chatMessages);
        document.getElementById(loadingId).remove();
        addMessageToUI("assistant", aiResponse);
        state.chatMessages.push({ role: "assistant", content: aiResponse });

        // 프롬프트 코드 블록(```prompt)이 보이면 자동 시뮬레이션
        const codeBlockRegex = /```(?:prompt|markdown)?\n([\s\S]*?)```/;
        const match = aiResponse.match(codeBlockRegex);

        if (match && match[1]) {
            state.latestPrompt = match[1];
            runSimulation(match[1]); // 시뮬레이션 실행
        } else {
            // 아직 완성 안 됐으면, 현재까지 파악한 내용으로 '임시 미리보기'라도 보여줄 수 있음 (옵션)
            // 여기선 완성될 때까지 시뮬레이션 대기
        }

    } catch (e) {
        document.getElementById(loadingId).innerText = "Error: " + e.message;
    }
}

function addMessageToUI(role, text, isTemp = false) {
    const div = document.createElement('div');
    const id = 'msg-' + Date.now();
    div.id = id;
    div.className = `flex w-full ${role === 'user' ? 'justify-end' : 'justify-start'}`;

    const bubble = document.createElement('div');
    bubble.className = `max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
        role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border text-slate-700 rounded-bl-none'
    }`;

    if (role === 'assistant' && !isTemp) {
        // 프롬프트 코드는 채팅창에서 너무 길 수 있으니 'Click to Preview' 같은 느낌으로 축약 가능하지만
        // 일단은 그대로 보여주되, 사용자가 읽기 편하게
        bubble.innerHTML = marked.parse(text);
    } else if (isTemp) {
        bubble.innerHTML = `<div class="typing-indicator flex gap-1 p-1"><span></span><span></span><span></span></div>`;
    } else {
        bubble.innerText = text;
    }

    div.appendChild(bubble);
    const history = document.getElementById('chatHistory');
    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
    return id;
}

/* -------------------------------------------------------------------------- */
/* [6] 시뮬레이션 엔진                                                        */
/* -------------------------------------------------------------------------- */

async function runSimulation(promptCode) {
    const container = document.getElementById('previewContainer');
    
    // 로딩 표시
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-indigo-500 fade-in">
            <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3"></i>
            <p class="font-bold">Running Simulation...</p>
            <p class="text-xs text-slate-400 mt-2">Generating sample output from your prompt</p>
        </div>
    `;

    try {
        // 시뮬레이션 실행 (2차 호출)
        const simulationResult = await callChat([
            { role: "system", content: "You are the internal corporate AI. Follow the user's prompt exactly." },
            { role: "user", content: promptCode }
        ]);

        state.latestSimulation = simulationResult;

        // 결과 렌더링
        container.innerHTML = `
            <div class="fade-in">
                <div class="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800 flex items-center justify-between">
                    <span class="flex items-center gap-2"><i class="fa-solid fa-flask"></i> <strong>Simulation Output</strong></span>
                    <span class="text-[10px] opacity-70">Generated by ${localStorage.getItem('ps_model') || 'AI'}</span>
                </div>
                <div class="prose prose-sm max-w-none text-slate-700">
                    ${marked.parse(simulationResult)}
                </div>
            </div>
        `;

    } catch (e) {
        container.innerHTML = `<div class="text-red-500 p-4">Simulation Failed: ${e.message}</div>`;
    }
}

function copyPromptCode() {
    if (!state.latestPrompt) return alert("No prompt generated yet. Keep chatting!");
    
    navigator.clipboard.writeText(state.latestPrompt).then(() => {
        const btn = document.getElementById('copyPreviewBtn');
        const originalText = btn.innerText;
        btn.innerText = "Copied! ✅";
        btn.classList.add("bg-green-50", "text-green-600", "border-green-200");
        setTimeout(() => {
            btn.innerText = originalText;
            btn.classList.remove("bg-green-50", "text-green-600", "border-green-200");
        }, 2000);
    });
}

/* -------------------------------------------------------------------------- */
/* [7] API 및 유틸리티                                                        */
/* -------------------------------------------------------------------------- */

async function callLLM(prompt, isJson) {
    const msgs = [{ role: "system", content: "You are a JSON generator." }, { role: "user", content: prompt }];
    return await callChat(msgs, isJson);
}

async function callChat(messages, isJson = false) {
    const key = localStorage.getItem('ps_apiKey');
    const provider = localStorage.getItem('ps_provider') || 'groq';
    const model = localStorage.getItem('ps_model') || 'gpt-3.5-turbo';

    if (!key) throw new Error("API Key Missing");

    if (provider === 'gemini') {
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
        if(messages[0].role === 'system') {
            contents.shift();
            contents[0].parts[0].text = messages[0].content + "\n\n" + contents[0].parts[0].text;
        }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: contents })
        });
        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    } else {
        const baseUrl = provider === 'groq' 
            ? '[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)' 
            : '[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)';
        const res = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.7,
                response_format: isJson ? { type: "json_object" } : undefined
            })
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    }
}

/* -------------------------------------------------------------------------- */
/* [8] 설정 관리                                                              */
/* -------------------------------------------------------------------------- */

function toggleSettings() { document.getElementById('settingsPanel').classList.toggle('hidden'); }

function loadSettings() {
    const key = localStorage.getItem('ps_apiKey');
    if (key) {
        document.getElementById('apiKey').value = key;
        document.getElementById('apiProvider').value = localStorage.getItem('ps_provider') || 'groq';
        fetchModels(true);
    } else { toggleSettings(); }
}

function saveAndClose() {
    const key = document.getElementById('apiKey').value;
    const provider = document.getElementById('apiProvider').value;
    const model = document.getElementById('modelSelect').value;
    if (!key) return alert("Please enter an API Key.");
    localStorage.setItem('ps_apiKey', key);
    localStorage.setItem('ps_provider', provider);
    localStorage.setItem('ps_model', model);
    toggleSettings();
}

function clearKeys() {
    if(confirm("Delete Key?")) { localStorage.clear(); location.reload(); }
}

async function fetchModels(isAuto) {
    const provider = document.getElementById('apiProvider').value;
    const apiKey = document.getElementById('apiKey').value;
    const select = document.getElementById('modelSelect');
    if(!apiKey) return;
    
    try {
        let models = [];
        if (provider === 'gemini') {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const data = await res.json();
            models = data.models.filter(m => m.supportedGenerationMethods.includes('generateContent')).map(m => m.name.replace('models/', ''));
        } else {
            const baseUrl = provider === 'groq' ? '[https://api.groq.com/openai/v1/models](https://api.groq.com/openai/v1/models)' : '[https://api.openai.com/v1/models](https://api.openai.com/v1/models)';
            const res = await fetch(baseUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
            const data = await res.json();
            models = data.data.map(m => m.id).sort();
        }
        select.innerHTML = '';
        models.forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.innerText = m; select.appendChild(opt); });
        const saved = localStorage.getItem('ps_model');
        if(saved && models.includes(saved)) select.value = saved;
    } catch(e) { console.error(e); }
}
