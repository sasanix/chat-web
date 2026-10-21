// ==========================================
// 4. لایه منطق (App Logic Layer) - VIP Edition v13.0
// ==========================================
const params = new URLSearchParams(window.location.search);
const ME = params.get('me');
const MY_ID = params.get('myid');
const TO = params.get('to');
const TO_ID = params.get('toid');

let ISSUE_NUMBER = null, TYPING_ISSUE_NUM = null, lastETag = null;
let replyToId = null, lastReadMsgId = Number(localStorage.getItem(`lastRead_${ME}_${TO}`)) || 0;
let renderedMsgIds = new Set(), isDestructMode = false;
let mediaRecorder = null, audioChunks = [], isRecordingVoice = false;
let recordingStartTime = 0, recordingTimerInterval = null;
let currentPreviewAudio = null, currentPreviewBtn = null;
let currentCardAudio = null, currentCardBtn = null;
let currentAudioPlayer = null;
let audioCtx = null, isMusicPlaying = false, chordInterval = null, analyser = null;
const chords = [[261.63, 329.63, 392.00, 493.88], [220.00, 261.63, 329.63, 392.00], [174.61, 220.00, 261.63, 329.63], [196.00, 246.94, 293.66, 349.23]];
let chordIdx = 0, pinBuffer = '';
const savedPin = localStorage.getItem('chatPin');
let dreamTimer = null;

// ==========================================
// 1. الگوریتم ریاضی تولید شناسه VIP (Hash + Checksum)
// ==========================================
function generateVIPID(name) {
    if (!name) return "000000";
    const str = name.toLowerCase().trim();
    
    // 1. تولید هش از اسم
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // تبدیل به 32-bit integer
    }
    hash = Math.abs(hash);
    
    // 2. گرفتن ۵ رقم اول
    const part1 = (hash % 90000) + 10000; // عددی بین 10000 تا 99999
    const p1str = part1.toString();
    
    // 3. محاسبه رقم کنترل (Checksum)
    // فرمول: مجموع (رقم * جایگاه) سپس باقیمانده بر 10
    let checksum = 0;
    for (let i = 0; i < 5; i++) {
        checksum += parseInt(p1str[i]) * (i + 1);
    }
    checksum = checksum % 10;
    
    return p1str + checksum;
}

function validateVIPID(id) {
    if (!id || id.length !== 6 || isNaN(id)) return false;
    const p1str = id.substring(0, 5);
    const givenChecksum = parseInt(id[5]);
    
    let calculatedChecksum = 0;
    for (let i = 0; i < 5; i++) {
        calculatedChecksum += parseInt(p1str[i]) * (i + 1);
    }
    calculatedChecksum = calculatedChecksum % 10;
    
    return givenChecksum === calculatedChecksum;
}

// ==========================================
// 2. راه‌اندازی اولیه و صفحه خوش‌آمدگویی
// ==========================================
if (!ME || !TO || !MY_ID || !TO_ID) {
    // اگر لینک کامل نبود، صفحه لاگین VIP را نشان بده
    renderWelcomeScreen();
} else {
    // اگر کد نامعتبر بود، خطا بده
    if (!validateVIPID(MY_ID) || !validateVIPID(TO_ID)) {
        renderWelcomeScreen("کد شناسه وارد شده معتبر نیست! لطفاً دوباره تلاش کنید.");
    } else {
        initChatApp();
    }
}

