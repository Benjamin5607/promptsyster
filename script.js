/* -------------------------------------------------------------------------- */
/* 1. 설정 데이터 (Roles & Regex)                                             */
/* -------------------------------------------------------------------------- */

// 8가지 핵심 직무 템플릿
const roleTemplates = {
    "TeamManager": {
        label: "Team Manager (팀 매니저)",
        persona: "당신은 공감 능력이 뛰어나고 성과 지향적인 팀 리더입니다. 명확하고 건설적인 피드백을 제공합니다.",
        task: "입력된 상황을 바탕으로 팀원을 위한 피드백이나 가이드를 작성해주세요."
    },
    "HRBP": {
        label: "HRBP (인사 담당자)",
        persona: "당신은 노동법 지식과 조직 문화에 대한 깊은 이해를 가진 HR 전문가입니다. 객관적이고 중립적인 태도를 유지합니다.",
        task: "감정적인 표현을 배제하고, 사실 기반의 인사 리포트나 평가안을 작성해주세요."
    },
    "QualityManager": {
        label: "Quality Manager (품질 관리)",
        persona: "당신은 디테일에 강하고 ISO 표준을 준수하는 QA 전문가입니다. 문제의 근본 원인(Root Cause)을 파고듭니다.",
        task: "결함 데이터를 분석하고 재발 방지 대책을 구조화하여 제안해주세요."
    },
    "OpsManager": {
        label: "Ops Manager (운영 관리)",
        persona: "당신은 효율성을 최우선으로 하는 운영 전문가입니다. 병목 현상을 찾아내고 프로세스를 최적화합니다.",
        task: "현재 프로세스의 비효율을 지적하고, 개선된 워크플로우(SOP)를 제안해주세요."
    },
    "ProductManager": {
        label: "Product Manager (PM)",
        persona: "당신은 비즈니스 가치와 사용자 경험을 연결하는 PM입니다. 명확한 요구사항 정의(PRD)가 특기입니다.",
        task: "사용자 스토리(User Story) 형식을 포함하여 요구사항을 구체적으로 정리해주세요."
    },
    "WorkflowManager": {
        label: "Workflow Manager (자동화)",
        persona: "당신은 시스템적 사고를 가진 워크플로우 설계자입니다. 논리적인 순서와 도구 간 연동을 중시합니다.",
        task: "단계별(Step-by-step) 실행 절차를 논리적으로 작성해주세요."
    },
    "CapacityPlanner": {
        label: "Capacity Planner (리소스 기획)",
        persona: "당신은 데이터 기반의 리소스 예측 전문가입니다. 숫자와 통계를 근거로 판단합니다.",
        task: "리소스 부족/과잉 구간을 식별하고 인력 재배치 안을 제시해주세요."
    },
    "BudgetManager": {
        label: "Budget Manager (예산 관리)",
        persona: "당신은 ROI(투자 대비 효율)를 중시하는 재무 관리자입니다. 비용 절감과 효율적 집행을 목표로 합니다.",
        task: "비용 효율성을 고려한 예산 분배 및 운영 계획을 수립해주세요."
    }
};

// PII 마스킹을 위한 상태 변수
let maskingMap = {};
let counter = { email: 1, phone: 1, id: 1 };

// 정규식 패턴 (이메일, 전화번호, 주민/외국인번호)
const patterns = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(010-\d{3,4}-\d{4})|(\d{2,3}-\d{3,4}-\d{4})/g,
    idCard: /\d{6}-?[1-4]\d{6}/g 
};

/* -------------------------------------------------------------------------- */
/* 2. 초기화 및 UI 핸들러                                                     */
/* -------------------------------------------------------------------------- */

window.onload = () => {
    // 롤 선택 박스 채우기
    const select = document.getElementById('roleSelect');
    for (const [key, val] of Object.entries(roleTemplates)) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = val.label;
        select.appendChild(opt);
    }
    select.selectedIndex = 0; // 기본 선택

    // 저장된 키가 있는지 확인 (Auto Login)
    const savedKey = localStorage.getItem('ps_apiKey');
    const savedProvider = localStorage.getItem('ps_provider');
    
    if (savedKey) {
        document.getElementById('apiKey').value = savedKey;
        document.getElementById('apiProvider').value = savedProvider || 'openai';
        // 키가 있으면 자동으로 모델 리스트 가져오기
        fetchModels(true); 
    } else {
        // 키가 없으면 설정창 띄우기
        toggleSettings();
    }
};

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.classList.toggle('hidden');
}

function resetModelList() {
    document.getElementById('modelSelect').innerHTML = '<option value="" disabled selected>키 입력 후 "모델 불러오기" 클릭</option>';
}

/* -------------------------------------------------------------------------- */
/* 3. API Key & Model 관리 (BYOK Core)                                        */
/* -------------------------------------------------------------------------- */

