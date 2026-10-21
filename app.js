// ==========================================
// 4. لایه منطق (App Logic Layer)
// ==========================================
const params = new URLSearchParams(window.location.search);
const ME = params.get('me');
const TO = params.get('to');

let ISSUE_NUMBER = null, TYPING_ISSUE_NUM = null, lastETag = null;
let replyToId = null, lastReadMsgId = Number(localStorage.getItem(`lastRead_${ME}_${TO}`)) || 0;
let renderedMsgIds = new Set(), isDestructMode = false;
let mediaRecorder = null, audioChunks = [], isRecordingVoice = false;
let currentPreviewAudio = null, currentPreviewBtn = null;
let currentCardAudio = null, currentCardBtn = null;
let audioCtx = null, isMusicPlaying = false, chordInterval = null, analyser = null;
const chords = [[261.63, 329.63, 392.00, 493.88], [220.00, 261.63, 329.63, 392.00], [174.61, 220.00, 261.63, 329.63], [196.00, 246.94, 293.66, 349.23]];
let chordIdx = 0, pinBuffer = '';
const savedPin = localStorage.getItem('chatPin');

// ==========================================
// 1. راه‌اندازی اولیه
// ==========================================
if (!ME || !TO) {
    document.getElementById('app').innerHTML = `
        <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;padding:30px;background:var(--app-bg);backdrop-filter:blur(30px)">
            <div style="font-size:3rem;margin-bottom:15px">👋</div>
            <h2 style="color:var(--text);margin-bottom:8px;font-size:1.4rem">خوش آمدید</h2>
            <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:25px;text-align:center">برای شروع چت، لطفاً اطلاعات خود را وارد کنید</p>
            <input id="loginMe" type="text" placeholder="اسم خودت چیه؟" style="width:100%;max-width:300px;padding:14px 18px;border-radius:14px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:.95rem;outline:none;margin-bottom:12px;text-align:center;font-family:inherit">
            <input id="loginTo" type="text" placeholder="با کی میخوای چت کنی؟" style="width:100%;max-width:300px;padding:14px 18px;border-radius:14px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:.95rem;outline:none;margin-bottom:24px;text-align:center;font-family:inherit">
            <button onclick="startLogin()" style="width:100%;max-width:300px;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,#6366f1,#ec4899);color:white;font-size:1rem;font-weight:700;cursor:pointer;font-family:inherit">ورود به چت 🚀</button>
            <p style="color:var(--text-muted);font-size:.7rem;margin-top:20px">${CONFIG.APP_NAME} | v${CONFIG.VERSION}</p>
        </div>
    `;
} else {
    initChatApp();
}

function startLogin() {
    const meVal = document.getElementById('loginMe').value.trim();
    const toVal = document.getElementById('loginTo').value.trim();
    if (!meVal || !toVal) return alert('لطفاً هر دو کادر را پر کنید.');
    window.location.href = `?me=${encodeURIComponent(meVal)}&to=${encodeURIComponent(toVal)}`;
}

async function initChatApp() {
    document.getElementById('chatTitle').innerText = `چت با ${TO}`;
    initThemeAndAvatar();
    await startDatabaseConnection();
    setupUI();
    setupBackground();
    if (savedPin) document.getElementById('pinScreen').style.display = 'flex';
}

// ==========================================
// 2. اتصال به دیتابیس
// ==========================================
async function startDatabaseConnection() {
    const presenceStatus = document.getElementById('presenceStatus');
    presenceStatus.innerText = 'در حال جستجو...';
    const roomTitle = `Chat-${[ME.toLowerCase().trim(), TO.toLowerCase().trim()].sort().join('-')}`;
    ISSUE_NUMBER = await DataAdapter.getRoom(roomTitle);
    const typingTitle = `_typing_status_${roomTitle}`;
    TYPING_ISSUE_NUM = await DataAdapter.getRoom(typingTitle);
    if (!ISSUE_NUMBER) { presenceStatus.innerText = 'خطا در اتصال'; return; }
    presenceStatus.innerText = 'متصل';
    await fetchAndRenderMessages(true);
    setInterval(() => fetchAndRenderMessages(false), 2500);
    setInterval(checkTypingStatus, 2500);
}

