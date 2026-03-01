let currentLang = localStorage.getItem('lang') || 'en';
let currentActiveKey = '';
let signedPolicies = []; 

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) return window.location.href = "index.html";

    // 1. Get Name from Token
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        document.getElementById('username').innerText = payload.name || "User";
    } catch (e) { 
        console.error("Token error"); 
    }

    // 2. Setup Sidebar Toggle
    const menuBtn = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    if(menuBtn) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // 3. Initial Sync
    await fetchUserStatus();
    applyLanguage();
});

async function fetchUserStatus() {
    try {
        const res = await fetch('https://employee-policy-system.onrender.com/api/employee/status', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        
        // Match keys from your User Schema (policySubmissions array)
        signedPolicies = data.policySubmissions.map(p => p.policyKey);
        updateSidebarStatus();
    } catch (err) {
        console.error("Status fetch failed", err);
    }
}

function updateSidebarStatus() {
    document.querySelectorAll('#policy-submenu li').forEach(li => {
        const attr = li.getAttribute('onclick');
        if(!attr) return;
        const key = attr.match(/'([^']+)'/)[1];
        
        if (signedPolicies.includes(key)) {
            li.classList.add('is-signed');
            const link = li.querySelector('a');
            if(link) link.innerHTML = `<i class="fas fa-check-circle"></i> ${i18n[currentLang][key]}`;
        }
    });
}

function toggleSubmenu() {
    document.getElementById('policy-submenu').classList.toggle('open');
}

function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'kn' : 'en';
    localStorage.setItem('lang', currentLang);
    applyLanguage();
    if (currentActiveKey) loadContent(currentActiveKey);
    updateSidebarStatus();
}

function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[currentLang][key]) el.innerText = i18n[currentLang][key];
    });
    document.getElementById('lang-btn-text').innerText = currentLang === 'en' ? 'ಕನ್ನಡ' : 'English';
}

function loadContent(key) {
    currentActiveKey = key;
    const display = document.getElementById('content-display');
    const welcome = document.getElementById('welcome-screen');
    
    welcome.style.display = 'none';
    display.style.display = 'block';

    const isSigned = signedPolicies.includes(key);
    const title = i18n[currentLang][key];
    const content = i18n[currentLang][`${key}_content`];

    display.innerHTML = `
        <h2 class="policy-title">${title}</h2>
        <div class="policy-text-box">${content}</div>
        
        ${isSigned ? 
            `<div class="signed-badge"><i class="fas fa-check-circle"></i> You have already submitted this policy.</div>` : 
            `<div class="submission-controls">
                <p><strong>Do you agree to this policy?</strong></p>
                <div class="radio-group">
                    <label><input type="radio" name="p-status" value="agreed"> ${i18n[currentLang].agree}</label>
                    <label><input type="radio" name="p-status" value="disagreed"> ${i18n[currentLang].disagree}</label>
                </div>
                <button class="btn-submit" onclick="handlePolicySubmit('${key}')">${i18n[currentLang].submit}</button>
            </div>`
        }
    `;

    // Close sidebar on mobile after selection
    if(window.innerWidth < 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

async function handlePolicySubmit(policyKey) {
    const status = document.querySelector('input[name="p-status"]:checked')?.value;
    if (!status) return alert("Please select an option.");

    try {
        const res = await fetch('https://employee-policy-system.onrender.com/api/employee/submit-policy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ policyKey, status })
        });

        if (res.ok) {
            alert(i18n[currentLang].success_msg || "Submitted Successfully");
            signedPolicies.push(policyKey);
            updateSidebarStatus();
            loadContent(policyKey);
        }
    } catch (err) { alert("Error submitting."); }
}

function logout() {
    localStorage.clear();
    window.location.href = "index.html";
}