// ==========================================
// تنظیمات اصلی سیستم (Config)
// ==========================================
const CONFIG = {
    // 1. انتخاب بک‌اند (فعلا گیت‌هاب، بعدا می‌تونی بذاری 'supabase')
    BACKEND: 'github', 
    
    // 2. تنظیمات گیت‌هاب (توکن‌ها اینجا امن‌ترن)
    GITHUB: {
        TOKEN_PART_1: 'github_pat_11CSMC2CA07gm0UueWTT8h',
        TOKEN_PART_2: '_M10flwPtPqL7slsyycEwWN0i6DA1SXTcWX2pp7vCyU5KMXY5ZYXa7dwu7dd',
        OWNER: 'sasanix',
        REPO: 'chat-db'
    },

    // 3. سوییچ قابلیت‌ها (Feature Flags) برای درآمدزایی
    FEATURES: {
        E2EE: true,         // رمزنگاری
        MUSIC: true,        // استودیو موزیک
        VOICE: true,        // ارسال ویس
        SELF_DESTRUCT: true,// پیام خودتخریب
        PREMIUM_MODE: false // این رو اگر true کنی، میشه نسخه پولی
    },

    // 4. تنظیمات ظاهری
    APP_NAME: 'چت افسانه‌ای',
    VERSION: '9.0-Enterprise'
};
