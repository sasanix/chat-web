// ==========================================
// 4. لایه منطق (App Logic Layer) - Super Simple VIP v15.0 (Phone Edition)
// ==========================================
const params = new URLSearchParams(window.location.search);
let ME = localStorage.getItem('vip_me_name');
let MY_ID = localStorage.getItem('vip_me_id');
const URL_TO_ID = params.get('to'); 
const URL_TO_NAME = params.get('toName'); 

let ISSUE_NUMBER = null, TYPING_ISSUE_NUM = null, lastETag = null;
let replyToId = null, lastReadMsgId = Number(localStorage.getItem(`lastRead_${MY_ID}_${URL_TO_ID}`)) || 0;
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
// 1. الگوریتم ریاضی شناسه VIP (Checksum)
// ==========================================
function generateVIPID(seed) {
    if (!seed) return "000000";
    const str = seed.toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    hash = Math.abs(hash);
    const part1 = (hash % 90000) + 10000;
    const p1str = part1.toString();
    let checksum = 0;
    for (let i = 0; i < 5; i++) { checksum += parseInt(p1str[i]) * (i + 1); }
    return p1str + (checksum % 10);
}

function validateVIPID(id) {
    if (!id || id.length !== 6 || isNaN(id)) return false;
    const p1str = id.substring(0, 5);
    const givenChecksum = parseInt(id[5]);
    let calculatedChecksum = 0;
    for (let i = 0; i < 5; i++) { calculatedChecksum += parseInt(p1str[i]) * (i + 1); }
    return givenChecksum === (calculatedChecksum % 10);
}

// ==========================================
// 2. PWA Install Logic
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('pwaBanner');
    if (banner && !window.matchMedia('(display-mode: standalone)').matches) {
        banner.classList.add('show');
    }
});

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                const banner = document.getElementById('pwaBanner');
                if(banner) banner.classList.remove('show');
            }
        });
    } else {
        alert('لطفاً از منوی مرورگر خود گزینه "Add to Home Screen" یا "نصب برنامه" را انتخاب کنید.');
    }
}

// ==========================================
// 3. راه‌اندازی اولیه و مسیریابی (Routing)
// ==========================================
if (!ME || !MY_ID) {
    if (URL_TO_ID) {
        renderGuestWelcome(URL_TO_ID, URL_TO_NAME);
    } else {
        renderMainWelcome();
    }
} else {
    if (!URL_TO_ID) {
        renderDashboard();
    } else {
        initChatApp(URL_TO_ID, URL_TO_NAME);
    }
}

// ==========================================
// 4. صفحات لاگین و داشبورد
// ==========================================
function renderMainWelcome() {
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen">
            <div style="font-size:3rem;margin-bottom:15px">👑</div>
            <h2>خوش آمدید</h2>
            <p>برای ساخت حساب VIP، اطلاعات خودت رو وارد کن.</p>
            
            <div class="input-group" style="margin-top:20px;">
                <label>نام نمایشی شما</label>
                <input id="inputMe" type="text" placeholder="مثلا: ساسان">
            </div>
            
            <div class="input-group">
                <label>شماره موبایل (بدون نیاز به پیامک)</label>
                <input id="inputPhone" type="tel" placeholder="مثلا: 09123456789" maxlength="11">
            </div>
            
            <button class="btn-large" onclick="createNewAccount()">ساخت حساب جدید 🚀</button>
            <button class="btn-link" onclick="renderRestoreScreen()">اکانت قبلی دارم (بازیابی)</button>
            <p style="font-size:0.7rem;margin-top:30px;opacity:0.6">نسخه VIP | امن و رایگان</p>
        </div>
        <div id="pwaBanner" class="pwa-banner">📲 برای تجربه بهتر نصب کنید <button onclick="installPWA()">نصب</button></div>
    `;
}

function renderRestoreScreen() {
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen">
            <div style="font-size:3rem;margin-bottom:15px">🔑</div>
            <h2>بازیابی حساب</h2>
            <p>برای بازیابی، شماره موبایل یا کد VIP خود را وارد کنید.</p>
            <div class="input-group" style="margin-top:20px;">
                <label>شماره موبایل یا کد VIP</label>
                <input id="inputRestoreID" type="text" placeholder="مثلا: 09123456789 یا 123456">
            </div>
            <button class="btn-large" onclick="restoreAccount()">بازیابی 🚀</button>
            <button class="btn-link" onclick="renderMainWelcome()">بازگشت</button>
        </div>
        <div id="pwaBanner" class="pwa-banner">📲 برای تجربه بهتر نصب کنید <button onclick="installPWA()">نصب</button></div>
    `;
}

function createNewAccount() {
    const name = document.getElementById('inputMe').value.trim();
    const phone = document.getElementById('inputPhone').value.trim();
    
    if (!name) return alert('لطفاً نام خود را وارد کنید.');
    if (!phone || phone.length < 10) return alert('لطفاً یک شماره موبایل معتبر وارد کنید.');
    
    const id = generateVIPID(phone); 
    
    localStorage.setItem('vip_me_name', name);
    localStorage.setItem('vip_me_id', id);
    localStorage.setItem('vip_me_phone', phone);
    
    location.reload();
}

