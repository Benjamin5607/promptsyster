/* -------------------------------------------------------------------------- */
/* 1. Data & State Management                                                 */
/* -------------------------------------------------------------------------- */

const roles = [
    { id: "TeamManager", label: "Team Manager", icon: "fa-users" },
    { id: "HRBP", label: "HR Expert (HRBP)", icon: "fa-user-tie" },
    { id: "QualityManager", label: "QA Manager", icon: "fa-magnifying-glass-chart" },
    { id: "OpsManager", label: "Operations Manager", icon: "fa-gears" },
    { id: "ProductManager", label: "Product Manager (PM)", icon: "fa-clipboard-list" },
    { id: "DevLead", label: "Tech Lead", icon: "fa-code" },
    { id: "Marketing", label: "Marketer", icon: "fa-bullhorn" },
    { id: "Translator", label: "Biz Translator", icon: "fa-language" }
];

let state = {
    step: 1,
    role: null,
    task: null,
    templates: [], 
    selectedTemplate: null,
    maskingMap: {},
    counter: { email: 1, phone: 1, id: 1 }
};

/* -------------------------------------------------------------------------- */
/* 2. Initialization & UI Handlers                                            */
/* -------------------------------------------------------------------------- */

window.onload = () => {
    renderRoles();
    loadSettings();
};

function renderRoles() {
    const grid = document.getElementById('roleGrid');
    grid.innerHTML = roles.map(r => `
        <div onclick="selectRole('${r.id}')" class="cursor-pointer bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition flex flex-col items-center gap-3 group">
            <div class="bg-slate-100 p-3 rounded-full group-hover:bg-white transition">
                <i class="fa-solid ${r.icon} text-2xl text-slate-400 group-hover:text-indigo-600"></i>
            </div>
            <span class="text-sm font-bold text-slate-600 group-hover:text-indigo-700">${r.label}</span>
        </div>
    `).join('');
}

function selectRole(roleId) {
    state.role = roles.find(r => r.id === roleId);
    goToStep(2);
}

function goToStep(step) {
    state.step = step;
    
    // Hide all steps
    [1, 2, 3, 4].forEach(i => document.getElementById(`step-${i}`).classList.add('hidden'));
    
    // Show current step
    document.getElementById(`step-${step}`).classList.remove('hidden');

    // Panel Management
    if(step === 4 && document.getElementById('finalResult').innerText !== "") {
        // Keep result panel visible if we have results
    } else {
        document.getElementById('previewPanel').classList.remove('hidden');
        document.getElementById('resultPanel').classList.add('hidden');
    }

    // Reset preview if going back to step 1 or 2
    if(step <= 2) {
        document.getElementById('previewPlaceholder').classList.remove('hidden');
        document.getElementById('previewContentWrapper').classList.add('hidden');
    }
}

/* -------------------------------------------------------------------------- */
/* 3. AI Template Generator (Meta-Prompting)                                  */
/* -------------------------------------------------------------------------- */

async function generateTemplates() {
    const task = document.getElementById('taskInput').value;
    if (!task) return alert("Please describe your task first!");
    
    state.task = task;
    goToStep(3);
    
    const loader = document.getElementById('templateLoader');
    const list = document.getElementById('templateList');
    
    loader.classList.remove('hidden');
    list.innerHTML = '';

    // Meta-Prompt: Asking AI to design prompts in JSON format
    const metaPrompt = `
    You are an expert Enterprise Prompt Engineer.
    
    User Persona: ${state.role.label}
    User Task: ${state.task}

    Please generate 5 distinct, professional prompt templates that the user can use with an AI (like ChatGPT/Claude) to accomplish this task.
    
    IMPORTANT: 
    1. Output MUST be a valid JSON array.
    2. Do NOT use markdown code blocks. Just raw JSON.
    3. Language: English.
    
    Structure: [{"title": "Short Title", "description": "1 sentence benefit", "content": "Full Prompt Template..."}]
    
    - "content" should include sections like [Role], [Context], [Task], [Constraints].
    - Use placeholders like [Insert Data Here] for parts the user needs to fill in.
    `;

    try {
        const responseText = await callAI(metaPrompt, true); 
        
        // Clean up JSON (in case AI wraps it in markdown)
        let jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // Basic error handling for malformed JSON
        let templates;
        try {
            templates = JSON.parse(jsonStr);
        } catch (e) {
            throw new Error("Failed to parse AI response. Please try again.");
        }

        state.templates = templates;
        renderTemplates(templates);

    } catch (e) {
        console.error(e);
        alert("Failed to generate templates. Please check your API Key or try again.");
        list.innerHTML = `<button onclick="generateTemplates()" class="text-indigo-600 font-bold underline mt-4">Try Again</button>`;
        goToStep(2); // Go back
    } finally {
        loader.classList.add('hidden');
    }
}

