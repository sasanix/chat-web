// ==========================================
// 4. لایه منطق (App Logic Layer) - Super Simple VIP v14.0
// ==========================================
const params = new URLSearchParams(window.location.search);
let ME = localStorage.getItem('vip_me_name');
let MY_ID = localStorage.getItem('vip_me_id');
const URL_TO_ID = params.get('to'); // شناسه میزبان اگر از لینک اومده باشه
const URL_TO_NAME = params.get('toName'); // اسم میزبان

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
function generateVIPID(name) {
    if (!name) return "000000";
    const str = name.toLowerCase().trim();
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
    if (!window.matchMedia('(display-mode: standalone)').matches) {
        document.getElementById('pwaBanner').classList.add('show');
    }
});

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                document.getElementById('pwaBanner').classList.remove('show');
            }
        });
    } else {
        alert('لطفاً از منوی مرورگر خود گزینه "Add to Home Screen" را انتخاب کنید.');
    }
}

// ==========================================
// 3. راه‌اندازی اولیه
// ==========================================
if (!ME || !MY_ID) {
    if (URL_TO_ID) {
        // اگر از لینک دعوت اومده و هنوز اسمش رو نگفته
        renderGuestWelcome(URL_TO_ID, URL_TO_NAME);
    } else {
        // اگر کاملا جدیده
        renderMainWelcome();
    }
} else {
    // اگر قبلا لاگین کرده
    if (!URL_TO_ID) {
        // وارد پنل خودش میشه (برای دعوت کردن)
        renderDashboard();
    } else {
        // وارد چت میشه
        initChatApp(URL_TO_ID, URL_TO_NAME);
    }
}

// ==========================================
// 4. صفحات خوش‌آمدگویی و داشبورد
// ==========================================
function renderMainWelcome() {
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen">
            <div style="font-size:3rem;margin-bottom:15px">👑</div>
            <h2>خوش آمدید</h2>
            <p>برای ساخت حساب VIP، اسم خودت رو بنویس.</p>
            <div class="input-group" style="margin-top:20px;">
                <label>نام نمایشی شما</label>
                <input id="inputMe" type="text" placeholder="مثلا: ساسان" onkeydown="if(event.key==='Enter') createNewAccount()">
            </div>
            <button class="btn-large" onclick="createNewAccount()">ساخت حساب جدید 🚀</button>
            <button class="btn-link" onclick="renderRestoreScreen()">اکانت قبلی دارم (بازیابی)</button>
            <p style="font-size:0.7rem;margin-top:30px;opacity:0.6">نسخه VIP | کاملاً امن</p>
        </div>
        <div id="pwaBanner">📲 برای تجربه بهتر نصب کنید <button onclick="installPWA()">نصب</button></div>
    `;
}

function renderRestoreScreen() {
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen">
            <div style="font-size:3rem;margin-bottom:15px">🔑</div>
            <h2>بازیابی حساب</h2>
            <p>اگر تاریخچه مرورگر یا اپلیکیشن رو پاک کردی، با وارد کردن کد VIP قبلیت همه چیز برمی‌گرده.</p>
            <div class="input-group" style="margin-top:20px;">
                <label>کد VIP (۶ رقم)</label>
                <input id="inputRestoreID" type="number" placeholder="مثلا: 123456" maxlength="6">
            </div>
            <button class="btn-large" onclick="restoreAccount()">بازیابی 🚀</button>
            <button class="btn-link" onclick="renderMainWelcome()">بازگشت</button>
        </div>
        <div id="pwaBanner">📲 برای تجربه بهتر نصب کنید <button onclick="installPWA()">نصب</button></div>
    `;
}

function createNewAccount() {
    const name = document.getElementById('inputMe').value.trim();
    if (!name) return alert('لطفاً نام خود را وارد کنید.');
    const id = generateVIPID(name);
    localStorage.setItem('vip_me_name', name);
    localStorage.setItem('vip_me_id', id);
    location.reload();
}

function restoreAccount() {
    const id = document.getElementById('inputRestoreID').value.trim();
    if (!validateVIPID(id)) return alert('کد VIP نامعتبر است!');
    // برای بازیابی اسم، ما اسم رو از کاربر می‌پرسیم تا مطمئن بشیم درست وارد شده
    const name = prompt('کد شما معتبر است! لطفاً نام نمایشی خود را برای بازیابی وارد کنید:');
    if (!name) return;
    
    // چک میکنیم آیا این اسم با این کد همخوانی داره؟
    if (generateVIPID(name) !== id) {
        return alert('این نام با کد وارد شده همخوانی ندارد!');
    }
    
    localStorage.setItem('vip_me_name', name);
    localStorage.setItem('vip_me_id', id);
    location.reload();
}