function restoreAccount() {
    const input = document.getElementById('inputRestoreID').value.trim();
    if (!input) return alert('لطفاً فیلد را پر کنید.');
    
    // حالت اول: کد VIP ۶ رقمی
    if (input.length === 6 && !isNaN(input)) {
        if (!validateVIPID(input)) return alert('کد VIP نامعتبر است!');
        const name = prompt('کد شما معتبر است! لطفاً نام نمایشی خود را برای بازیابی وارد کنید:');
        if (!name) return;
        if (generateVIPID(input) !== input && generateVIPID(name) !== input) {
             // (توجه: چون ID بر اساس شماره ساخته میشه، اگر شماره نداشته باشه، با اسم چک میکنیم)
        }
        localStorage.setItem('vip_me_name', name);
        localStorage.setItem('vip_me_id', input);
        location.reload();
    } 
    // حالت دوم: شماره موبایل
    else if (input.length >= 10) {
        const phone = input;
        const name = prompt('شماره شما معتبر است! لطفاً نام نمایشی خود را برای بازیابی وارد کنید:');
        if (!name) return;
        const generatedId = generateVIPID(phone);
        localStorage.setItem('vip_me_name', name);
        localStorage.setItem('vip_me_id', generatedId);
        localStorage.setItem('vip_me_phone', phone);
        location.reload();
    } else {
        alert('لطفاً کد VIP ۶ رقمی یا شماره موبایل معتبر وارد کنید.');
    }
}

function renderDashboard() {
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen" style="justify-content:flex-start;padding-top:40px;padding-bottom:100px;">
            <div class="vip-card" onclick="shareInvite()">
                <div class="vip-badge-icon">👑</div>
                <div class="vip-title">شناسه اختصاصی من</div>
                <div class="vip-id">${MY_ID}</div>
                <div class="vip-name">${ME}</div>
                <button class="btn-copy">📋 ارسال دعوت‌نامه</button>
            </div>
            
            <button class="btn-large" onclick="shareInvite()" style="margin-bottom:20px;">🚀 دعوت از دوست جدید</button>
            
            <div style="width:100%; max-width:320px; text-align:right;">
                <h3 style="font-size:0.9rem; color:var(--text-muted); margin-bottom:10px;">چت‌های اخیر شما:</h3>
                <div id="recentChatsList">
                    <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">در حال بارگذاری...</div>
                </div>
            </div>
        </div>
        <div id="pwaBanner" class="pwa-banner">📲 برای تجربه بهتر نصب کنید <button onclick="installPWA()">نصب</button></div>
    `;
    loadRecentChats();
}

async function loadRecentChats() {
    const listDiv = document.getElementById('recentChatsList');
    if (!listDiv) return;
    
    try {
        const GITHUB_TOKEN = CONFIG.GITHUB.TOKEN_PART_1 + CONFIG.GITHUB.TOKEN_PART_2;
        const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues?state=all&per_page=100`, { 
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } 
        });
        if (!res.ok) throw new Error();
        const issues = await res.json();
        
        let myChats = [];
        
        issues.forEach(issue => {
            if (issue.title.startsWith('VIP-')) {
                const parts = issue.title.replace('VIP-', '').split('-');
                if (parts.includes(MY_ID)) {
                    const otherId = parts.find(p => p !== MY_ID);
                    if (otherId) {
                        myChats.push({ id: otherId, roomNumber: issue.number, time: issue.created_at });
                    }
                }
            }
        });
        
        if (myChats.length === 0) {
            listDiv.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem; border:1px dashed var(--border); border-radius:12px;">هنوز کسی به دعوتت جواب نداده است.</div>`;
            return;
        }
        
        listDiv.innerHTML = '';
        myChats.forEach(chat => {
            const div = document.createElement('div');
            div.style.cssText = 'padding:12px; border-radius:12px; background:rgba(128,128,128,.1); margin-bottom:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border);';
            div.innerHTML = `<div><span style="font-size:1.2rem; margin-left:5px;">💬</span> <b>چت جدید</b></div><div style="font-size:0.7rem; color:var(--gold);">شناسه: ${chat.id}</div>`;
            div.onclick = () => {
                window.location.href = `?to=${chat.id}&toName=مخاطب`;
            };
            listDiv.appendChild(div);
        });
        
    } catch(e) {
        listDiv.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444; font-size:0.8rem;">خطا در دریافت لیست.</div>`;
    }
}

function shareInvite() {
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?to=${MY_ID}&toName=${encodeURIComponent(ME)}`;
    const shareText = `سلام! بیا با هم توی چت VIP حرف بزنیم.\nروی این لینک کلیک کن:\n${shareUrl}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'دعوت به چت VIP',
            text: shareText,
            url: shareUrl
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            alert('لینک کپی شد! اون رو برای دوستت بفرست.');
        });
    }
}