function renderTemplates(templates) {
    const list = document.getElementById('templateList');
    list.innerHTML = templates.map((t, idx) => `
        <div onclick="previewTemplate(${idx})" class="p-5 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-sm cursor-pointer transition group">
            <h3 class="font-bold text-slate-700 text-sm mb-1 group-hover:text-indigo-700 flex justify-between items-center">
                ${t.title}
                <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-indigo-400 text-xs"></i>
            </h3>
            <p class="text-xs text-slate-500 leading-relaxed">${t.description}</p>
        </div>
    `).join('');
    
    // Manual Option
    list.innerHTML += `
        <div onclick="skipToManual()" class="mt-4 p-4 border border-dashed border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer text-center text-slate-500 text-xs font-medium transition">
            <i class="fa-solid fa-pen mr-2"></i>None of these? Write Manually
        </div>
    `;
}

function previewTemplate(idx) {
    const t = state.templates[idx];
    state.selectedTemplate = t;
    
    // UI Updates
    document.getElementById('previewPlaceholder').classList.add('hidden');
    const wrapper = document.getElementById('previewContentWrapper');
    wrapper.classList.remove('hidden');
    
    document.getElementById('previewTitle').innerText = t.title;
    document.getElementById('previewBody').innerText = t.content;
}

function skipToManual() {
    state.selectedTemplate = { 
        content: `Role: ${state.role.label}\nTask: ${state.task || 'General Task'}\n\n[Instructions]\nPlease help me with...\n\n[Data]\n(Paste your data here)` 
    };
    confirmTemplate();
}

function confirmTemplate() {
    // If user clicked manual skip without selecting
    if(!state.selectedTemplate) skipToManual();

    const editor = document.getElementById('finalEditor');
    // Use the content from preview (or default)
    editor.value = state.selectedTemplate.content;
    goToStep(4);
}

/* -------------------------------------------------------------------------- */
/* 4. Masking & Sending Logic                                                 */
/* -------------------------------------------------------------------------- */

const patterns = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(010-\d{3,4}-\d{4})|(\d{2,3}-\d{3,4}-\d{4})|(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g
};

async function processAndSend() {
    const rawText = document.getElementById('finalEditor').value;
    if(!rawText.trim()) return alert("Please enter the content to send.");
    if(!localStorage.getItem('ps_apiKey')) {
        alert("Please set your API Key in Settings first.");
        toggleSettings();
        return;
    }

    // Switch to Result View
    document.getElementById('previewPanel').classList.add('hidden');
    document.getElementById('resultPanel').classList.remove('hidden');
    document.getElementById('loadingText').classList.remove('hidden');
    
    const aiOutput = document.getElementById('aiResponseOutput');
    const finalOutput = document.getElementById('finalResult');
    
    aiOutput.innerText = "";
    finalOutput.innerText = "";

    state.maskingMap = {};
    state.counter = { email: 1, phone: 1 };

    // [Step 1] Masking
    let safeText = rawText;
    safeText = safeText.replace(patterns.email, (m) => { const k = `[EMAIL_${state.counter.email++}]`; state.maskingMap[k] = m; return k; });
    safeText = safeText.replace(patterns.phone, (m) => { const k = `[PHONE_${state.counter.phone++}]`; state.maskingMap[k] = m; return k; });

    try {
        // [Step 2] Send to AI
        const response = await callAI(safeText, false);
        
        // [Step 3] Show Raw
        aiOutput.innerText = response;

        // [Step 4] Unmasking
        let restored = response;
        // Sort keys by length desc to prevent partial replacement issues
        const keys = Object.keys(state.maskingMap).sort((a,b) => b.length - a.length);
        
        for(const k of keys) {
            const v = state.maskingMap[k];
            restored = restored.split(k).join(v);
        }
        finalOutput.innerText = restored;

    } catch(e) {
        aiOutput.innerText = "Error: " + e.message;
        alert("Error occurred: " + e.message);
    } finally {
        document.getElementById('loadingText').classList.add('hidden');
    }
}

