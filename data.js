// ==========================================
// لایه داده (Data Layer Adapter)
// ==========================================
const GITHUB_TOKEN = CONFIG.GITHUB.TOKEN_PART_1 + CONFIG.GITHUB.TOKEN_PART_2;

const DataAdapter = {
    // 1. پیدا کردن یا ساختن اتاق
    async getRoom(roomTitle) {
        const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues?state=all&per_page=100`, { 
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } 
        });
        const issues = await res.json();
        const existing = issues.find(i => i.title === roomTitle);
        if (existing) return existing.number;
        
        const createRes = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues`, { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ title: roomTitle, body: `اتاق خودکار` }) 
        });
        const newIssue = await createRes.json(); 
        return newIssue.number;
    },

    // 2. دریافت پیام‌ها
    async fetchMessages(issueNumber, lastETag = null) {
        const headers = { 'Authorization': `Bearer ${GITHUB_TOKEN}` };
        if (lastETag) headers['If-None-Match'] = lastETag;
        const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/${issueNumber}/comments`, { headers });
        
        if (res.status === 304) return { notModified: true };
        if (!res.ok) return { error: true };
        
        return {
            notModified: false,
            etag: res.headers.get('ETag'),
            data: await res.json()
        };
    },

    // 3. ارسال پیام جدید
    async sendMessage(issueNumber, body) {
        const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/${issueNumber}/comments`, { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ body }) 
        });
        return res.ok;
    },

    // 4. علامت خوانده شدن
    async markAsRead(commentId, originalBody) {
        if(originalBody.includes('[READ]')) return;
        await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/comments/${commentId}`, { 
            method: 'PATCH', 
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ body: originalBody + ' [READ]' }) 
        });
    },

    // 5. حذف پیام
    async deleteMessage(commentId) {
        await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/comments/${commentId}`, { 
            method: 'DELETE', 
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } 
        });
    },

    // 6. آپدیت وضعیت تایپینگ
    async updateTyping(issueNumber, me, time) {
        await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/${issueNumber}`, { 
            method: 'PATCH', 
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ body: `${me}|${time}` }) 
        });
    },

    // 7. چک کردن تایپینگ
    async checkTyping(issueNumber) {
        const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/${issueNumber}`, { 
            headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } 
        });
        const data = await res.json();
        return data ? data.body : null;
    }
};
