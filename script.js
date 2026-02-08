// 파일명: script.js

/* -------------------------------------------------------------------------- */
/* 1. 설정 데이터                               */
/* -------------------------------------------------------------------------- */

const roleTemplates = {
    "TeamManager": {
        label: "팀 매니저 (Team Manager)",
        persona: "당신은 공감 능력이 뛰어나고 성과 지향적인 팀 리더입니다.",
        context: "팀원들의 피드백 작성 및 성과 관리를 효율적으로 해야 합니다.",
        task: "입력된 데이터를 바탕으로 건설적이고 구체적인 피드백 초안을 작성해주세요."
    },
    "HRBP": {
        label: "HRBP (인사 담당자)",
        persona: "당신은 노동법 지식과 조직 문화에 대한 깊은 이해를 가진 HR 전문가입니다.",
        context: "공정하고 객관적인 인사 평가 및 조직 이슈를 다룹니다.",
        task: "감정적인 표현을 배제하고, 객관적인 사실 기반의 리포트를 작성해주세요."
    },
    "QualityManager": {
        label: "퀄리티 매니저 (Quality Manager)",
        persona: "당신은 디테일에 강하고 ISO 표준을 준수하는 품질 관리 전문가입니다.",
        context: "제품/서비스의 결함을 분석하고 품질 향상 방안을 모색합니다.",
        task: "문제의 원인을 파악하고 재발 방지 대책을 구조화하여 제안해주세요."
    },
    "OpsManager": {
        label: "옵스 매니저 (Ops Manager)",
        persona: "당신은 효율성을 최우선으로 하는 운영 관리 전문가입니다.",
        context: "업무 프로세스의 병목 현상을 해결하고 리소스를 최적화합니다.",
        task: "현재 프로세스의 비효율적인 부분을 지적하고 개선된 워크플로우를 제안해주세요."
    },
    "ProductManager": {
        label: "프로덕트 매니저 (Product Manager)",
        persona: "당신은 비즈니스 가치와 사용자 경험을 연결하는 PM입니다.",
        context: "제품 요구사항 정의(PRD) 및 우선순위 결정을 수행합니다.",
        task: "사용자 스토리(User Story) 형태로 요구사항을 정리하고 인수 조건을 명시해주세요."
    },
    "WorkflowManager": {
        label: "워크플로우 매니저 (Workflow Manager)",
        persona: "당신은 시스템적 사고를 가진 자동화 및 프로세스 설계자입니다.",
        context: "도구 간의 연동 및 업무 자동화 시나리오를 설계합니다.",
        task: "단계별(Step-by-step) 실행 절차를 논리적으로 작성해주세요."
    },
    "CapacityPlanner": {
        label: "캐패시티 플래닝 매니저",
        persona: "당신은 데이터 기반의 예측 모델링 전문가입니다.",
        context: "미래의 인력 및 리소스 수요를 예측합니다.",
        task: "데이터를 분석하여 리소스 부족/과잉 구간을 식별하고 최적 배치안을 제시해주세요."
    },
    "BudgetManager": {
        label: "버젯 & 워크포스 매니저",
        persona: "당신은 재무적 통찰력을 가진 예산 및 인력 관리 전문가입니다.",
        context: "예산 제약 내에서 최대의 효율을 낼 수 있는 인력 운용을 계획합니다.",
        task: "비용 효율성을 고려한 예산 분배 및 인력 운영 계획을 수립해주세요."
    }
};

// 롤 선택 박스 초기화
const roleSelect = document.getElementById('roleSelect');
for (const [key, value] of Object.entries(roleTemplates)) {
    const option = document.createElement('option');
    option.value = key;
    option.innerText = value.label;
    roleSelect.appendChild(option);
}


/* -------------------------------------------------------------------------- */
/* 2. 핵심 로직 (Masking Core)                        */
/* -------------------------------------------------------------------------- */

let maskingMap = {}; // 원본 데이터와 가짜 데이터를 매핑하는 저장소
let counter = { email: 1, phone: 1, id: 1, name: 1 }; // 카운터