function copyResult() {
    const text = document.getElementById('finalResult').innerText;
    if(!text) return;
    navigator.clipboard.writeText(text).then(() => {
        // Toast or simple alert
        const btn = document.querySelector('#resultPanel button');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied`;
        setTimeout(() => btn.innerHTML = originalText, 2000);
    });
}

/* -------------------------------------------------------------------------- */
/* 5. API Client (Universal Adapter)                                          */
/* -------------------------------------------------------------------------- */

function toggleSettings() { document.getElementById('settingsPanel').classList.toggle('hidden'); }

function loadSettings() {
    const key = localStorage.getItem('ps_apiKey');
    const provider = localStorage.getItem('ps_provider');
    if(key) {
        document.getElementById('apiKey').value = key;
        document.getElementById('apiProvider').value = provider || 'groq';
        // Auto-fetch if key exists
        fetchModels(true);
    } else {
        toggleSettings(); // Open settings if no key
    }
}

function resetModelList() {
    document.getElementById('modelSelect').innerHTML = '<option value="" disabled selected>Enter Key & Click Fetch</option>';
}

function saveAndClose() {
    const key = document.getElementById('apiKey').value;
    const provider = document.getElementById('apiProvider').value;
    const model = document.getElementById('modelSelect').value;

    if(!key) return alert("API Key is required.");
    
    localStorage.setItem('ps_apiKey', key);
    localStorage.setItem('ps_provider', provider);
    if(model) localStorage.setItem('ps_model', model);
    
    toggleSettings();
}

function clearKeys() {
    if(confirm("Are you sure you want to remove your API Key from this browser?")) {
        localStorage.clear();
        location.reload();
    }
}

async function fetchModels(isAutoLoad = false) {
    const provider = document.getElementById('apiProvider').value;
    const apiKey = document.getElementById('apiKey').value;
    const modelSelect = document.getElementById('modelSelect');
    const btn = document.getElementById('refreshBtn');

    if(!apiKey) {
        if(!isAutoLoad) alert("Please enter an API Key.");
        return;
    }

    if(!isAutoLoad) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
    }

    try {
        let models = [];
        
        if (provider === 'openai' || provider === 'groq') {
            const baseUrl = provider === 'groq' 
                ? 'https://api.groq.com/openai/v1/models' 
                : 'https://api.openai.com/v1/models';
            
            const res = await fetch(baseUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
            if(!res.ok) throw new Error("Invalid API Key");
            
            const data = await res.json();
            models = data.data.map(m => m.id).sort();
            
        } else if (provider === 'gemini') {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if(!res.ok) throw new Error("Invalid API Key");
            
            const data = await res.json();
            models = data.models
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));
        }

        modelSelect.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = m;
            modelSelect.appendChild(opt);
        });
        
        // Restore previous selection if available
        const saved = localStorage.getItem('ps_model');
        if(saved && models.includes(saved)) modelSelect.value = saved;
        else if (models.length > 0) modelSelect.selectedIndex = 0;

        if(!isAutoLoad) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Success';
            btn.classList.add('text-green-600');
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-solid fa-rotate mr-1"></i>Fetch Models';
                btn.classList.remove('text-green-600');
            }, 2000);
        }

    } catch (error) {
        console.error(error);
        if(!isAutoLoad) {
            alert("Connection Failed: " + error.message);
            btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Failed';
        }
    }
}

async function callAI(prompt, isSystem = false) {
    const provider = localStorage.getItem('ps_provider') || 'groq';
    const apiKey = localStorage.getItem('ps_apiKey');
    const model = localStorage.getItem('ps_model') || (provider==='gemini'?'gemini-1.5-flash':'gpt-3.5-turbo');

    if(!apiKey) throw new Error("API Key missing.");

    // System Prompt for Templates
    const systemMsg = isSystem 
        ? "You are a helpful assistant that outputs ONLY JSON." 
        : "You are a helpful assistant.";

    if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        // Gemini specific payload
        const payload = {
            contents: [
                { role: "user", parts: [{ text: isSystem ? prompt : prompt }] } 
            ],
            generationConfig: {
                temperature: isSystem ? 0.2 : 0.7
            }
        };
        // Note: Gemini API structure is slightly different for system instructions, 
        // but putting it in user prompt often works for simple cases. 
        // For strict system prompt, we need 'system_instruction' field in beta API.
        // Keeping it simple here for compatibility.
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;
    } 
    else {
        // OpenAI / Groq
        const baseUrl = provider === 'groq' 
            ? 'https://api.groq.com/openai/v1/chat/completions' 
            : 'https://api.openai.com/v1/chat/completions';

        const res = await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemMsg },
                    { role: "user", content: prompt }
                ],
                temperature: isSystem ? 0.2 : 0.7
            })
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    }
}
