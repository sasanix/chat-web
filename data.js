// ==========================================
// 2. لایه اتصال به دیتابیس (Data Adapter Layer)
// ==========================================
const GITHUB_TOKEN = CONFIG.GITHUB.TOKEN_PART_1 + CONFIG.GITHUB.TOKEN_PART_2;

const DataAdapter = {
    async getRoom(roomTitle) {
        try {
            const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues?state=all&per_page=100`, { 
                headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } 
            });
            if (!res.ok) throw new Error('Network error');
            const issues = await res.json();
            const existing = issues.find(i => i.title === roomTitle);
            if (existing) return existing.number;
            
            const createRes = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues`, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ title: roomTitle, body: `اتاق VIP` }) 
            });
            const newIssue = await createRes.json(); 
            return newIssue.number;
        } catch (e) { console.error(e); return null; }
    },

    async fetchMessages(issueNumber, lastETag = null) {
        try {
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
        } catch (e) { return { error: true }; }
    },

    async sendMessage(issueNumber, body) {
        try {
            const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/${issueNumber}/comments`, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ body }) 
            });
            return res.ok;
        } catch (e) { return false; }
    },

    async markAsRead(commentId, originalBody) {
        if (originalBody.includes('[READ]')) return;
        try {
            await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/comments/${commentId}`, { 
                method: 'PATCH', 
                headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ body: originalBody + ' [READ]' }) 
            });
        } catch(e) {}
    },

    async deleteMessage(commentId) {
        try {
            await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/comments/${commentId}`, { 
                method: 'DELETE', 
                headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } 
            });
        } catch(e) {}
    },

    async updateTyping(issueNumber, me, time) {
        try {
            await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/${issueNumber}`, { 
                method: 'PATCH', 
                headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ body: `${me}|${time}` }) 
            });
        } catch(e) {}
    },

    async checkTyping(issueNumber) {
        try {
            const res = await fetch(`https://api.github.com/repos/${CONFIG.GITHUB.OWNER}/${CONFIG.GITHUB.REPO}/issues/${issueNumber}`, { 
                headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` } 
            });
            const data = await res.json();
            return data ? data.body : null;
        } catch(e) { return null; }
    }
};