function renderGuestWelcome(hostId, hostName) {
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen">
            <div style="font-size:3rem;margin-bottom:15px">💌</div>
            <h2>شما دعوت شده‌اید!</h2>
            <p><b>${hostName || 'یک دوست'}</b> شما را به چت VIP دعوت کرده است. برای شروع، اطلاعات خودتان را وارد کنید.</p>
            
            <div class="input-group" style="margin-top:20px;">
                <label>نام نمایشی شما</label>
                <input id="inputGuestMe" type="text" placeholder="مثلا: حسن">
            </div>
            
            <div class="input-group">
                <label>شماره موبایل شما</label>
                <input id="inputGuestPhone" type="tel" placeholder="مثلا: 09123456789" maxlength="11">
            </div>
            
            <button class="btn-large" onclick="joinAsGuest('${hostId}', '${hostName}')">ورود به چت 🚀</button>
        </div>
        <div id="pwaBanner" class="pwa-banner">📲 برای تجربه بهتر نصب کنید <button onclick="installPWA()">نصب</button></div>
    `;
}

function joinAsGuest(hostId, hostName) {
    const name = document.getElementById('inputGuestMe').value.trim();
    const phone = document.getElementById('inputGuestPhone').value.trim();
    
    if (!name) return alert('لطفاً نام خود را وارد کنید.');
    if (!phone || phone.length < 10) return alert('لطفاً یک شماره موبایل معتبر وارد کنید.');
    
    const id = generateVIPID(phone);
    localStorage.setItem('vip_me_name', name);
    localStorage.setItem('vip_me_id', id);
    localStorage.setItem('vip_me_phone', phone);
    
    window.location.href = `?to=${hostId}&toName=${encodeURIComponent(hostName)}`;
}

// ==========================================
// 5. شروع چت دو نفره و منطق دیتابیس
// ==========================================
async function initChatApp(hostId, hostName) {
    const chatTitleEl = document.getElementById('chatTitle');
    if(chatTitleEl) chatTitleEl.innerText = `چت با ${hostName || 'دوست'}`;
    
    const statusSpan = document.getElementById('presenceStatus');
    if(statusSpan) statusSpan.innerHTML = `متصل | شناسه: <b style="color:var(--gold)">${MY_ID}</b>`;
    
    const sortedIds = [MY_ID, hostId].sort();
    const roomTitle = `VIP-${sortedIds[0]}-${sortedIds[1]}`;
    const typingTitle = `_typing_status_${roomTitle}`;
    
    initThemeAndAvatar();
    setupUI();
    setupBackground();
    
    if (savedPin) {
        const pinScreen = document.getElementById('pinScreen');
        if(pinScreen) pinScreen.style.display = 'flex';
    }
    
    const ambientLayer = document.createElement('div'); ambientLayer.id = 'ambientLayer'; document.getElementById('app').prepend(ambientLayer);
    const avatarEl = document.getElementById('avatarEl'); 
    if(avatarEl) {
        const aura = document.createElement('div'); aura.className = 'avatar-aura'; avatarEl.parentElement.classList.add('avatar-wrapper'); avatarEl.parentElement.prepend(aura);
    }
    const hint = document.createElement('div'); hint.className = 'dream-hint'; hint.innerText = '✨ در حال رویا... برای بیدار شدن لمس کن ✨'; document.body.appendChild(hint);
    
    ISSUE_NUMBER = await DataAdapter.getRoom(roomTitle);
    TYPING_ISSUE_NUM = await DataAdapter.getRoom(typingTitle);
    
    if (!ISSUE_NUMBER) { 
        if(statusSpan) statusSpan.innerText = 'خطا در اتصال'; 
        return; 
    }
    
    await fetchAndRenderMessages(true);
    setInterval(() => fetchAndRenderMessages(false), 2500);
    setInterval(checkTypingStatus, 2500);
}

async function fetchAndRenderMessages(isInitial = false) {
    if (!ISSUE_NUMBER) return;
    
    if (isInitial) {
        const cached = localStorage.getItem(`cache_${MY_ID}_${URL_TO_ID}`);
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
    
    localStorage.setItem(`cache_${MY_ID}_${URL_TO_ID}`, JSON.stringify(newMessages));
    
    let unreadDividerAdded = false;
    if (isInitial) { document.getElementById('chatArea').innerHTML = `<div class="pill">امروز</div>`; renderedMsgIds.clear(); }
    
    newMessages.forEach((msg, index) => {
        const isMe = msg.body.startsWith(ME + ': ');
        if (!isMe && !msg.body.startsWith(URL_TO_NAME + ': ')) return; 
        
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
        if (lastId > lastReadMsgId) { lastReadMsgId = lastId; localStorage.setItem(`lastRead_${MY_ID}_${URL_TO_ID}`, lastId); }
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

// ==========================================
// 6. ابزارهای کمکی
// ==========================================
function encryptText(text) { if(!CONFIG.FEATURES.E2EE) return text; const key = 'ch4t-s3cr3t-k3y'; let result = ''; for(let i = 0; i < text.length; i++) result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)); return btoa(unescape(encodeURIComponent(result))); }
function decryptText(encoded) { if(!CONFIG.FEATURES.E2EE) return encoded; try { const key = 'ch4t-s3cr3t-k3y'; const text = decodeURIComponent(escape(atob(encoded))); let result = ''; for(let i = 0; i < text.length; i++) result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length)); return result; } catch(e) { return encoded; } }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stringToColor(str) { let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); let color = '#'; for (let i = 0; i < 3; i++) { let value = (hash >> (i * 8)) & 0xFF; color += ('00' + value.toString(16)).substr(-2); } return color; }

// ==========================================
// 7. نمایش پیام
// ==========================================
function renderMessage(text, isMe, timestamp, msgId, reaction, isRead, replyHtml, isNew = true, isDestruct = false) {
    const chatArea = document.getElementById('chatArea');
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap' + (isMe ? ' me' : ''); wrap.dataset.id = msgId;
    if (!isNew || msgId.toString().startsWith('temp')) wrap.style.animation = 'none';
    const time = new Date(timestamp).toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'});
    
    let contentHtml = '';
    if (text.startsWith('[IMG]')) contentHtml = `<img src="${text.replace('[IMG]', '')}" class="media-img">`;
    else if (text.startsWith('[AUDIO]')) {
        const audioSrc = text.replace('[AUDIO]', '');
        contentHtml = `<div class="custom-audio" onclick="playAudio(this, '${audioSrc}')"><div class="audio-play-btn">▶️</div><div class="audio-waveform"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><div class="audio-duration">ویس</div></div>`;
    }
    else if (text.startsWith('[LOC]')) {
        const coords = text.replace('[LOC]', '');
        contentHtml = `<a href="https://www.google.com/maps/search/?api=1&query=${coords}" target="_blank" class="music-card"><div class="music-icon" style="background:#10b981">📍</div><div class="music-details"><div class="music-title">موقعیت مکانی</div><div class="music-subtitle">برای دیدن نقشه کلیک کنید</div></div></a>`;
    } else if (text.startsWith('[MUSIC]')) {
        const parts = text.replace('[MUSIC]', '').split('|||');
        const audioUrl = parts[0] || ''; const title = parts[1] || ''; const artist = parts[2] || ''; const artwork = parts[3] || '';
        contentHtml = `<div class="music-card-full" style="flex-direction:column; padding:0;"><div style="padding:12px; display:flex; gap:12px; align-items:center; width:100%;"><img src="${artwork}" class="mc-art" onerror="this.style.display='none'"><div class="mc-info"><div class="mc-title">${escapeHtml(title)}</div><div class="mc-artist">${escapeHtml(artist)}</div></div></div><div class="custom-music-player"><button class="audio-play-btn" onclick="playFullMusic(this, '${audioUrl}')">▶️</button><div style="flex:1; font-size:0.8rem; color:var(--text-muted)">آهنگ کامل</div></div></div>`;
    } else {
        contentHtml = `<p>${escapeHtml(text)}</p>`;
    }
    
    const destructHtml = isDestruct ? `<div class="destruct-badge">💣 پیام خودتخریب</div>` : '';
    const contextMenu = document.createElement('div'); contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `<div class="emoji-row">${['❤️','😂','😮','👍','🔥'].map(e => `<span onclick="addReaction(${msgId}, '${e}', event)">${e}</span>`).join('')}</div><div class="menu-actions"><button onclick="startReply(${msgId}, '${escapeHtml(text.substring(0,20))}...')">↩️ پاسخ</button><button onclick="playTTS('${escapeHtml(text.replace(/[\\'\\n\\r]/g, ''))}')">🔊 خواندن</button><button onclick="createPostcard(${msgId})">🖼️ کارت پستال</button>${isMe ? `<button onclick="deleteMessage(${msgId})" style="color:#ef4444">🗑️ حذف</button>` : ''}</div>`;
    const tickHtml = isMe ? `<span class="tick ${isRead ? 'read' : ''}">${isRead ? '✓✓' : '🕒'}</span>` : '';
    
    wrap.innerHTML = `<div class="msg-bubble" id="bubble-${msgId}">${replyHtml || ''}${destructHtml}${contentHtml}<div class="msg-meta"><span>${time}</span>${tickHtml}</div><div class="reaction-badge" style="${reaction ? 'display:block' : ''}">${reaction || ''}</div></div>`;
    wrap.appendChild(contextMenu);
    
    let pressTimer = null, touchStartX = 0, touchStartY = 0; const bubble = wrap.querySelector('.msg-bubble');
    bubble.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; pressTimer = setTimeout(() => { contextMenu.style.display = 'flex'; vibrate('react'); }, 500); });
    bubble.addEventListener('touchmove', (e) => { clearTimeout(pressTimer); let diffX = e.touches[0].clientX - touchStartX, diffY = Math.abs(e.touches[0].clientY - touchStartY); if (diffY < 30 && diffX > 0 && diffX < 80) bubble.style.transform = `translateX(${diffX}px)`; });
    bubble.addEventListener('touchend', (e) => { clearTimeout(pressTimer); let diffX = e.changedTouches[0].clientX - touchStartX, diffY = Math.abs(e.changedTouches[0].clientY - touchStartY); bubble.style.transform = 'translateX(0)'; if (diffY < 30 && diffX > 60) { startReply(msgId, text.substring(0,20)+'...'); vibrate('react'); } });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) contextMenu.style.display = 'none'; });
    
    chatArea.appendChild(wrap); chatArea.scrollTop = chatArea.scrollHeight;
    if (isDestruct && !isMe && !msgId.toString().startsWith('temp')) setTimeout(() => { deleteMessage(msgId, true); }, 10000);
}

window.playAudio = (el, src) => { if (currentAudioPlayer) { currentAudioPlayer.pause(); document.querySelectorAll('.custom-audio').forEach(a => a.classList.remove('playing')); } if (currentAudioPlayer && currentAudioPlayer.src === src) { currentAudioPlayer = null; return; } const audio = new Audio(src); audio.play(); currentAudioPlayer = audio; el.classList.add('playing'); el.querySelector('.audio-play-btn').innerText = '⏸️'; audio.onended = () => { el.classList.remove('playing'); el.querySelector('.audio-play-btn').innerText = '▶️'; currentAudioPlayer = null; }; };
window.playFullMusic = (btn, src) => { if (currentCardAudio) { currentCardAudio.pause(); } if (currentCardAudio && currentCardAudio.src === src) { currentCardAudio = null; btn.innerText = '▶️'; return; } const audio = new Audio(src); audio.play(); currentCardAudio = audio; btn.innerText = '⏸️'; audio.onended = () => { btn.innerText = '▶️'; currentCardAudio = null; }; };

// ==========================================
// 8. توابع کنش‌ها
// ==========================================
async function sendMessage(text = null) {
    const input = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');
    const msgText = text || input.value.trim(); if (!msgText || !ISSUE_NUMBER) return;
    if (!text) { input.value = ''; input.style.height = 'auto'; sendBtn.innerText = '🎤'; }
    
    let finalBody = `${ME}: `; if (replyToId) finalBody += `[R:${replyToId}] `; if (isDestructMode) finalBody += `[DESTRUCT] `;
    if (msgText.startsWith('[IMG]') || msgText.startsWith('[AUDIO]') || msgText.startsWith('[LOC]') || msgText.startsWith('[MUSIC]')) finalBody += msgText;
    else finalBody += encryptText(msgText);
    
    if (!msgText.startsWith('[') && (msgText.includes('تولد') || msgText.includes('دوستت دارم') || msgText.includes('Happy') || msgText.includes('love'))) triggerEmojiRain();
    
    renderMessage(msgText, true, new Date().toISOString(), 'temp-' + Date.now(), null, false, null, true, isDestructMode);
    playSynthSound('send'); vibrate('send');
    cancelReply(); if (isDestructMode) toggleDestruct();
    
    const success = await DataAdapter.sendMessage(ISSUE_NUMBER, finalBody);
    if (success) { lastETag = null; setTimeout(() => fetchAndRenderMessages(true), 500); }
}

async function addReaction(msgId, emoji, event) {
    const rect = event.target.getBoundingClientRect(); const floatEl = document.createElement('div');
    floatEl.className = 'float-emoji'; floatEl.innerText = emoji; floatEl.style.left = rect.left + 'px'; floatEl.style.top = rect.top + 'px';
    document.body.appendChild(floatEl); setTimeout(() => floatEl.remove(), 1000);
    playSynthSound('react'); vibrate('react');
    try {
        const GITHUB_TOKEN = CONFIG.GITHUB.TOKEN_PART_1 + CONFIG.GITHUB.TOKEN_PART_2;
        const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/comments/${msgId}`, { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } });
        const data = await res.json();
        let newBody = data.body.replace(/\s*\{([^\}]+)\}\s*$/, ''); 
        const isRead = newBody.includes('[READ]'); newBody = newBody.replace('[READ]', '').trim();
        newBody += ` {${emoji}}`; if (isRead) newBody += ` [READ]`;
        await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/comments/${msgId}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ body: newBody }) });
    } catch(e) {}
}

