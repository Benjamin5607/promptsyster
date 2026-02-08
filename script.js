/* -------------------------------------------------------------------------- */
/* [1] 전역 설정 및 상태 관리 (Global State)                                  */
/* -------------------------------------------------------------------------- */

// 1. 핵심 8대 롤 정의 (아이콘 매핑 포함)
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

// 2. 앱 상태 (State)
let state = {
    step: 1,
    role: null,
    task: null,
    personas: [],
    selectedPersona: null,
    chatMessages: [],
    latestPreview: "",
    maskingMap: {},
    counter: { email: 1, phone: 1 }
};

/* -------------------------------------------------------------------------- */
/* [2] 초기화 및 이벤트 리스너 (Initialization)                               */
/* -------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    // 1. 초기 렌더링
    renderRoles();
    loadSettings();

    // 2. 버튼 이벤트 연결 (HTML ID 매핑)
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
    document.getElementById('copyPreviewBtn').addEventListener('click', copyPreview);
});

/* -------------------------------------------------------------------------- */
/* [3] 위자드 UI 로직 (Wizard Flow)                                           */
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

    // 동적 생성된 카드에 이벤트 연결
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

    // AI에게 "역할극 캐릭터 3명"을 만들어달라고 요청
    const prompt = `
    System Architect Task.
    User Role: ${state.role.label}
    User Goal: ${state.task}

    Create 3 distinct "Co-Pilot Personas" to help the user complete this goal interactively.
    Strategies:
    1. "The Strategist": Asks high-level questions first.
    2. "The Fast Drafter": Creates a draft immediately, then iterates.
    3. "The Critic": Asks for data/constraints before starting.

    OUTPUT JSON ONLY:
    [
        {
            "title": "Persona Name",
            "description": "Short description of approach",
            "system_instruction": "You are [Persona Name]. Goal: [User Goal]. Do NOT finish immediately. Ask questions...",
            "first_message": "Hello! I am [Name]. To start, please tell me..."
        }
    ]
    `;

    try {
        // AI 호출 (One-shot)
        const response = await callLLM(prompt, true);
        
        // JSON 파싱 (마크다운 제거 후)
        const jsonStr = response.replace(/```json|```/g, '').trim();
        state.personas = JSON.parse(jsonStr);

        renderPersonas();

    } catch (e) {
        console.error(e);
        alert("Failed to generate personas. Please check your API Key.");
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
            const idx = card.getAttribute('data-index');
            startChat(idx);
        });
    });
}

/* -------------------------------------------------------------------------- */
/* [5] 채팅 엔진 (The Co-Pilot Core)                                          */
/* -------------------------------------------------------------------------- */