function renderWelcomeScreen(errorMsg = "") {
    const savedMe = localStorage.getItem('vip_me') || '';
    const myGeneratedId = savedMe ? generateVIPID(savedMe) : '';
    
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen">
            <div style="font-size:3rem;margin-bottom:15px">👑</div>
            <h2>خوش آمدید</h2>
            <p>به باشگاه اختصاصی ما خوش آمدید. برای شروع، اطلاعات خود را وارد کنید.</p>
            
            ${errorMsg ? `<div style="background:rgba(239,68,68,0.2);color:#ef4444;padding:10px;border-radius:10px;margin-bottom:15px;font-size:0.85rem;text-align:center;max-width:320px;">${errorMsg}</div>` : ''}
            
            <!-- کارت VIP من -->
            <div class="vip-card" onclick="copyMyID('${myGeneratedId}')">
                <div class="vip-badge-icon">👑</div>
                <div class="vip-title">شناسه اختصاصی من</div>
                <div class="vip-id">${myGeneratedId || '------'}</div>
                <div class="vip-name">${savedMe || 'نام خود را وارد کنید'}</div>
                <div style="font-size:0.65rem;color:var(--gold);margin-top:8px;opacity:0.8">برای کپی کلیک کنید</div>
            </div>

            <div class="input-group">
                <label>نام نمایشی شما</label>
                <input id="inputMe" type="text" placeholder="مثلا: ساسان" value="${savedMe}" oninput="updateMyID(this.value)">
            </div>
            
            <div class="input-group">
                <label>شناسه VIP مخاطب (۶ رقم)</label>
                <input id="inputToID" type="number" placeholder="مثلا: 123456" maxlength="6">
            </div>
            
            <div class="input-group">
                <label>نام مخاطب</label>
                <input id="inputToName" type="text" placeholder="مثلا: نسترن">
            </div>

            <button class="btn-large" onclick="startChatFromWelcome()">ورود به چت 🚀</button>
            <p style="font-size:0.7rem;margin-top:20px;opacity:0.6">نسخه VIP | کاملاً امن</p>
        </div>
    `;
}

window.updateMyID = (name) => {
    if(name.length > 2) {
        localStorage.setItem('vip_me', name);
        const id = generateVIPID(name);
        document.querySelector('.vip-id').innerText = id;
        document.querySelector('.vip-name').innerText = name;
        document.querySelector('.vip-card').setAttribute('onclick', `copyMyID('${id}')`);
    }
}

window.copyMyID = (id) => {
    if(!id || id === '------') {
        alert('لطفاً ابتدا نام خود را وارد کنید تا شناسه ساخته شود.');
        return;
    }
    navigator.clipboard.writeText(id).then(() => {
        // افکت بصری
        const card = document.querySelector('.vip-card');
        card.style.transform = 'scale(0.95)';
        setTimeout(() => card.style.transform = 'scale(1)', 150);
        alert('شناسه VIP شما کپی شد! ✅\nاین کد را برای دوستتان بفرستید.');
    });
}

window.startChatFromWelcome = () => {
    const meName = document.getElementById('inputMe').value.trim();
    const toName = document.getElementById('inputToName').value.trim();
    const toId = document.getElementById('inputToID').value.trim();
    
    if (!meName || !toName || !toId) return alert('لطفاً همه فیلدها را پر کنید.');
    
    const myId = generateVIPID(meName);
    
    if (!validateVIPID(toId)) {
        return alert('شناسه VIP وارد شده نامعتبر است! لطفاً از دوستتان بخواهید کد صحیح را به شما بدهد.');
    }
    
    // هدایت به لینک با تمام پارامترها
    window.location.href = `?me=${encodeURIComponent(meName)}&myid=${myId}&to=${encodeURIComponent(toName)}&toid=${toId}`;
}

// ==========================================
// 3. ادامه اپلیکیشن (بعد از لاگین موفق)
// ==========================================
async function initChatApp() {
    document.getElementById('chatTitle').innerText = `چت با ${TO}`;
    
    // نمایش شناسه VIP خودم در هدر
    const statusSpan = document.getElementById('presenceStatus');
    statusSpan.innerHTML = `متصل | شناسه: <b style="color:var(--gold)">${MY_ID}</b>`;
    
    initThemeAndAvatar();
    await startDatabaseConnection();
    setupUI();
    setupBackground();
    
    if (savedPin) document.getElementById('pinScreen').style.display = 'flex';
    
    const ambientLayer = document.createElement('div'); ambientLayer.id = 'ambientLayer'; document.getElementById('app').prepend(ambientLayer);
    const avatarEl = document.getElementById('avatarEl'); const aura = document.createElement('div'); aura.className = 'avatar-aura'; avatarEl.parentElement.classList.add('avatar-wrapper'); avatarEl.parentElement.prepend(aura);
    const hint = document.createElement('div'); hint.className = 'dream-hint'; hint.innerText = '✨ در حال رویا... برای بیدار شدن لمس کن ✨'; document.body.appendChild(hint);
    
    loadSidebar();
}

// ==========================================
// 4. سایدبار (Contact List)
// ==========================================
async function loadSidebar() {
    const sidebarList = document.getElementById('sidebarList');
    if (!sidebarList) return;
    sidebarList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.85rem">در حال بارگذاری مخاطبین...</div>';
    try {
        const GITHUB_TOKEN = CONFIG.GITHUB.TOKEN_PART_1 + CONFIG.GITHUB.TOKEN_PART_2;
        const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues?state=all&per_page=100`, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } });
        if (!res.ok) throw new Error();
        const issues = await res.json();
        sidebarList.innerHTML = '';
        let uniqueContacts = new Map();
        
        issues.forEach(issue => {
            if (issue.title.startsWith('VIP-')) {
                const parts = issue.title.replace('VIP-', '').split('-');
                if (parts.includes(MY_ID)) {
                    const otherId = parts.find(p => p !== MY_ID);
                    if (otherId && !uniqueContacts.has(otherId)) {
                        // سعی میکنیم اسم رو از عنوان اتاق دربیاریم (چون فقط ID رو داریم)
                        // فرمت عنوان: VIP-ID1-ID2
                        uniqueContacts.set(otherId, { id: otherId, name: "مخاطب ناشناس" });
                    }
                }
            }
        });
        
        if (uniqueContacts.size === 0) {
            sidebarList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.85rem">هیچ مخاطبی یافت نشد. از دکمه پایین برای افزودن مخاطب استفاده کنید.</div>';
        } else {
            uniqueContacts.forEach((contact) => {
                const isActive = contact.id === TO_ID;
                const div = document.createElement('div');
                div.className = `sidebar-item ${isActive ? 'active' : ''}`;
                div.innerHTML = `<div class="sidebar-avatar">${contact.id.substring(0,1)}</div><div style="flex:1"><div style="font-weight:600;font-size:.9rem;">${contact.name}</div><div style="font-size:.7rem;color:var(--gold)">شناسه: ${contact.id}</div></div>`;
                div.onclick = () => { window.location.href = `?me=${ME}&myid=${MY_ID}&to=${contact.name}&toid=${contact.id}`; };
                sidebarList.appendChild(div);
            });
        }
        
        // دکمه افزودن مخاطب جدید
        const btnDiv = document.createElement('div');
        btnDiv.className = 'sidebar-buttons';
        btnDiv.innerHTML = `<button class="btn-primary" onclick="showAddContactModal()">➕ افزودن مخاطب جدید</button>`;
        sidebarList.appendChild(btnDiv);
        
    } catch(e) {
        sidebarList.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;font-size:0.85rem">خطا در دریافت لیست مخاطبین.</div>';
    }
}