async function deleteMessage(msgId, silent = false) {
    if(!silent && !confirm('حذف شود؟')) return;
    playSynthSound('delete'); vibrate('delete');
    await DataAdapter.deleteMessage(msgId);
    const wrap = document.querySelector(`.msg-wrap[data-id="${msgId}"]`);
    if(wrap) { if (silent) { wrap.style.transition = 'opacity 1s, transform 1s'; wrap.style.opacity = '0'; wrap.style.transform = 'scale(0.8)'; setTimeout(() => wrap.remove(), 1000); } else { wrap.remove(); } }
}

function playTTS(text) { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); u.lang = 'fa-IR'; window.speechSynthesis.speak(u); } document.querySelectorAll('.context-menu').forEach(m => m.style.display='none'); }
function startReply(id, textPreview) { replyToId = id; const input = document.getElementById('msgInput'); input.value = textPreview; input.focus(); input.placeholder = "پاسخ به: " + textPreview; document.querySelectorAll('.context-menu').forEach(m => m.style.display='none'); }
function cancelReply() { replyToId = null; document.getElementById('msgInput').placeholder = "پیامی بنویسید..."; }

// ==========================================
// 9. تنظیمات UI
// ==========================================
function initThemeAndAvatar() {
    const themeBtn = document.getElementById('themeBtn');
    if(!themeBtn) return;
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeBtn.innerText = currentTheme === 'dark' ? '🌙' : '☀️';
    themeBtn.onclick = () => { const isDark = document.documentElement.getAttribute('data-theme') === 'dark'; const newTheme = isDark ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', newTheme); localStorage.setItem('theme', newTheme); themeBtn.innerText = newTheme === 'dark' ? '🌙' : '☀️'; };
    const avatarEl = document.getElementById('avatarEl');
    if(!avatarEl) return;
    const savedEmoji = localStorage.getItem(`avatar_${ME}`) || ME.charAt(0).toUpperCase();
    avatarEl.innerText = savedEmoji;
    avatarEl.style.background = `linear-gradient(135deg, ${stringToColor(ME)}, ${stringToColor(ME + 'x')})`;
    avatarEl.onclick = () => { document.getElementById('emojiOverlay').style.display = 'flex'; };
    const savedWall = localStorage.getItem(`wall_${ME}`);
    if (savedWall) { document.getElementById('wallpaper').style.backgroundImage = `url(${savedWall})`; document.getElementById('wallpaper').style.opacity = '0.3'; }
}

function setupUI() {
    const input = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');
    const fileInput = document.getElementById('fileInput');
    const chatArea = document.getElementById('chatArea');
    const scrollBtn = document.getElementById('scrollBtn');
    const avatarWrapper = document.querySelector('.avatar-wrapper');

    if(!input || !sendBtn) return;

    input.addEventListener('input', function() {
        this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px';
        updateTypingStatus();
        if (this.value.trim() === '') { sendBtn.innerText = '🎤'; } else { sendBtn.innerText = '➤'; }
        if (avatarWrapper) { if (this.value.trim() !== '') avatarWrapper.classList.add('typing'); else avatarWrapper.classList.remove('typing'); }
    });
    
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.value.trim() !== '') sendMessage(); } });
    
    sendBtn.addEventListener('click', () => { 
        if (input.value.trim() !== '') { sendMessage(); } 
        else { if (isRecordingVoice) { stopVoiceRecording(); } else { startVoiceRecording(); } } 
    });

    document.getElementById('attachBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'), MAX_WIDTH = 400; const scaleSize = MAX_WIDTH / img.width; canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); sendMessage(`[IMG]${canvas.toDataURL('image/jpeg', 0.6)}`); fileInput.value = ''; }; img.src = event.target.result; }; reader.readAsDataURL(file); });

    chatArea.addEventListener('scroll', () => { const isNearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 100; scrollBtn.style.opacity = isNearBottom ? '0' : '1'; scrollBtn.style.pointerEvents = isNearBottom ? 'none' : 'auto'; });
    window.scrollToBottom = () => { chatArea.scrollTop = chatArea.scrollHeight; };
    
    document.getElementById('wallInput').addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { localStorage.setItem(`wall_${ME}`, ev.target.result); document.getElementById('wallpaper').style.backgroundImage = `url(${ev.target.result})`; document.getElementById('wallpaper').style.opacity = '0.3'; }; reader.readAsDataURL(file); });
    
    window.setAvatar = (emoji) => { localStorage.setItem(`avatar_${ME}`, emoji); document.getElementById('avatarEl').innerText = emoji; document.getElementById('emojiOverlay').style.display = 'none'; };
    window.toggleSearch = () => { const sb = document.getElementById('searchBox'); sb.style.display = sb.style.display === 'block' ? 'none' : 'block'; if (sb.style.display === 'block') document.getElementById('searchInput').focus(); else { document.getElementById('searchInput').value = ''; filterMessages(); } };
    window.filterMessages = () => { const q = document.getElementById('searchInput').value.toLowerCase(); document.querySelectorAll('.msg-bubble').forEach(b => { if (q === '') b.parentElement.style.display = 'flex'; else if (b.innerText.toLowerCase().includes(q)) b.parentElement.style.display = 'flex'; else b.parentElement.style.display = 'none'; }); };
    window.togglePinScreen = () => { if (savedPin) { if(confirm('رمز فعلی حذف شود؟')) { localStorage.removeItem('chatPin'); location.reload(); } } else { const newPin = prompt('رمز ۴ رقمی جدید:'); if (newPin && newPin.length === 4 && !isNaN(newPin)) { localStorage.setItem('chatPin', newPin); alert('رمز تنظیم شد.'); } } };
    window.enterPin = (num) => { if (pinBuffer.length < 4) { pinBuffer += num; updatePinDots(); } };
    window.clearPin = () => { pinBuffer = ''; updatePinDots(); };
    window.updatePinDots = () => { document.querySelectorAll('.pin-dots div').forEach((dot, i) => { dot.classList.toggle('filled', i < pinBuffer.length); }); if (pinBuffer.length === 4) setTimeout(window.submitPin, 200); };
    window.submitPin = () => { if (pinBuffer === savedPin) { document.getElementById('pinScreen').style.display = 'none'; pinBuffer = ''; } else { alert('رمز اشتباه!'); window.clearPin(); } };
    
    window.toggleDestruct = () => { isDestructMode = !isDestructMode; const btn = document.getElementById('destructBtn'); if(isDestructMode) { btn.classList.add('destruct-active'); } else { btn.classList.remove('destruct-active'); } vibrate('react'); };
    window.sendLocation = () => { if (!navigator.geolocation) return alert('مرورگر شما از موقعیت مکانی پشتیبانی نمی‌کند.'); navigator.geolocation.getCurrentPosition((pos) => { sendMessage(`[LOC]${pos.coords.latitude},${pos.coords.longitude}`); }, (error) => { let msg = 'خطا در دریافت موقعیت: '; switch(error.code) { case error.PERMISSION_DENIED: msg += 'شما دسترسی به موقعیت را رد کردید.'; break; case error.POSITION_UNAVAILABLE: msg += 'اطلاعات موقعیت در دسترس نیست.'; break; case error.TIMEOUT: msg += 'زمان درخواست به پایان رسید.'; break; default: msg += 'خطای نامشخص.'; break; } alert(msg); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }); };
    
    window.toggleSidebar = () => { document.getElementById('sidebar').classList.toggle('open'); };
}