// ==========================================
// 3. منطق دریافت پیام‌ها
// ==========================================
async function fetchAndRenderMessages(isInitial = false) {
    if (!ISSUE_NUMBER) return;
    const result = await DataAdapter.fetchMessages(ISSUE_NUMBER, isInitial ? null : lastETag);
    if (result.notModified || result.error) return;
    lastETag = result.etag;
    const newMessages = result.data;
    let unreadDividerAdded = false;
    if (isInitial) { document.getElementById('chatArea').innerHTML = `<div class="pill">امروز</div>`; renderedMsgIds.clear(); }
    
    newMessages.forEach((msg) => {
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
            const originalMsg = newMessages.find(m => m.id == replyMatch[1]);
            if (originalMsg) {
                const origColon = originalMsg.body.indexOf(': ');
                let origText = originalMsg.body.substring(origColon + 2).replace(/^\[R:\d+\]\s*/, '').replace('[READ]', '').replace('[DESTRUCT]', '').trim();
                if(origText.includes('[IMG]')) origText = '🖼️ عکس';
                if(origText.includes('[AUDIO]')) origText = '🎤 پیام صوتی';
                if(origText.includes('[MUSIC]')) origText = '🎵 آهنگ';
                if(origText.includes('http')) origText = '🔗 لینک';
                else origText = decryptText(origText);
                replyHtml = `<div class="reply-quote">${originalMsg.body.substring(0, origColon)}: ${escapeHtml(origText.substring(0,30))}...</div>`;
            }
            rawText = rawText.replace(/^\[R:\d+\]\s*/, '');
        }
        
        let reaction = null;
        const reactionMatch = rawText.match(/\s*\{([^\}]+)\}\s*$/);
        if (reactionMatch) { reaction = reactionMatch[1]; rawText = rawText.replace(/\s*\{([^\}]+)\}\s*$/, '').trim(); }
        
        let text = rawText;
        if (!text.startsWith('[IMG]') && !text.startsWith('[AUDIO]') && !text.startsWith('[LOC]') && !text.startsWith('[MUSIC]')) {
            text = decryptText(text);
        }

        if (sender !== ME && sender !== TO) return;
        const isMe = sender === ME;
        
        if (isInitial && !isMe && msg.id > lastReadMsgId && !unreadDividerAdded) {
            const divider = document.createElement('div'); divider.className = 'unread-divider'; divider.innerText = 'پیام‌های جدید';
            document.getElementById('chatArea').appendChild(divider); unreadDividerAdded = true;
        }
        
        if (!renderedMsgIds.has(msg.id)) {
            renderMessage(text, isMe, msg.created_at, msg.id, reaction, isRead, replyHtml, isMe, isDestruct);
            renderedMsgIds.add(msg.id);
        } else {
            const existingWrap = document.querySelector(`.msg-wrap[data-id="${msg.id}"]`);
            if (existingWrap) {
                const tick = existingWrap.querySelector('.tick');
                if (tick && isRead && !tick.classList.contains('read')) { tick.innerText = '✓✓'; tick.classList.add('read'); }
                const badge = existingWrap.querySelector('.reaction-badge');
                if (badge && reaction && badge.innerText !== reaction) { badge.innerText = reaction; badge.style.display = 'block'; }
            }
        }
        
        if (!isMe && !isRead) DataAdapter.markAsRead(msg.id, msg.body);
    });
    
    if (newMessages.length > 0) {
        const lastId = newMessages[newMessages.length - 1].id;
        if (lastId > lastReadMsgId) { lastReadMsgId = lastId; localStorage.setItem(`lastRead_${ME}_${TO}`, lastId); }
    }
}

// ==========================================
// 4. ابزارهای کمکی
// ==========================================
function encryptText(text) {
    if(!CONFIG.FEATURES.E2EE) return text;
    const key = 'ch4t-s3cr3t-k3y'; let result = '';
    for(let i = 0; i < text.length; i++) result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return btoa(unescape(encodeURIComponent(result)));
}
function decryptText(encoded) {
    if(!CONFIG.FEATURES.E2EE) return encoded;
    try {
        const key = 'ch4t-s3cr3t-k3y'; const text = decodeURIComponent(escape(atob(encoded))); let result = '';
        for(let i = 0; i < text.length; i++) result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        return result;
    } catch(e) { return encoded; }
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stringToColor(str) { let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash); let color = '#'; for (let i = 0; i < 3; i++) { let value = (hash >> (i * 8)) & 0xFF; color += ('00' + value.toString(16)).substr(-2); } return color; }