window.showAddContactModal = () => {
    document.getElementById('addContactOverlay').style.display = 'flex';
}

// ==========================================
// 5. اتصال به دیتابیس
// ==========================================
async function startDatabaseConnection() {
    // اتاق بر اساس VIP ID ساخته میشه تا دو نفر همیشه به یک اتاق برسن
    const sortedIds = [MY_ID, TO_ID].sort();
    const roomTitle = `VIP-${sortedIds[0]}-${sortedIds[1]}`;
    
    ISSUE_NUMBER = await DataAdapter.getRoom(roomTitle);
    const typingTitle = `_typing_status_${roomTitle}`;
    TYPING_ISSUE_NUM = await DataAdapter.getRoom(typingTitle);
    
    if (!ISSUE_NUMBER) { document.getElementById('presenceStatus').innerText = 'خطا در اتصال'; return; }
    
    await fetchAndRenderMessages(true);
    setInterval(() => fetchAndRenderMessages(false), 2500);
    setInterval(checkTypingStatus, 2500);
}

// ==========================================
// 6. منطق دریافت پیام‌ها (با سیستم کش)
// ==========================================
async function fetchAndRenderMessages(isInitial = false) {
    if (!ISSUE_NUMBER) return;
    
    if (isInitial) {
        const cached = localStorage.getItem(`cache_${ME}_${TO}`);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                document.getElementById('chatArea').innerHTML = `<div class="pill">امروز</div>`;
                renderedMsgIds.clear();
                parsed.forEach(msg => processMessage(msg, true));
            } catch(e) {}
        }
    }

    const result = await DataAdapter.fetchMessages(ISSUE_NUMBER, isInitial ? null : lastETag);
    if (result.notModified || result.error) return;
    lastETag = result.etag;
    const newMessages = result.data;
    
    localStorage.setItem(`cache_${ME}_${TO}`, JSON.stringify(newMessages));
    
    let unreadDividerAdded = false;
    if (isInitial) { document.getElementById('chatArea').innerHTML = `<div class="pill">امروز</div>`; renderedMsgIds.clear(); }
    
    newMessages.forEach((msg, index) => {
        const isMe = msg.body.startsWith(ME + ': ');
        if (!isMe && !msg.body.startsWith(TO + ': ')) return;
        
        if (isInitial && !isMe && msg.id > lastReadMsgId && !unreadDividerAdded) {
            const divider = document.createElement('div'); divider.className = 'unread-divider'; divider.innerText = 'پیام‌های جدید';
            document.getElementById('chatArea').appendChild(divider); unreadDividerAdded = true;
        }
        
        if (!renderedMsgIds.has(msg.id)) {
            processMessage(msg, isInitial, index === newMessages.length - 1);
            renderedMsgIds.add(msg.id);
        }
    });
    
    if (newMessages.length > 0) {
        const lastId = newMessages[newMessages.length - 1].id;
        if (lastId > lastReadMsgId) { lastReadMsgId = lastId; localStorage.setItem(`lastRead_${ME}_${TO}`, lastId); }
    }
}