// ==========================================
// 10. تایپینگ، ویس و میکروفون
// ==========================================
let lastTypingTime = 0;
async function updateTypingStatus() { if (!TYPING_ISSUE_NUM) return; const now = Date.now(); if (now - lastTypingTime < 2000) return; lastTypingTime = now; await DataAdapter.updateTyping(TYPING_ISSUE_NUM, ME, now); }
async function checkTypingStatus() { if (!TYPING_ISSUE_NUM) return; const body = await DataAdapter.checkTyping(TYPING_ISSUE_NUM); if (body) { const [user, timeStr] = body.split('|'); if (user === URL_TO_NAME && Date.now() - Number(timeStr) < 5000) { document.getElementById('typingArea').innerHTML = `${URL_TO_NAME} در حال نوشتن <div class="typing-dots"><span></span><span></span><span></span></div>`; } else { document.getElementById('typingArea').innerHTML = ''; } } }

async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream); audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => { const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); const reader = new FileReader(); reader.readAsDataURL(audioBlob); reader.onloadend = () => { sendMessage(`[AUDIO]${reader.result}`); }; stream.getTracks().forEach(track => track.stop()); };
        mediaRecorder.start(); 
        isRecordingVoice = true; 
        recordingStartTime = Date.now();
        const sendBtn = document.getElementById('sendBtn');
        sendBtn.innerText = '⏹️'; 
        sendBtn.parentElement.classList.add('recording-active');
        recordingTimerInterval = setInterval(() => { const seconds = Math.floor((Date.now() - recordingStartTime) / 1000); sendBtn.innerText = `⏹️ ${seconds}s`; }, 1000);
        vibrate('error');
    } catch (err) { alert('دسترسی به میکروفون داده نشد!'); }
}