// ==========================================
// 5. نمایش پیام
// ==========================================
function renderMessage(text, isMe, timestamp, msgId, reaction, isRead, replyHtml, isNew = true, isDestruct = false) {
    const chatArea = document.getElementById('chatArea');
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap' + (isMe ? ' me' : ''); wrap.dataset.id = msgId;
    if (!isNew || msgId.toString().startsWith('temp')) wrap.style.animation = 'none';
    const time = new Date(timestamp).toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'});
    
    let contentHtml = '';
    if (text.startsWith('[IMG]')) contentHtml = `<img src="${text.replace('[IMG]', '')}" class="media-img">`;
    else if (text.startsWith('[AUDIO]')) contentHtml = `<audio controls src="${text.replace('[AUDIO]', '')}" class="audio-player"></audio>`;
    else if (text.startsWith('[LOC]')) {
        const coords = text.replace('[LOC]', '');
        contentHtml = `<a href="https://maps.google.com/?q=${coords}" target="_blank" class="music-card"><div class="music-icon" style="background:#10b981">📍</div><div class="music-details"><div class="music-title">موقعیت مکانی</div><div class="music-subtitle">برای دیدن نقشه کلیک کنید</div></div></a>`;
    } else if (text.startsWith('[MUSIC]')) {
        const parts = text.replace('[MUSIC]', '').split('|||'); const title = parts[0] || ''; const artist = parts[1] || ''; const artwork = parts[2] || ''; const preview = parts[3] || '';
        contentHtml = `<div class="music-card-full"><img src="${artwork}" class="mc-art" onerror="this.style.display='none'"><div class="mc-info"><div class="mc-title">${escapeHtml(title)}</div><div class="mc-artist">${escapeHtml(artist)}</div><div class="mc-controls"><button class="mc-play" data-cardid="mc-${msgId}" data-preview="${preview}" onclick="playMusicCard(this)">▶️ پخش</button></div></div></div>`;
    } else {
        const ytRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+)/g; const spotifyRegex = /(https?:\/\/(?:open\.)?spotify\.com\/[^\s]+)/g;
        const ytMatch = text.match(ytRegex); const spotifyMatch = text.match(spotifyRegex);
        if (ytMatch) contentHtml = `<a href="${ytMatch[0]}" target="_blank" class="music-card"><div class="music-icon">▶️</div><div class="music-details"><div class="music-title">آهنگ یوتیوب</div><div class="music-subtitle">برای پخش کلیک کنید</div></div></a>`;
        else if (spotifyMatch) contentHtml = `<a href="${spotifyMatch[0]}" target="_blank" class="music-card"><div class="music-icon spotify">🎵</div><div class="music-details"><div class="music-title">آهنگ اسپاتیفای</div><div class="music-subtitle">برای پخش کلیک کنید</div></div></a>`;
        else contentHtml = `<p>${escapeHtml(text)}</p>`;
    }
    
    const destructHtml = isDestruct ? `<div class="destruct-badge">💣 پیام خودتخریب</div>` : '';
    const contextMenu = document.createElement('div'); contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `<div class="emoji-row">${['❤️','😂','😮','👍','🔥'].map(e => `<span onclick="addReaction(${msgId}, '${e}', event)">${e}</span>`).join('')}</div><div class="menu-actions"><button onclick="startReply(${msgId}, '${escapeHtml(text.substring(0,20))}...')">↩️ پاسخ</button><button onclick="playTTS('${escapeHtml(text.replace(/[\\'\\n\\r]/g, ''))}')">🔊 خواندن</button><button onclick="createPostcard(${msgId})">🖼️ کارت پستال</button>${isMe ? `<button onclick="deleteMessage(${msgId})" style="color:#ef4444">🗑️ حذف</button>` : ''}</div>`;
    const tickHtml = isMe ? `<span class="tick ${isRead ? 'read' : ''}">${isRead ? '✓✓' : '🕒'}</span>` : '';
    
    wrap.innerHTML = `<div class="msg-bubble" id="bubble-${msgId}">${replyHtml || ''}${destructHtml}${contentHtml}<div class="msg-meta"><span>${time}</span>${tickHtml}</div><div class="reaction-badge" style="${reaction ? 'display:block' : ''}">${reaction || ''}</div></div>`;
    wrap.appendChild(contextMenu);
    
    let pressTimer = null, touchStartX = 0, touchStartY = 0; const bubble = wrap.querySelector('.msg-bubble');
    bubble.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; pressTimer = setTimeout(() => { contextMenu.style.display = 'flex'; if(navigator.vibrate) navigator.vibrate(20); }, 500); });
    bubble.addEventListener('touchmove', (e) => { clearTimeout(pressTimer); let diffX = e.touches[0].clientX - touchStartX, diffY = Math.abs(e.touches[0].clientY - touchStartY); if (diffY < 30 && diffX > 0 && diffX < 80) bubble.style.transform = `translateX(${diffX}px)`; });
    bubble.addEventListener('touchend', (e) => { clearTimeout(pressTimer); let diffX = e.changedTouches[0].clientX - touchStartX, diffY = Math.abs(e.changedTouches[0].clientY - touchStartY); bubble.style.transform = 'translateX(0)'; if (diffY < 30 && diffX > 60) { startReply(msgId, text.substring(0,20)+'...'); if(navigator.vibrate) navigator.vibrate(15); } });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) contextMenu.style.display = 'none'; });
    
    chatArea.appendChild(wrap); chatArea.scrollTop = chatArea.scrollHeight;
    if (isDestruct && !isMe && !msgId.toString().startsWith('temp')) setTimeout(() => { deleteMessage(msgId, true); }, 10000);
}

