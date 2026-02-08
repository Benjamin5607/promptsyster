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
    step: 1,
    role: null,
    task: null,
    personas: [],
    selectedPersona: null,
    chatMessages: [],
    latestPrompt: "",      // 복사용 (프롬프트 원본)
    latestSimulation: "",  // 표시용 (시뮬레이션 결과)
};

/* -------------------------------------------------------------------------- */
/* [2] 초기화 및 이벤트 리스너                                                */
/* -------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    renderRoles();
    loadSettings();

    // 네비게이션 및 설정 버튼
    document.getElementById('settingsBtn').addEventListener('click', toggleSettings);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveAndClose);
    document.getElementById('fetchModelsBtn').addEventListener('click', () => fetchModels(false));
    document.getElementById('clearKeysBtn').addEventListener('click', clearKeys);
    
    // 위자드 네비게이션
    document.getElementById('generatePersonasBtn').addEventListener('click', generatePersonas);
    document.getElementById('backToStep1').addEventListener('click', () => goToStep(1));
    document.getElementById('backToStep2').addEventListener('click', () => goToStep(2));
    
    // 채팅 관련
    document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('restartBtn').addEventListener('click', () => location.reload());
    
    // 🔥 핵심: 버튼 기능 분리 (복사는 프롬프트, 보기는 시뮬레이션)
    const copyBtn = document.getElementById('copyPreviewBtn');
    copyBtn.innerText = "Copy Prompt Code"; // 버튼 이름 명확화
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
/* [4] 페르소나 생성 (Meta-Prompting)                                         */
/* -------------------------------------------------------------------------- */

async function generatePersonas() {
    const task = document.getElementById('taskInput').value.trim();
    if (!task) return alert("Please describe your goal first.");
    
    state.task = task;
    goToStep(3);
    document.getElementById('loader').classList.remove('hidden');

    const prompt = `
    You are a Meta-Prompt Engineer.
    User Role: ${state.role.label}
    User Goal: ${state.task}

    The user needs a **PROMPT** to give to their internal AI.
    Create 3 personas that will interview the user to build this prompt.

    Output JSON Only:
    [
        {
            "title": "Persona Name",
            "description": "Approach description",
            "system_instruction": "You are [Persona]. Interview the user. At the end of every response, if you have enough info, output the PROMPT inside a code block \`\`\`prompt ... \`\`\`. Do NOT execute the prompt yourself. Just write the code.",
            "first_message": "Hello! I'll help you design the prompt. First question..."
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
/* [5] 채팅 엔진 (Prompt Building)                                            */
/* -------------------------------------------------------------------------- */

function startChat(idx) {
    state.selectedPersona = state.personas[idx];
    goToStep(4);

    state.chatMessages = [
        { 
            role: "system", 
            content: state.selectedPersona.system_instruction + 
            "\n\nRULE: Whenever you update the prompt draft, enclose it in ```prompt\n[CONTENT]\n```. The user wants to see the PROMPT code, not the result." 
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

        // 🔥 프롬프트 코드 블록이 있는지 확인
        const codeBlockRegex = /```(?:prompt|markdown)?\n([\s\S]*?)```/;
        const match = aiResponse.match(codeBlockRegex);

        if (match && match[1]) {
            const promptCode = match[1];
            state.latestPrompt = promptCode; // 원본 저장 (복사용)
            
            // 🔥 자동 시뮬레이션 실행 (결과 미리보기용)
            runSimulation(promptCode);
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
        // 채팅창에서는 프롬프트 코드가 너무 길면 가림 처리 (UX)
        const display = text.replace(/```(?:prompt|markdown)?\n([\s\S]*?)```/g, '<div class="bg-slate-100 p-2 rounded text-xs text-slate-500 italic"><i class="fa-solid fa-code"></i> Prompt Updated (Check Preview)</div>');
        bubble.innerHTML = marked.parse(display);
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
/* [6] 시뮬레이션 엔진 (The "Simulated Result" Viewer)                          */
/* -------------------------------------------------------------------------- */

async function runSimulation(promptCode) {
    const container = document.getElementById('previewContainer');
    
    // 1. 로딩 상태 표시
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-indigo-500 fade-in">
            <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3"></i>
            <p class="font-bold">Simulating Internal AI Output...</p>
            <p class="text-xs text-slate-400 mt-2">Testing your prompt with the model</p>
        </div>
    `;

    try {
        // 2. 시뮬레이션 실행 (이중 호출)
        // 사용자가 만든 프롬프트를 실제로 AI에게 던져봄
        const simulationResult = await callChat([
            { role: "system", content: "You are the internal corporate AI. Execute the user's prompt faithfully." },
            { role: "user", content: promptCode }
        ]);

        state.latestSimulation = simulationResult;

        // 3. 결과 렌더링 (이것이 프리뷰 화면)
        container.innerHTML = `
            <div class="fade-in">
                <div class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 flex items-center gap-2">
                    <i class="fa-solid fa-flask"></i>
                    <strong>Simulation Mode:</strong> This is what your internal AI will produce.
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

// 🔥 중요: 복사 버튼은 '시뮬레이션 결과'가 아니라 '프롬프트 원본'을 복사함
function copyPromptCode() {
    if (!state.latestPrompt) return alert("No prompt generated yet.");
    
    navigator.clipboard.writeText(state.latestPrompt).then(() => {
        const btn = document.getElementById('copyPreviewBtn');
        const originalText = btn.innerText;
        btn.innerText = "Prompt Copied! ✅";
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
        const baseUrl = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
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
    localStorage.setItem('ps_apiKey', document.getElementById('apiKey').value);
    localStorage.setItem('ps_provider', document.getElementById('apiProvider').value);
    localStorage.setItem('ps_model', document.getElementById('modelSelect').value);
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
            const baseUrl = provider === 'groq' ? 'https://api.groq.com/openai/v1/models' : 'https://api.openai.com/v1/models';
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