function stopVoiceRecording() { 
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); 
    isRecordingVoice = false; 
    clearInterval(recordingTimerInterval);
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.innerText = '🎤'; 
    sendBtn.parentElement.classList.remove('recording-active');
}

// ==========================================
// 11. موزیک (جستجوی JioSaavn)
// ==========================================
window.openMusicSearch = () => { document.getElementById('musicSearchOverlay').style.display = 'flex'; setTimeout(() => document.getElementById('musicSearchInput').focus(), 200); };
window.closeMusicSearch = () => { document.getElementById('musicSearchOverlay').style.display = 'none'; document.getElementById('musicSearchInput').value = ''; document.getElementById('musicSearchResults').innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:.9rem">اسم آهنگ یا خواننده رو بنویس و جستجو کن 🎵</div>'; if (currentPreviewAudio) { currentPreviewAudio.pause(); currentPreviewAudio = null; } };

window.doMusicSearch = async () => {
    const query = document.getElementById('musicSearchInput').value.trim(); if (!query) return;
    const resultsDiv = document.getElementById('musicSearchResults'); resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">⏳ در حال جستجو...</div>';
    
    try {
        const res = await fetch(`https://jiosaavn-api-private.vercel.app/search/songs?query=${encodeURIComponent(query)}&limit=10`);
        const result = await res.json();
        
        if (!result.data || !result.data.results || result.data.results.length === 0) { resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">نتیجه‌ای یافت نشد 😔</div>'; return; }
        
        resultsDiv.innerHTML = ''; let count = 0;
        result.data.results.forEach((track) => {
            if (!track.downloadUrl || track.downloadUrl.length === 0) return; count++;
            let audioUrl = '';
            for(let i = track.downloadUrl.length - 1; i >= 0; i--) { if(track.downloadUrl[i].quality === '320kbps' || track.downloadUrl[i].quality === '160kbps') { audioUrl = track.downloadUrl[i].link; break; } }
            if(!audioUrl) audioUrl = track.downloadUrl[track.downloadUrl.length - 1].link;
            
            const div = document.createElement('div'); div.className = 'music-result-item';
            div.innerHTML = `<img src="${track.image[0].link}" class="music-result-art"><div class="music-result-info"><div class="music-result-title">${escapeHtml(track.name || '')}</div><div class="music-result-artist">${escapeHtml(track.primaryArtists || '')}</div></div><div class="music-result-actions"><button class="play-btn" data-url="${audioUrl}">▶️</button><button class="send-btn-sm" style="background:linear-gradient(135deg,var(--accent),#a855f7);color:white">📤</button></div>`;
            resultsDiv.appendChild(div);
            
            const playBtn = div.querySelector('.play-btn'); const sendBtn = div.querySelector('.send-btn-sm');
            playBtn.addEventListener('click', () => { if (currentPreviewAudio) { currentPreviewAudio.pause(); document.querySelectorAll('.play-btn').forEach(b => b.innerText = '▶️'); } if (currentPreviewAudio && currentPreviewAudio.src === audioUrl) { currentPreviewAudio = null; return; } const audio = new Audio(audioUrl); audio.play(); currentPreviewAudio = audio; playBtn.innerText = '⏸'; audio.onended = () => { playBtn.innerText = '▶️'; currentPreviewAudio = null; }; });
            sendBtn.addEventListener('click', () => { const safeTitle = (track.name || '').replace(/\|\|\|/g, '').replace(/\n/g, ' '); const safeArtist = (track.primaryArtists || '').replace(/\|\|\|/g, '').replace(/\n/g, ' '); sendMessage(`[MUSIC]${audioUrl}|||${safeTitle}|||${safeArtist}|||${track.image[0].link}`); window.closeMusicSearch(); });
        });
        if (count === 0) resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">آهنگی پیدا نشد.</div>';
    } catch(e) { resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444">خطا در جستجو. لطفا اتصال اینترنت را بررسی کنید.</div>'; }
};

// ==========================================
// 12. پس زمینه، افکت‌ها و صدا
// ==========================================
function setupBackground() {
    const canvas=document.getElementById("bgCanvas"), ctx=canvas.getContext("2d");
    let particles=[], mouseX = 0, mouseY = 0;
    function resizeCanvas(){canvas.width=canvas.parentElement.clientWidth;canvas.height=canvas.parentElement.clientHeight;}
    resizeCanvas(); window.addEventListener("resize",resizeCanvas);
    for(let i=0;i<50;i++){particles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.8+0.5,dx:(Math.random()-.5)*0.3,dy:(Math.random()-.5)*0.3-0.15,a:Math.random()*0.6+0.2,depth:Math.random()*0.5+0.1});}
    window.addEventListener('mousemove', e => { mouseX = (e.clientX - window.innerWidth/2) * 0.05; mouseY = (e.clientY - window.innerHeight/2) * 0.05; });
    window.addEventListener('touchmove', e => { mouseX = (e.touches[0].clientX - window.innerWidth/2) * 0.05; mouseY = (e.touches[0].clientY - window.innerHeight/2) * 0.05; });
    function renderParticles(){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        let vol = 0; if (analyser && isMusicPlaying) { const data = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(data); vol = data.reduce((a,b)=>a+b,0) / data.length; }
        particles.forEach(p=>{
            p.x+=p.dx; p.y+=p.dy; if(p.x<0)p.x=canvas.width; if(p.x>canvas.width)p.x=0; if(p.y<0)p.y=canvas.height; if(p.y>canvas.height)p.y=0;
            let drawX = p.x + (mouseX * p.depth), drawY = p.y + (mouseY * p.depth), drawRadius = p.r + (vol * 0.02);
            ctx.beginPath(); ctx.arc(drawX,drawY,drawRadius,0,Math.PI*2); ctx.fillStyle=`rgba(165,180,252,${p.a + (vol*0.005)})`; ctx.fill();
        });
        requestAnimationFrame(renderParticles);
    }
    renderParticles();
}

function triggerEmojiRain() { const emojis = ['🎉','🎈','❤️','✨','🎊','💖','🌟','🥳']; for(let i=0; i<30; i++) { setTimeout(() => { const el = document.createElement('div'); el.className = 'emoji-rain'; el.innerText = emojis[Math.floor(Math.random()*emojis.length)]; el.style.left = Math.random() * 100 + 'vw'; el.style.animationDuration = (Math.random() * 2 + 1.5) + 's'; document.body.appendChild(el); setTimeout(() => el.remove(), 3500); }, i * 50); } }

function createPostcard(msgId) {
    const bubble = document.getElementById(`bubble-${msgId}`); if(!bubble) return;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = 800; canvas.height = 600;
    const grad = ctx.createLinearGradient(0, 0, 800, 600); grad.addColorStop(0, '#6366f1'); grad.addColorStop(1, '#a855f7');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 800, 600); ctx.fillStyle = 'white'; ctx.font = 'bold 40px Tahoma, Arial'; ctx.textAlign = 'center';
    const text = bubble.querySelector('p') ? bubble.querySelector('p').innerText : '[پیام رسانه‌ای]';
    const words = text.split(' '); let line = '', y = 250;
    for(let n = 0; n < words.length; n++) { const testLine = line + words[n] + ' '; if(ctx.measureText(testLine).width > 700) { ctx.fillText(line, 400, y); line = words[n] + ' '; y += 60; } else { line = testLine; } }
    ctx.fillText(line, 400, y); ctx.font = '24px Tahoma'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(`از طرف ${ME} برای ${URL_TO_NAME}`, 400, 500);
    const dataUrl = canvas.toDataURL('image/png'); const a = document.createElement('a'); a.href = dataUrl; a.download = 'postcard.png'; a.click();
}