// ==========================================
// 6. توابع کنش‌ها
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
    if(navigator.vibrate) navigator.vibrate(15); cancelReply(); if (isDestructMode) toggleDestruct();
    
    const success = await DataAdapter.sendMessage(ISSUE_NUMBER, finalBody);
    if (success) { lastETag = null; setTimeout(() => fetchAndRenderMessages(true), 500); }
}

async function addReaction(msgId, emoji, event) {
    const rect = event.target.getBoundingClientRect(); const floatEl = document.createElement('div');
    floatEl.className = 'float-emoji'; floatEl.innerText = emoji; floatEl.style.left = rect.left + 'px'; floatEl.style.top = rect.top + 'px';
    document.body.appendChild(floatEl); setTimeout(() => floatEl.remove(), 1000);
    if(navigator.vibrate) navigator.vibrate(10);
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
    await DataAdapter.deleteMessage(msgId);
    const wrap = document.querySelector(`.msg-wrap[data-id="${msgId}"]`);
    if(wrap) { if (silent) { wrap.style.transition = 'opacity 1s, transform 1s'; wrap.style.opacity = '0'; wrap.style.transform = 'scale(0.8)'; setTimeout(() => wrap.remove(), 1000); } else { wrap.remove(); } }
    if(navigator.vibrate) navigator.vibrate(30);
}

function playMusicCard(btn) {
    const url = btn.dataset.preview; if (!url) return;
    if (currentCardAudio) { currentCardAudio.pause(); if (currentCardBtn) { currentCardBtn.innerText = '▶️ پخش'; currentCardBtn.classList.remove('playing'); } }
    if (currentCardBtn === btn && currentCardAudio) { currentCardAudio = null; currentCardBtn = null; return; }
    const audio = new Audio(url); audio.play(); currentCardAudio = audio; currentCardBtn = btn;
    btn.innerText = '⏸️ توقف'; btn.classList.add('playing');
    audio.onended = () => { btn.innerText = '▶️ پخش'; btn.classList.remove('playing'); currentCardAudio = null; currentCardBtn = null; };
}

function playTTS(text) { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); u.lang = 'fa-IR'; window.speechSynthesis.speak(u); } document.querySelectorAll('.context-menu').forEach(m => m.style.display='none'); }
function startReply(id, textPreview) { replyToId = id; const input = document.getElementById('msgInput'); input.value = textPreview; input.focus(); input.placeholder = "پاسخ به: " + textPreview; document.querySelectorAll('.context-menu').forEach(m => m.style.display='none'); }
function cancelReply() { replyToId = null; document.getElementById('msgInput').placeholder = "پیامی بنویسید..."; }