// PII 감지 정규식 (Regex)
const patterns = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(010-\d{3,4}-\d{4})|(\d{2,3}-\d{3,4}-\d{4})/g,
    // 간단한 주민번호/외국인등록번호 패턴 (뒷자리는 가정을 포함)
    idCard: /\d{6}-?[1-4]\d{6}/g, 
    // 이름은 정규식으로 완벽 탐지가 어려우므로 예시로 3글자 한글 패턴 일부 적용 (실제론 더 복잡함)
    // 여기서는 사용자가 직접 지정하거나, 명백한 패턴만 처리하도록 보수적으로 설정
};

function resetMasking() {
    maskingMap = {};
    counter = { email: 1, phone: 1, id: 1, name: 1 };
}

function generateSafePrompt() {
    // 1. 초기화
    resetMasking();
    const roleKey = document.getElementById('roleSelect').value;
    const rawText = document.getElementById('rawInput').value;

    if (!roleKey) {
        alert("직무(Role)를 먼저 선택해주세요!");
        return;
    }
    if (!rawText.trim()) {
        alert("변환할 텍스트를 입력해주세요.");
        return;
    }

    // 2. 마스킹 처리 (Masking)
    let safeText = rawText;

    // 이메일 마스킹
    safeText = safeText.replace(patterns.email, (match) => {
        const key = `[EMAIL_${counter.email++}]`;
        maskingMap[key] = match;
        return key;
    });

    // 전화번호 마스킹
    safeText = safeText.replace(patterns.phone, (match) => {
        const key = `[PHONE_${counter.phone++}]`;
        maskingMap[key] = match;
        return key;
    });

    // 주민번호 마스킹
    safeText = safeText.replace(patterns.idCard, (match) => {
        const key = `[ID_${counter.id++}]`;
        maskingMap[key] = match;
        return key;
    });

    // 3. 템플릿 조합 (Prompt Engineering)
    const template = roleTemplates[roleKey];
    const finalPrompt = `
# Role
${template.persona}

# Context
${template.context}

# Task
${template.task}

# Constraints
1. Do not use real personal information if found. Use the placeholders provided (e.g., [EMAIL_1]).
2. Answer in Korean.
3. Use a professional tone.

# Input Data
"""
${safeText}
"""
    `.trim();

    // 4. 결과 출력
    const outputDiv = document.getElementById('safePromptOutput');
    outputDiv.innerText = finalPrompt;
    outputDiv.classList.remove('text-slate-400');
    outputDiv.classList.add('text-slate-800');
}

/* -------------------------------------------------------------------------- */
/* 3. 복원 로직 (Unmasking)                           */
/* -------------------------------------------------------------------------- */

function restoreRealData() {
    const aiResponse = document.getElementById('aiResponseInput').value;
    const resultDiv = document.getElementById('finalResult');

    if (!aiResponse.trim()) {
        alert("AI 답변을 입력해주세요.");
        return;
    }

    let restoredText = aiResponse;

    // 저장된 매핑 정보를 이용해 역치환 (Replace Placeholders back to Real Data)
    // 키 길이가 긴 순서대로 정렬해서 치환해야 중복 문제 방지 가능 (여기선 간단히 처리)
    for (const [key, value] of Object.entries(maskingMap)) {
        // 전역 치환을 위해 replaceAll 사용
        restoredText = restoredText.replaceAll(key, value);
    }

    // 결과 표시
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `<strong>✅ 복원된 결과:</strong><br><br>${restoredText.replace(/\n/g, '<br>')}`;
}

/* -------------------------------------------------------------------------- */
/* 4. 유틸리티 (Copy)                                 */
/* -------------------------------------------------------------------------- */

function copyPrompt() {
    const text = document.getElementById('safePromptOutput').innerText;
    if (text.includes("(왼쪽에서")) return;
    
    navigator.clipboard.writeText(text).then(() => {
        alert("프롬프트가 복사되었습니다!");
    });
}