function renderDashboard() {
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen" style="justify-content:flex-start;padding-top:50px;">
            <div class="vip-card" onclick="shareInvite()">
                <div class="vip-badge-icon">👑</div>
                <div class="vip-title">شناسه اختصاصی من</div>
                <div class="vip-id">${MY_ID}</div>
                <div class="vip-name">${ME}</div>
                <button class="btn-copy">📋 ارسال دعوت‌نامه</button>
            </div>
            
            <h2>سلام ${ME} عزیز!</h2>
            <p>برای شروع چت، لینک دعوت رو برای دوستت بفرست.</p>
            <button class="btn-large" onclick="shareInvite()">🚀 دعوت از دوست</button>
            <button class="btn-link" style="margin-top:20px" onclick="showHelp()">راهنما</button>
        </div>
        <div id="pwaBanner">📲 برای تجربه بهتر نصب کنید <button onclick="installPWA()">نصب</button></div>
    `;
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

function showHelp() {
    alert("چطور کار میکنه؟\n\n۱. شما لینک دعوت رو می‌فرستید.\n۲. دوست شما روی لینک می‌زنه.\n۳. اسم خودش رو می‌نویسه.\n۴. چت شما فوراً شروع میشه!\n\nنگران پاک شدن تاریخچه نباشید، فقط کد VIP خودتون رو داشته باشید تا بتونید بازیابی کنید.");
}

function renderGuestWelcome(hostId, hostName) {
    document.getElementById('app').innerHTML = `
        <div class="welcome-screen">
            <div style="font-size:3rem;margin-bottom:15px">💌</div>
            <h2>شما دعوت شده‌اید!</h2>
            <p><b>${hostName || 'یک دوست'}</b> شما را به چت VIP دعوت کرده است. برای شروع، اسم خودتان را وارد کنید.</p>
            <div class="input-group" style="margin-top:20px;">
                <label>نام نمایشی شما</label>
                <input id="inputGuestMe" type="text" placeholder="مثلا: حسن" onkeydown="if(event.key==='Enter') joinAsGuest('${hostId}', '${hostName}')">
            </div>
            <button class="btn-large" onclick="joinAsGuest('${hostId}', '${hostName}')">ورود به چت 🚀</button>
        </div>
        <div id="pwaBanner">📲 برای تجربه بهتر نصب کنید <button onclick="installPWA()">نصب</button></div>
    `;
}

function joinAsGuest(hostId, hostName) {
    const name = document.getElementById('inputGuestMe').value.trim();
    if (!name) return alert('لطفاً نام خود را وارد کنید.');
    const id = generateVIPID(name);
    localStorage.setItem('vip_me_name', name);
    localStorage.setItem('vip_me_id', id);
    // ریدایرکت به چت
    window.location.href = `?to=${hostId}&toName=${encodeURIComponent(hostName)}`;
}

// ==========================================
// 5. شروع چت دو نفره (وقتی هر دو ID دارن)
// ==========================================
async function initChatApp(hostId, hostName) {
    const chatTitleEl = document.getElementById('chatTitle');
    if(chatTitleEl) chatTitleEl.innerText = `چت با ${hostName || 'دوست'}`;
    
    const statusSpan = document.getElementById('presenceStatus');
    if(statusSpan) statusSpan.innerHTML = `متصل | شناسه: <b style="color:var(--gold)">${MY_ID}</b>`;
    
    // تعیین نام اتاق
    const sortedIds = [MY_ID, hostId].sort();
    const roomTitle = `VIP-${sortedIds[0]}-${sortedIds[1]}`;
    const typingTitle = `_typing_status_${roomTitle}`;
    
    initThemeAndAvatar();
    setupUI();
    setupBackground();
    
    if (savedPin) document.getElementById('pinScreen').style.display = 'flex';
    
    const ambientLayer = document.createElement('div'); ambientLayer.id = 'ambientLayer'; document.getElementById('app').prepend(ambientLayer);
    const avatarEl = document.getElementById('avatarEl'); const aura = document.createElement('div'); aura.className = 'avatar-aura'; avatarEl.parentElement.classList.add('avatar-wrapper'); avatarEl.parentElement.prepend(aura);
    const hint = document.createElement('div'); hint.className = 'dream-hint'; hint.innerText = '✨ در حال رویا... برای بیدار شدن لمس کن ✨'; document.body.appendChild(hint);
    
    // اتصال به دیتابیس
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

// (بقیه توابع مثل fetchAndRenderMessages, processMessage, sendMessage, setupUI, ویس, موزیک و... دقیقاً مثل نسخه 13.1 که قبلا فرستادم هستند و اینجا برای جلوگیری از طولانی شدن تکرار نشده‌اند. کافیه این فایل رو با محتوای قبلی ادغام کنی. من فقط بخش لاگین و روتینگ رو تغییر دادم).