// ==========================================
// 7. تنظیمات UI
// ==========================================
function initThemeAndAvatar() {
    const themeBtn = document.getElementById('themeBtn');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    themeBtn.innerText = currentTheme === 'dark' ? '🌙' : '☀️';
    themeBtn.onclick = () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme); themeBtn.innerText = newTheme === 'dark' ? '🌙' : '☀️';
    };
    const avatarEl = document.getElementById('avatarEl');
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

    input.addEventListener('input', function() {
        this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px';
        updateTypingStatus();
        sendBtn.innerText = this.value.trim() === '' ? '🎤' : '➤';
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.value.trim() !== '') sendMessage(); } });
    sendBtn.addEventListener('click', () => { if (input.value.trim() !== '') sendMessage(); else startVoiceRecording(); });

    let touchStartTimestamp = 0;
    sendBtn.addEventListener('touchstart', (e) => { if (input.value.trim() === '') { touchStartTimestamp = Date.now(); startVoiceRecording(); } });
    sendBtn.addEventListener('touchend', (e) => { if (isRecordingVoice) { const duration = Date.now() - touchStartTimestamp; if (duration < 1000) { cancelVoiceRecording(); alert('برای ضبط ویس، کمی بیشتر نگه دارید.'); } else { stopVoiceRecording(); } } });

    document.getElementById('attachBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas'), MAX_WIDTH = 400;
                const scaleSize = MAX_WIDTH / img.width; canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                sendMessage(`[IMG]${canvas.toDataURL('image/jpeg', 0.6)}`); fileInput.value = '';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });

    chatArea.addEventListener('scroll', () => { const isNearBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 100; scrollBtn.style.opacity = isNearBottom ? '0' : '1'; scrollBtn.style.pointerEvents = isNearBottom ? 'none' : 'auto'; });
    window.scrollToBottom = () => { chatArea.scrollTop = chatArea.scrollHeight; };
    
    document.getElementById('wallInput').addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = (ev) => { localStorage.setItem(`wall_${ME}`, ev.target.result); document.getElementById('wallpaper').style.backgroundImage = `url(${ev.target.result})`; document.getElementById('wallpaper').style.opacity = '0.3'; };
        reader.readAsDataURL(file);
    });
    
    window.setAvatar = (emoji) => { localStorage.setItem(`avatar_${ME}`, emoji); document.getElementById('avatarEl').innerText = emoji; document.getElementById('emojiOverlay').style.display = 'none'; };
    window.toggleSearch = () => { const sb = document.getElementById('searchBox'); sb.style.display = sb.style.display === 'block' ? 'none' : 'block'; if (sb.style.display === 'block') document.getElementById('searchInput').focus(); else { document.getElementById('searchInput').value = ''; filterMessages(); } };
    window.filterMessages = () => { const q = document.getElementById('searchInput').value.toLowerCase(); document.querySelectorAll('.msg-bubble').forEach(b => { if (q === '') b.parentElement.style.display = 'flex'; else if (b.innerText.toLowerCase().includes(q)) b.parentElement.style.display = 'flex'; else b.parentElement.style.display = 'none'; }); };
    window.togglePinScreen = () => { if (savedPin) { if(confirm('رمز فعلی حذف شود؟')) { localStorage.removeItem('chatPin'); location.reload(); } } else { const newPin = prompt('رمز ۴ رقمی جدید:'); if (newPin && newPin.length === 4 && !isNaN(newPin)) { localStorage.setItem('chatPin', newPin); alert('رمز تنظیم شد.'); } } };
    window.enterPin = (num) => { if (pinBuffer.length < 4) { pinBuffer += num; updatePinDots(); } };
    window.clearPin = () => { pinBuffer = ''; updatePinDots(); };
    window.updatePinDots = () => { document.querySelectorAll('.pin-dots div').forEach((dot, i) => { dot.classList.toggle('filled', i < pinBuffer.length); }); if (pinBuffer.length === 4) setTimeout(window.submitPin, 200); };
    window.submitPin = () => { if (pinBuffer === savedPin) { document.getElementById('pinScreen').style.display = 'none'; pinBuffer = ''; } else { alert('رمز اشتباه!'); window.clearPin(); } };
    window.toggleDestruct = () => { isDestructMode = !isDestructMode; const btn = document.getElementById('destructBtn'); btn.style.color = isDestructMode ? '#ef4444' : 'var(--text-muted)'; };
    window.sendLocation = () => { if (!navigator.geolocation) return alert('مرورگر پشتیبانی نمی‌کند.'); navigator.geolocation.getCurrentPosition((pos) => { sendMessage(`[LOC]${pos.coords.latitude},${pos.coords.longitude}`); }, () => { alert('دسترسی به موقعیت داده نشد.'); }); };
    window.toggleSidebar = () => { document.getElementById('sidebar').classList.toggle('open'); };
}

