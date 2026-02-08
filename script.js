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
    latestPrompt: "", latestSimulation: "",
    progress: 0 // 진행률 (0~100)
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
/* [4] 페르소나 생성 (Meta-Prompting: The Option Generator)                   */
/* -------------------------------------------------------------------------- */

async function generatePersonas() {
    const task = document.getElementById('taskInput').value.trim();
    if (!task) return alert("Please describe your goal first.");
    
    state.task = task;
    goToStep(3);
    document.getElementById('loader').classList.remove('hidden');

    // 🔥 핵심: AI에게 "객관식 옵션을 파이프(||)로 구분해서 달라"고 지시
    const prompt = `
    Meta-Prompt Engineer Task.
    User Role: ${state.role.label}
    User Goal: ${state.task}

    Create 3 personas that act as a "Guided Form Wizard".
    Instead of open-ended chat, they must provide **Smart Suggestions** (clickable options) for every question.

    Format Constraint for Personas:
    - End every question with suggested options in this format: ||Option 1||Option 2||Option 3||

    Output JSON Only:
    [
        {
            "title": "Persona Name",
            "description": "How they guide (e.g. Focused on Quality)",
            "system_instruction": "You are [Persona]. Build a prompt for '${state.task}'.\nSteps: Context -> Audience -> Output Format -> Constraints.\n\nRULE: Ask ONE question at a time. ALWAYS provide 3-4 suggestions at the end of your message using ||Option|| format.",
            "first_message": "Let's start with the **Context**. Why are we doing this task?\n\n||Routine Weekly Report||Project Post-Mortem||New Initiative Launch||Performance Improvement Plan||"
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
        alert("Failed. Check Key.");
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
    
    // 진행바 초기화
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
    
    // 첫 메시지 처리 (옵션 파싱 포함)
    processIncomingMessage(state.selectedPersona.first_message);
    state.chatMessages.push({ role: "assistant", content: state.selectedPersona.first_message });
}

async function sendMessage(manualText = null) {
    const input = document.getElementById('chatInput');
    const text = manualText || input.value.trim();
    if (!text) return;

    input.value = '';
    addMessageToUI("user", text);
    state.chatMessages.push({ role: "user", content: text });

    // 진행률 업데이트 (단순 로직: 대화할 때마다 15%씩 증가)
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

// 🔥 핵심: 메시지에서 텍스트, 코드블록, 옵션을 분리해서 UI에 그리기
function processIncomingMessage(rawText) {
    let cleanText = rawText;
    
    // 1. 옵션 추출 (||Option||)
    const optionsRegex = /\|\|(.*?)\|\|/g;
    const optionsMatch = rawText.match(optionsRegex);
    let options = [];
    
    if (optionsMatch) {
        // 텍스트에서 옵션 부분 제거 (깔끔하게 보이기 위해)
        cleanText = rawText.replace(optionsRegex, '').trim();
        // 옵션 배열 만들기
        optionsMatch.forEach(opt => {
            // 구분자 제거하고 빈 항목 필터링
            const items = opt.split('||').filter(s => s.trim() !== '');
            options.push(...items);
        });
    }

    // 2. 프롬프트 코드 블록 추출
    const codeBlockRegex = /```(?:markdown|prompt)?\n([\s\S]*?)```/;
    const codeMatch = cleanText.match(codeBlockRegex);

    if (codeMatch && codeMatch[1]) {
        state.latestPrompt = codeMatch[1];
        state.progress = 100; // 코드가 나오면 완성으로 간주
        updateProgressBar();
        runSimulation(codeMatch[1]);
    }

    // 3. UI 렌더링
    addMessageToUI("assistant", cleanText, false, options);
}

function addMessageToUI(role, text, isTemp = false, options = []) {
    const div = document.createElement('div');
    const id = 'msg-' + Date.now();
    div.id = id;
    div.className = `flex w-full flex-col ${role === 'user' ? 'items-end' : 'items-start'}`;

    // 말풍선
    const bubble = document.createElement('div');
    bubble.className = `max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
        role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border text-slate-700 rounded-bl-none'
    }`;

    if (role === 'assistant' && !isTemp) {
        // 코드 블록 숨김 처리 (프리뷰로 유도)
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

    // 🔥 옵션 버튼 (Chips) 렌더링
    if (options.length > 0) {
        const chipsContainer = document.createElement('div');
        chipsContainer.className = 'suggestion-chips';
        
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'chip';
            btn.innerText = opt;
            btn.onclick = () => sendMessage(opt); // 클릭 시 자동 전송
            chipsContainer.appendChild(btn);
        });
        div.appendChild(chipsContainer);
    }

    const history = document.getElementById('chatHistory');
    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
    return id;
}

function updateProgressBar() {
    // 채팅창 상단에 진행바를 넣을 공간이 필요함. 
    // index.html의 chatHistory 위에 넣는 게 좋지만, 여기선 JS로 동적 삽입 처리
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
        document.getElementById('progressBar').classList.add('bg-green-500'); // 완료 시 색 변경
    }
}

/* -------------------------------------------------------------------------- */
/* [6] 시뮬레이션 및 프리뷰 엔진 (동일)                                       */
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
/* [7] API 및 유틸리티 (동일)                                                 */
/* -------------------------------------------------------------------------- */
// (기존 코드와 동일하게 callLLM, callChat, Settings 함수 유지)
// 코드가 너무 길어져서 생략했지만, 아까 v4.1의 하단 유틸리티 함수들을 그대로 쓰면 됩니다.

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
        const data = await res.json();
        return data.choices[0].message.content;
    }
}

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
    // (기존 fetchModels 코드 사용)
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