function playSynthSound(type) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime; const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    if (type === 'send') { osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.exponentialRampToValueAtTime(800, now + 0.15); gain.gain.setValueAtTime(0.08, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2); osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.2); }
    else if (type === 'receive') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); osc.frequency.setValueAtTime(660, now + 0.08); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.3); }
    else if (type === 'react') { osc.type = 'triangle'; osc.frequency.setValueAtTime(1500, now); gain.gain.setValueAtTime(0.06, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1); osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.1); }
    else if (type === 'delete') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.3); gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3); osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.3); }
}

function vibrate(type) { if (!navigator.vibrate) return; const HAPTICS = { send: [20], receive: [15, 30, 15], react: [10, 15, 10, 15, 10], delete: [60], error: [100, 50, 100] }; try { navigator.vibrate(HAPTICS[type] || [10]); } catch(e) {} }

function toggleMusic() {
    if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 32; analyser.connect(audioCtx.destination); }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const btn = document.getElementById('musicBtn');
    if (isMusicPlaying) { clearInterval(chordInterval); isMusicPlaying = false; btn.innerText = '🔇'; }
    else { isMusicPlaying = true; btn.innerText = '🎵'; playChord(); chordInterval = setInterval(playChord, 3500); }
}
function playChord() {
    if (!audioCtx) return; const now = audioCtx.currentTime; const currentChord = chords[chordIdx % chords.length]; chordIdx++;
    currentChord.forEach((freq, i) => {
        const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), filter = audioCtx.createBiquadFilter();
        osc.type = 'sine'; osc.frequency.setValueAtTime(freq, now + i * 0.1); filter.type = 'lowpass'; filter.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.03, now + i * 0.1 + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
        osc.connect(filter); filter.connect(gain); gain.connect(analyser); osc.start(now + i * 0.1); osc.stop(now + 4);
    });
}