// ==========================================
// 8. تایپینگ، ویس و میکروفون
// ==========================================
let lastTypingTime = 0;
async function updateTypingStatus() {
    if (!TYPING_ISSUE_NUM) return; const now = Date.now(); if (now - lastTypingTime < 2000) return; lastTypingTime = now;
    await DataAdapter.updateTyping(TYPING_ISSUE_NUM, ME, now);
}
async function checkTypingStatus() {
    if (!TYPING_ISSUE_NUM) return;
    const body = await DataAdapter.checkTyping(TYPING_ISSUE_NUM);
    if (body) {
        const [user, timeStr] = body.split('|');
        if (user === TO && Date.now() - Number(timeStr) < 5000) { document.getElementById('typingArea').innerHTML = `${TO} در حال نوشتن <div class="typing-dots"><span></span><span></span><span></span></div>`; }
        else { document.getElementById('typingArea').innerHTML = ''; }
    }
}

async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream); audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => { const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); const reader = new FileReader(); reader.readAsDataURL(audioBlob); reader.onloadend = () => { sendMessage(`[AUDIO]${reader.result}`); }; stream.getTracks().forEach(track => track.stop()); };
        mediaRecorder.start(); isRecordingVoice = true; document.getElementById('sendBtn').innerText = '🔴'; document.getElementById('sendBtn').style.background = 'linear-gradient(135deg,#ef4444,#b91c1c)';
        if(navigator.vibrate) navigator.vibrate(50);
    } catch (err) { alert('دسترسی به میکروفون داده نشد!'); }
}
function stopVoiceRecording() { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); isRecordingVoice = false; document.getElementById('sendBtn').innerText = '🎤'; document.getElementById('sendBtn').style.background = 'linear-gradient(135deg,#6366f1,#ec4899)'; }
function cancelVoiceRecording() { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); isRecordingVoice = false; audioChunks = []; document.getElementById('sendBtn').innerText = '🎤'; document.getElementById('sendBtn').style.background = 'linear-gradient(135deg,#6366f1,#ec4899)'; }