function startChat(idx) {
    state.selectedPersona = state.personas[idx];
    goToStep(4);

    // 채팅 기록 초기화
    state.chatMessages = [
        { 
            role: "system", 
            content: state.selectedPersona.system_instruction + 
            "\n\nIMPORTANT: If you create a deliverable (report, table, code), wrap it in markdown code blocks (```markdown or ```csv) so I can preview it." 
        }
    ];
    document.getElementById('chatHistory').innerHTML = '';

    // 첫 메시지 추가
    addMessageToUI("assistant", state.selectedPersona.first_message);
    state.chatMessages.push({ role: "assistant", content: state.selectedPersona.first_message });
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    // 1. PII 마스킹 (보안)
    const safeText = maskPII(text);
    input.value = '';

    // 2. 사용자 메시지 UI 표시
    addMessageToUI("user", safeText);
    state.chatMessages.push({ role: "user", content: safeText });

    // 3. 로딩 표시
    const loadingId = addMessageToUI("assistant", "Thinking...", true);

    try {
        // 4. AI 호출 (대화 기록 포함)
        const aiResponse = await callChat(state.chatMessages);

        // 5. 로딩 제거 및 응답 표시
        document.getElementById(loadingId).remove();
        addMessageToUI("assistant", aiResponse);
        state.chatMessages.push({ role: "assistant", content: aiResponse });

        // 6. 프리뷰 추출 (코드 블록 감지)
        extractPreview(aiResponse);

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
        role === 'user' 
        ? 'bg-indigo-600 text-white rounded-br-none' 
        : 'bg-white border text-slate-700 rounded-bl-none'
    }`;

    // 마크다운 파싱 (AI 메시지만)
    if (role === 'assistant' && !isTemp) {
        bubble.innerHTML = marked.parse(text);
    } else if (isTemp) {
        // 로딩 애니메이션
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
/* [6] 프리뷰 엔진 (Live Preview)                                             */
/* -------------------------------------------------------------------------- */

function extractPreview(text) {
    // 1. 마크다운 코드 블록 찾기 (```...```)
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
    const match = text.match(codeBlockRegex);

    if (match && match[1]) {
        // 코드 블록이 있으면 그걸 프리뷰로 업데이트
        updatePreview(match[1]);
    } else if (text.length > 200 && (text.includes("Table") || text.includes("#"))) {
        // 코드 블록이 없어도 내용이 길고 구조화되어 보이면 전체 업데이트
        updatePreview(text);
    }
}

function updatePreview(content) {
    // 마스킹된 데이터 복구 (필요시) - 여기선 간단히 원본 표시
    state.latestPreview = content;
    const container = document.getElementById('previewContainer');
    
    // 페이드인 효과와 함께 렌더링
    container.innerHTML = `<div class="fade-in">${marked.parse(content)}</div>`;
}

function copyPreview() {
    if (!state.latestPreview) return alert("Nothing to copy yet.");
    navigator.clipboard.writeText(state.latestPreview).then(() => {
        const btn = document.getElementById('copyPreviewBtn');
        const originalText = btn.innerText;
        btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = originalText, 2000);
    });
}

/* -------------------------------------------------------------------------- */
/* [7] API 및 유틸리티 (API & Utils)                                          */
/* -------------------------------------------------------------------------- */

// PII 마스킹 (이메일/전화번호)
function maskPII(text) {
    return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_MASKED]")
               .replace(/\d{3}-\d{3,4}-\d{4}/g, "[PHONE_MASKED]");
}

// LLM 호출 (단발성)
async function callLLM(prompt, isJson) {
    const msgs = [{ role: "system", content: "You are a JSON generator." }, { role: "user", content: prompt }];
    return await callChat(msgs, isJson);
}

// LLM 호출 (대화형 - 통합 어댑터)
async function callChat(messages, isJson = false) {
    const key = localStorage.getItem('ps_apiKey');
    const provider = localStorage.getItem('ps_provider') || 'groq';
    const model = localStorage.getItem('ps_model') || 'gpt-3.5-turbo';

    if (!key) throw new Error("API Key is missing. Check Settings.");

    if (provider === 'gemini') {
        // Gemini API 포맷 변환
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
        
        // System 프롬프트 처리 (Gemini는 user 메시지 앞에 붙이는 게 안전)
        if (messages[0].role === 'system') {
            contents.shift(); 
            contents[0].parts[0].text = messages[0].content + "\n\n" + contents[0].parts[0].text;
        }

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: contents })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;

    } else {
        // OpenAI / Groq 표준 포맷
        const baseUrl = provider === 'groq' 
            ? 'https://api.groq.com/openai/v1/chat/completions' 
            : 'https://api.openai.com/v1/chat/completions';

        const res = await fetch(baseUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${key}` 
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: 0.7,
                response_format: isJson ? { type: "json_object" } : undefined
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    }
}

/* -------------------------------------------------------------------------- */
/* [8] 설정 관리 (Settings)                                                   */
/* -------------------------------------------------------------------------- */

function toggleSettings() {
    document.getElementById('settingsPanel').classList.toggle('hidden');
}

function loadSettings() {
    const key = localStorage.getItem('ps_apiKey');
    if (key) {
        document.getElementById('apiKey').value = key;
        document.getElementById('apiProvider').value = localStorage.getItem('ps_provider') || 'groq';
        fetchModels(true);
    } else {
        toggleSettings();
    }
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
    if (confirm("Are you sure you want to delete your API Key?")) {
        localStorage.clear();
        location.reload();
    }
}

async function fetchModels(isAutoLoad = false) {
    const provider = document.getElementById('apiProvider').value;
    const apiKey = document.getElementById('apiKey').value;
    const select = document.getElementById('modelSelect');
    const btn = document.getElementById('fetchModelsBtn');

    if (!apiKey) {
        if (!isAutoLoad) alert("Enter API Key first.");
        return;
    }

    if (!isAutoLoad) btn.innerText = "...";

    try {
        let models = [];
        // Provider별 모델 리스트 호출
        if (provider === 'gemini') {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if(!res.ok) throw new Error("Invalid Key");
            const data = await res.json();
            models = data.models.filter(m => m.supportedGenerationMethods.includes('generateContent')).map(m => m.name.replace('models/', ''));
        } else {
            const baseUrl = provider === 'groq' ? 'https://api.groq.com/openai/v1/models' : 'https://api.openai.com/v1/models';
            const res = await fetch(baseUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
            if(!res.ok) throw new Error("Invalid Key");
            const data = await res.json();
            models = data.data.map(m => m.id).sort();
        }

        select.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = m;
            select.appendChild(opt);
        });

        // 저장된 모델 복구
        const saved = localStorage.getItem('ps_model');
        if (saved && models.includes(saved)) select.value = saved;

        if (!isAutoLoad) btn.innerText = "Success";

    } catch (e) {
        console.error(e);
        if (!isAutoLoad) {
            btn.innerText = "Failed";
            alert("Connection Failed. Check Key/Provider.");
        }
    }
}