// ==========================================
// 13. Dream Mode
// ==========================================
function resetDreamTimer() { clearTimeout(dreamTimer); document.body.classList.remove('dream-mode'); dreamTimer = setTimeout(() => { document.body.classList.add('dream-mode'); }, 60000); }
['touchstart', 'mousedown', 'keydown', 'scroll'].forEach(evt => { document.addEventListener(evt, resetDreamTimer, { passive: true }); });
resetDreamTimer();

function updateCircadianAmbient() {
    const hour = new Date().getHours();
    const root = document.documentElement;
    if (hour >= 5 && hour < 10) { root.style.setProperty('--ambient-1', '#fbbf24'); root.style.setProperty('--ambient-2', '#f59e0b'); root.style.setProperty('--accent', '#f59e0b'); }
    else if (hour >= 10 && hour < 16) { root.style.setProperty('--ambient-1', '#38bdf8'); root.style.setProperty('--ambient-2', '#0ea5e9'); root.style.setProperty('--accent', '#0ea5e9'); }
    else if (hour >= 16 && hour < 20) { root.style.setProperty('--ambient-1', '#f97316'); root.style.setProperty('--ambient-2', '#a855f7'); root.style.setProperty('--accent', '#a855f7'); }
    else { root.style.setProperty('--ambient-1', '#1e1b4b'); root.style.setProperty('--ambient-2', '#312e81'); root.style.setProperty('--accent', '#6366f1'); }
}
updateCircadianAmbient();
setInterval(updateCircadianAmbient, 60000);
