/* -------------------------------------------------------------------------- */
/* [1] 전역 설정 및 상태 관리                                                 */
/* -------------------------------------------------------------------------- */

// 🔥 요청하신 대로 롤 복구 + PM 교체 완료
const roles = [
    { id: "TeamManager", label: "Team Manager", icon: "fa-users" },
    { id: "HRBP", label: "HRBP", icon: "fa-user-tie" },
    { id: "QualityManager", label: "Quality Manager", icon: "fa-check-double" },
    { id: "OpsManager", label: "Ops Manager", icon: "fa-gears" },
    { id: "ProjectImplManager", label: "Project Impl. Manager", icon: "fa-diagram-project" }, // 교체됨
    { id: "WorkflowManager", label: "Workflow Manager", icon: "fa-share-nodes" },
    { id: "CapacityPlanning", label: "Capacity Planner", icon: "fa-chart-pie" },
    { id: "BudgetWorkforce", label: "Budget & Workforce", icon: "fa-money-bill-trend-up" }
];

let state = {
    step: 1, role: null, task: null, 
    personas: [], selectedPersona: null, chatMessages: [], 
    latestPrompt: "", latestSimulation: "",
    progress: 0
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
    
    document.getElementById('sendMessageBtn').addEventListener('click', () => sendMessage());
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
/* [4] 페르소나 생성 (T&S Context Preserved)                                  */
/* -------------------------------------------------------------------------- */

async function generatePersonas() {
    const task = document.getElementById('taskInput').value.trim();
    if (!task) return alert("Please describe your goal first.");
    
    state.task = task;
    goToStep(3);
    document.getElementById('loader').classList.remove('hidden');

    // T&S 맥락은 유지하되, 선택한 롤에 맞춰서 작동하도록 설정
    const prompt = `
    You are a Trust & Safety Prompt Architect.
    User Role: ${state.role.label}
    User Goal: ${state.task}

    Create 3 personas acting as a "Guided Form Wizard".
    Their goal is to build a robust prompt for Content Moderation, Policy, or Safety Implementation.
    
    Constraint:
    - Ask ONE question at a time.
    - Provide **Smart Suggestions** in this format: ||Option 1||Option 2||Option 3||

    Output JSON Only:
    [
        {
            "title": "Persona Name",
            "description": "Strategy description",
            "system_instruction": "You are [Persona]. Build a prompt for '${state.task}'. Ask ONE question at a time. ALWAYS provide 3-4 suggestions using ||Option|| format.",
            "first_message": "Let's define the **Scope**. What specific area of Trust & Safety is this for?\n\n||Harassment Policy||Fraud Detection||Child Safety||Misinformation||"
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
        alert("Failed. Check API Key/Quota.");
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
/* [5] 채팅 엔진 (Guided Builder with Smart Chips)                            */
/* -------------------------------------------------------------------------- */

function startChat(idx) {
    state.selectedPersona = state.personas[idx];
    goToStep(4);
    
    state.progress = 10;
    updateProgressBar();

    state.chatMessages = [
        { 
            role: "system", 
            content: state.selectedPersona.system_instruction + 
            "\n\n[STRICT FORMAT RULE]\n1. Always output the Prompt Draft in ```markdown``` block.\n2. Always provide 3-4 clickable suggestions at the bottom using ||Option A||Option B|| format." 
        }
    ];
    document.getElementById('chatHistory').innerHTML = '';
    
    processIncomingMessage(state.selectedPersona.first_message);
    state.chatMessages.push({ role: "assistant", content: state.selectedPersona.first_message });
}

async function sendMessage(manualText = null) {
    const input = document.getElementById('chatInput');
    const text = manualText || input.value.trim();
    if (!text) return;

    input.value = '';
    input.placeholder = "Type your specific requirement..."; 
    
    addMessageToUI("user", text);
    state.chatMessages.push({ role: "user", content: text });

    state.progress = Math.min(state.progress + 15, 95);
    updateProgressBar();

    const loadingId = addMessageToUI("assistant", "Thinking...", true);

    try {
        const aiResponse = await callChat(state.chatMessages);
        document.getElementById(loadingId).remove();
        
        state.chatMessages.push({ role: "assistant", content: aiResponse });
        processIncomingMessage(aiResponse);

    } catch (e) {
        document.getElementById(loadingId).innerText = "Error: " + e.message;
    }
}

function processIncomingMessage(rawText) {
    let cleanText = rawText;
    
    const optionsRegex = /\|\|(.*?)\|\|/g;
    const optionsMatch = rawText.match(optionsRegex);
    let options = [];
    
    if (optionsMatch) {
        cleanText = rawText.replace(optionsRegex, '').trim();
        optionsMatch.forEach(opt => {
            const items = opt.split('||').filter(s => s.trim() !== '');
            options.push(...items);
        });
    }

    const codeBlockRegex = /```(?:markdown|prompt)?\n([\s\S]*?)```/;
    const codeMatch = cleanText.match(codeBlockRegex);

    if (codeMatch && codeMatch[1]) {
        state.latestPrompt = codeMatch[1];
        state.progress = 100;
        updateProgressBar();
        runSimulation(codeMatch[1]);
    }

    addMessageToUI("assistant", cleanText, false, options);
}

function addMessageToUI(role, text, isTemp = false, options = []) {
    const div = document.createElement('div');
    const id = 'msg-' + Date.now();
    div.id = id;
    div.className = `flex w-full flex-col ${role === 'user' ? 'items-end' : 'items-start'}`;

    const bubble = document.createElement('div');
    bubble.className = `max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
        role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border text-slate-700 rounded-bl-none'
    }`;

    if (role === 'assistant' && !isTemp) {
        const display = text.replace(/```(?:markdown|prompt)?\n([\s\S]*?)```/g, 
            '<div class="bg-indigo-50 border border-indigo-200 p-3 rounded-lg text-xs text-indigo-700 cursor-help"><i class="fa-solid fa-code"></i> Prompt Updated (Check Preview)</div>'
        );
        bubble.innerHTML = marked.parse(display);
    } else if (isTemp) {
        bubble.innerHTML = `<div class="typing-indicator flex gap-1 p-1"><span></span><span></span><span></span></div>`;
    } else {
        bubble.innerText = text;
    }
    
    div.appendChild(bubble);

    if (options.length > 0) {
        const chipsContainer = document.createElement('div');
        chipsContainer.className = 'suggestion-chips';
        
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'chip';
            btn.innerText = opt;
            btn.onclick = () => sendMessage(opt);
            chipsContainer.appendChild(btn);
        });

        const manualBtn = document.createElement('button');
        manualBtn.className = 'chip border-indigo-300 text-indigo-600 bg-indigo-50 font-bold';
        manualBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Write my own...';
        manualBtn.onclick = () => {
            const input = document.getElementById('chatInput');
            input.focus();
            input.placeholder = "Type your specific preference...";
            input.scrollIntoView({ behavior: 'smooth' });
        };
        chipsContainer.appendChild(manualBtn);

        div.appendChild(chipsContainer);
    }

    const history = document.getElementById('chatHistory');
    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
    return id;
}

function updateProgressBar() {
    let barContainer = document.getElementById('progressBarContainer');
    if (!barContainer) {
        const chatHeader = document.querySelector('#step-4 .bg-white.p-4.border-b');
        barContainer = document.createElement('div');
        barContainer.id = 'progressBarContainer';
        barContainer.className = 'px-4 pt-0 pb-2 bg-white border-b';
        barContainer.innerHTML = `
            <div class="flex justify-between text-[10px] text-slate-400 mb-1 font-bold uppercase">
                <span>Building Prompt...</span>
                <span id="progressText">0%</span>
            </div>
            <div class="progress-container">
                <div id="progressBar" class="progress-bar"></div>
            </div>
        `;
        chatHeader.after(barContainer);
    }
    
    document.getElementById('progressBar').style.width = state.progress + '%';
    document.getElementById('progressText').innerText = state.progress + '%';
    if(state.progress >= 100) {
        document.getElementById('progressBar').classList.add('bg-green-500');
    }
}

/* -------------------------------------------------------------------------- */
/* [6] 시뮬레이션 및 프리뷰 엔진                                              */
/* -------------------------------------------------------------------------- */

async function runSimulation(promptCode) {
    const container = document.getElementById('previewContainer');
    container.innerHTML = `
        <div class="fade-in space-y-6">
            <div>
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-bold text-slate-500 uppercase">Generated Prompt</span>
                </div>
                <div class="bg-slate-800 text-slate-200 p-4 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed shadow-inner border border-slate-700">
${promptCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                </div>
            </div>
            <div id="simulationResultArea">
                <div class="flex flex-col items-center justify-center py-8 text-indigo-500">
                    <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2"></i>
                    <p class="text-xs font-bold">Simulating...</p>
                </div>
            </div>
        </div>
    `;

    try {
        const simulationResult = await callChat([
            { role: "system", content: "You are the internal corporate AI. Execute the prompt faithfully." },
            { role: "user", content: promptCode }
        ]);
        
        document.getElementById('simulationResultArea').innerHTML = `
            <div class="border-t pt-4 fade-in">
                <div class="mb-3 flex items-center gap-2">
                    <span class="text-xs font-bold text-indigo-600 uppercase">Simulation Output</span>
                    <span class="text-[10px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded">Preview</span>
                </div>
                <div class="prose prose-sm max-w-none text-slate-700 bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                    ${marked.parse(simulationResult)}
                </div>
            </div>
        `;
    } catch (e) {
        document.getElementById('simulationResultArea').innerHTML = `<div class="text-red-500 text-xs">Sim Failed: ${e.message}</div>`;
    }
}

function copyPromptCode() {
    if (!state.latestPrompt) return alert("No prompt generated yet.");
    navigator.clipboard.writeText(state.latestPrompt).then(() => alert("Prompt Copied!"));
}

/* -------------------------------------------------------------------------- */
/* [7] API 유틸리티 (429 Retry)                                               */
/* -------------------------------------------------------------------------- */

async function callLLM(prompt, isJson) {
    const msgs = [{ role: "system", content: "You are a JSON generator." }, { role: "user", content: prompt }];
    return await callChat(msgs, isJson);
}

async function callChat(messages, isJson = false, retryCount = 0) {
    const key = localStorage.getItem('ps_apiKey');
    const provider = localStorage.getItem('ps_provider') || 'groq';
    const model = localStorage.getItem('ps_model') || 'gpt-3.5-turbo';

    if (!key) throw new Error("API Key Missing");

    try {
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

            if (res.status === 429) {
                if (retryCount < 2) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return callChat(messages, isJson, retryCount + 1);
                } else throw new Error("Rate Limit Exceeded.");
            }
            const data = await res.json();
            return data.candidates[0].content.parts[0].text;
        } else {
            const baseUrl = provider === 'groq' 
                ? 'https://api.groq.com/openai/v1/chat/completions' 
                : 'https://api.openai.com/v1/chat/completions';
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

            if (res.status === 429) {
                if (retryCount < 2) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return callChat(messages, isJson, retryCount + 1);
                } else throw new Error("Rate Limit Exceeded. Try again later.");
            }
            const data = await res.json();
            if(data.error) throw new Error(data.error.message);
            return data.choices[0].message.content;
        }
    } catch (e) { throw e; }
}

/* -------------------------------------------------------------------------- */
/* [8] 설정 관리                                                              */
/* -------------------------------------------------------------------------- */
function toggleSettings() { document.getElementById('settingsPanel').classList.toggle('hidden'); }
function loadSettings() { 
    const k = localStorage.getItem('ps_apiKey'); 
    if(k) { document.getElementById('apiKey').value = k; fetchModels(true); } else toggleSettings(); 
}
function saveAndClose() {
    localStorage.setItem('ps_apiKey', document.getElementById('apiKey').value);
    localStorage.setItem('ps_provider', document.getElementById('apiProvider').value);
    localStorage.setItem('ps_model', document.getElementById('modelSelect').value);
    toggleSettings();
}
function clearKeys() { if(confirm("Delete Key?")) { localStorage.clear(); location.reload(); } }
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
    } catch(e) {}
}