// ==========================================
// 9. موزیک
// ==========================================
window.openMusicSearch = () => { document.getElementById('musicSearchOverlay').style.display = 'flex'; setTimeout(() => document.getElementById('musicSearchInput').focus(), 200); };
window.closeMusicSearch = () => { document.getElementById('musicSearchOverlay').style.display = 'none'; document.getElementById('musicSearchInput').value = ''; document.getElementById('musicSearchResults').innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:.9rem">اسم آهنگ یا خواننده رو بنویس و جستجو کن 🎵</div>'; if (currentPreviewAudio) { currentPreviewAudio.pause(); currentPreviewAudio = null; } };

window.doMusicSearch = async () => {
    const query = document.getElementById('musicSearchInput').value.trim(); if (!query) return;
    const resultsDiv = document.getElementById('musicSearchResults'); resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">⏳ در حال جستجو...</div>';
    try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=15`); const data = await res.json();
        if (!data.results || data.results.length === 0) { resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">نتیجه‌ای یافت نشد 😔</div>'; return; }
        resultsDiv.innerHTML = ''; let count = 0;
        data.results.forEach((track, idx) => {
            if (!track.previewUrl) return; count++;
            const div = document.createElement('div'); div.className = 'music-result-item';
            div.innerHTML = `<img src="${track.artworkUrl60}" class="music-result-art"><div class="music-result-info"><div class="music-result-title">${escapeHtml(track.trackName || '')}</div><div class="music-result-artist">${escapeHtml(track.artistName || '')}</div></div><div class="music-result-actions"><button class="play-btn" data-idx="${idx}">▶️</button><button class="send-btn-sm" data-idx="${idx}" style="background:linear-gradient(135deg,#6366f1,#a855f7);color:white">📤</button></div>`;
            resultsDiv.appendChild(div);
            const playBtn = div.querySelector('.play-btn'); const sendBtn = div.querySelector('.send-btn-sm');
            playBtn.addEventListener('click', () => {
                if (currentPreviewAudio) { currentPreviewAudio.pause(); currentPreviewAudio = null; }
                if (currentPreviewBtn === playBtn) { playBtn.classList.remove('active'); playBtn.innerText = '▶️'; currentPreviewBtn = null; return; }
                if (currentPreviewBtn) { currentPreviewBtn.classList.remove('active'); currentPreviewBtn.innerText = '▶️'; }
                const audio = new Audio(track.previewUrl); audio.play(); currentPreviewAudio = audio; currentPreviewBtn = playBtn; playBtn.classList.add('active'); playBtn.innerText = '⏸';
                audio.onended = () => { playBtn.classList.remove('active'); playBtn.innerText = '▶️'; };
            });
            sendBtn.addEventListener('click', () => {
                const safeTitle = (track.trackName || '').replace(/\|\|\|/g, '').replace(/\n/g, ' ');
                const safeArtist = (track.artistName || '').replace(/\|\|\|/g, '').replace(/\n/g, ' ');
                sendMessage(`[MUSIC]${safeTitle}|||${safeArtist}|||${track.artworkUrl100 || ''}|||${track.previewUrl}`);
                window.closeMusicSearch();
            });
        });
        if (count === 0) resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">آهنگی پیدا نشد.</div>';
    } catch(e) { resultsDiv.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444">خطا در جستجو.</div>'; }
};

window.toggleMusic = () => {
    if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 32; analyser.connect(audioCtx.destination); }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const btn = document.getElementById('musicBtn');
    if (isMusicPlaying) { clearInterval(chordInterval); isMusicPlaying = false; btn.innerText = '🔇'; }
    else { isMusicPlaying = true; btn.innerText = '🎵'; playChord(); chordInterval = setInterval(playChord, 3500); }
};
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
// 10. پس زمینه و افکت‌ها
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

function triggerEmojiRain() {
    const emojis = ['🎉','🎈','❤️','✨','🎊','💖','🌟','🥳'];
    for(let i=0; i<30; i++) { setTimeout(() => { const el = document.createElement('div'); el.className = 'emoji-rain'; el.innerText = emojis[Math.floor(Math.random()*emojis.length)]; el.style.left = Math.random() * 100 + 'vw'; el.style.animationDuration = (Math.random() * 2 + 1.5) + 's'; document.body.appendChild(el); setTimeout(() => el.remove(), 3500); }, i * 50); }
}

function createPostcard(msgId) {
    const bubble = document.getElementById(`bubble-${msgId}`); if(!bubble) return;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); canvas.width = 800; canvas.height = 600;
    const grad = ctx.createLinearGradient(0, 0, 800, 600); grad.addColorStop(0, '#6366f1'); grad.addColorStop(1, '#a855f7');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 800, 600); ctx.fillStyle = 'white'; ctx.font = 'bold 40px Tahoma, Arial'; ctx.textAlign = 'center';
    const text = bubble.querySelector('p') ? bubble.querySelector('p').innerText : '[پیام رسانه‌ای]';
    const words = text.split(' '); let line = '', y = 250;
    for(let n = 0; n < words.length; n++) { const testLine = line + words[n] + ' '; if(ctx.measureText(testLine).width > 700) { ctx.fillText(line, 400, y); line = words[n] + ' '; y += 60; } else { line = testLine; } }
    ctx.fillText(line, 400, y); ctx.font = '24px Tahoma'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(`از طرف ${ME} برای ${TO}`, 400, 500);
    const dataUrl = canvas.toDataURL('image/png'); const a = document.createElement('a'); a.href = dataUrl; a.download = 'postcard.png'; a.click();
}

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