async function fetchModels(isAutoLoad = false) {
    const provider = document.getElementById('apiProvider').value;
    const apiKey = document.getElementById('apiKey').value;
    const modelSelect = document.getElementById('modelSelect');
    const btn = document.getElementById('refreshBtn');

    if (!apiKey) {
        if(!isAutoLoad) alert("API Key를 입력해주세요.");
        return;
    }

    if(!isAutoLoad) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 연결 중...';
        btn.classList.add('text-slate-400');
    }

    try {
        let models = [];

        // 1. OpenAI & Groq (Compatible API)
        if (provider === 'openai' || provider === 'groq') {
            const baseUrl = provider === 'groq' 
                ? 'https://api.groq.com/openai/v1/models' 
                : 'https://api.openai.com/v1/models';
            
            const res = await fetch(baseUrl, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (!res.ok) throw new Error("API 키 오류 또는 네트워크 문제");
            const data = await res.json();
            models = data.data.map(m => m.id).sort();
        } 
        // 2. Google Gemini
        else if (provider === 'gemini') {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!res.ok) throw new Error("Gemini API 키 오류");
            
            const data = await res.json();
            models = data.models
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace('models/', ''));
        }

        // Dropdown 업데이트
        modelSelect.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = m;
            modelSelect.appendChild(opt);
        });

        // 저장된 모델이 있으면 선택 복구
        const savedModel = localStorage.getItem('ps_model');
        if(savedModel && models.includes(savedModel)) {
            modelSelect.value = savedModel;
        }

        if(!isAutoLoad) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> 성공!';
            btn.classList.replace('text-slate-400', 'text-green-600');
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-solid fa-rotate"></i> 모델 불러오기';
                btn.classList.replace('text-green-600', 'text-indigo-600');
            }, 2000);
        }

    } catch (error) {
        console.error(error);
        if(!isAutoLoad) {
            alert("모델 목록을 불러오지 못했습니다. API Key를 확인하세요.");
            btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 실패';
            btn.classList.replace('text-slate-400', 'text-red-500');
        }
        // 실패 시 기본값이라도 넣어둠 (수동 입력 대비)
        modelSelect.innerHTML = '<option value="gpt-4o">gpt-4o (Default)</option><option value="llama3-70b-8192">llama3-70b (Default)</option>';
    }
}

function saveAndClose() {
    const key = document.getElementById('apiKey').value;
    const provider = document.getElementById('apiProvider').value;
    const model = document.getElementById('modelSelect').value;

    if(!key || !model) {
        alert("API Key와 Model을 모두 설정해야 합니다.");
        return;
    }

    localStorage.setItem('ps_apiKey', key);
    localStorage.setItem('ps_provider', provider);
    localStorage.setItem('ps_model', model);
    toggleSettings();
}

function clearKeys() {
    if(confirm("모든 API 키 정보를 브라우저에서 삭제하시겠습니까?")) {
        localStorage.clear();
        location.reload();
    }
}

/* -------------------------------------------------------------------------- */
/* 4. 실행 로직 (Masking -> AI -> Restore)                                    */
/* -------------------------------------------------------------------------- */

async function processAndSend() {
    const roleKey = document.getElementById('roleSelect').value;
    let rawText = document.getElementById('rawInput').value;

    if (!roleKey) { alert("직무(Role)를 선택해주세요."); return; }
    if (!rawText.trim()) { alert("내용을 입력해주세요."); return; }
    if (!localStorage.getItem('ps_apiKey')) { alert("설정 메뉴에서 API 키를 먼저 등록해주세요."); toggleSettings(); return; }

    // UI 상태 변경
    const loading = document.getElementById('loadingIndicator');
    const aiOutput = document.getElementById('aiResponseOutput');
    const finalOutput = document.getElementById('finalResult');
    
    loading.classList.remove('hidden');
    aiOutput.innerText = "";
    finalOutput.innerText = "";

    try {
        // [Step 1] Masking (PII 숨기기)
        maskingMap = {};
        counter = { email: 1, phone: 1, id: 1 };
        
        // 이메일
        rawText = rawText.replace(patterns.email, (match) => {
            const k = `[EMAIL_${counter.email++}]`; maskingMap[k] = match; return k;
        });
        // 전화번호
        rawText = rawText.replace(patterns.phone, (match) => {
            const k = `[PHONE_${counter.phone++}]`; maskingMap[k] = match; return k;
        });
        // 주민번호 (간단 패턴)
        rawText = rawText.replace(patterns.idCard, (match) => {
            const k = `[ID_${counter.id++}]`; maskingMap[k] = match; return k;
        });

        // [Step 2] 프롬프트 조립
        const t = roleTemplates[roleKey];
        const finalPrompt = `
# Role
${t.persona}

# Task
${t.task}

# Constraints
1. Response must be in Korean (Business Tone).
2. IMPORTANT: Do NOT change the placeholders (e.g., [EMAIL_1], [PHONE_1]) in the input. Keep them exactly as they are in your response.

# Input Data
"""
${rawText}
"""
        `.trim();

        // [Step 3] AI 호출
        const aiResponse = await callAI(finalPrompt);

        // [Step 4] 결과 표시 및 Unmasking
        aiOutput.innerText = aiResponse; // 마스킹된 원본

        let restoredText = aiResponse;
        for (const [k, v] of Object.entries(maskingMap)) {
            // 모든 발생 건 치환 (replaceAll)
            restoredText = restoredText.split(k).join(v);
        }
        finalOutput.innerText = restoredText; // 복구된 최종본

    } catch (e) {
        alert("오류 발생: " + e.message);
        aiOutput.innerText = "Error: " + e.message;
    } finally {
        loading.classList.add('hidden');
    }
}

// 통합 AI 호출 함수
async function callAI(prompt) {
    const provider = localStorage.getItem('ps_provider');
    const apiKey = localStorage.getItem('ps_apiKey');
    const model = localStorage.getItem('ps_model');

    if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);
        return data.candidates[0].content.parts[0].text;
    } 
    else {
        // OpenAI & Groq
        const baseUrl = provider === 'groq' 
            ? 'https://api.groq.com/openai/v1/chat/completions' 
            : 'https://api.openai.com/v1/chat/completions';

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }]
            })
        });
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    }
}

function copyResult() {
    const text = document.getElementById('finalResult').innerText;
    if(!text) return;
    navigator.clipboard.writeText(text).then(() => {
        alert("결과가 복사되었습니다!");
    });
}