function processMessage(msg, isInitial = false, isLast = false) {
    const colonIdx = msg.body.indexOf(': ');
    if (colonIdx === -1) return;
    const sender = msg.body.substring(0, colonIdx);
    let rawText = msg.body.substring(colonIdx + 2);
    
    let isRead = false;
    if (rawText.includes('[READ]')) { isRead = true; rawText = rawText.replace('[READ]', '').trim(); }
    let isDestruct = false;
    if (rawText.includes('[DESTRUCT]')) { isDestruct = true; rawText = rawText.replace('[DESTRUCT]', '').trim(); }
    
    let replyHtml = '';
    const replyMatch = rawText.match(/^\[R:(\d+)\]\s*/);
    if (replyMatch) {
        rawText = rawText.replace(/^\[R:\d+\]\s*/, '');
        replyHtml = `<div class="reply-quote">↩️ پاسخ به پیام قبلی</div>`;
    }
    
    let reaction = null;
    const reactionMatch = rawText.match(/\s*\{([^\}]+)\}\s*$/);
    if (reactionMatch) { reaction = reactionMatch[1]; rawText = rawText.replace(/\s*\{([^\}]+)\}\s*$/, '').trim(); }
    
    let text = rawText;
    if (!text.startsWith('[IMG]') && !text.startsWith('[AUDIO]') && !text.startsWith('[LOC]') && !text.startsWith('[MUSIC]')) {
        text = decryptText(text);
    }

    const isMe = sender === ME;
    renderMessage(text, isMe, msg.created_at, msg.id, reaction, isRead, replyHtml, !isInitial, isDestruct);
    
    if (!isMe && !isRead) DataAdapter.markAsRead(msg.id, msg.body);
    
    if (!isInitial && !isMe && isLast) {
        setTimeout(() => { playSynthSound('receive'); vibrate('receive'); }, 200);
    }
}

// (توابع ابزارها، رندر پیام، تنظیمات UI، ویس، موزیک و... دقیقاً مثل نسخه 12.2 قبلی هستند)
// برای جلوگیری از طولانی شدن، اینجا فقط بخش‌های تغییر یافته لاگین و اتاق رو نوشتم.
// شما فقط کل فایل app.js قبلی رو با این جایگزین کنید.
