document.addEventListener('DOMContentLoaded', () => {
    const loginPage    = document.getElementById('login-page');
    const resultsPage  = document.getElementById('results-page');
    const loginForm    = document.getElementById('login-form');
    const submitBtn    = document.getElementById('submit-btn');
    const btnText      = document.getElementById('btn-text');
    const loader       = document.getElementById('loader');
    const errorBox     = document.getElementById('error-box');
    const backBtn      = document.getElementById('back-btn');

    // ── Service Worker ─────────────────────────
    let swReg = null;
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.register('/static/service-worker.js')
            .then(r => { swReg = r; })
            .catch(e => console.warn('SW:', e));
    }

    async function subscribePush(suc_code, password) {
        if (!swReg) return;
        try {
            if (Notification.permission !== 'granted') {
                const p = await Notification.requestPermission();
                if (p !== 'granted') return;
            }
            const { publicKey } = await (await fetch('/api/vapidPublicKey')).json();
            const sub = await swReg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8(publicKey)
            });
            await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suc_code, password, subscription: sub })
            });
        } catch (e) { console.warn('Push:', e); }
    }

    function urlB64ToUint8(b64) {
        const pad = '='.repeat((4 - b64.length % 4) % 4);
        const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    // ── Form submit ─────────────────────────────
    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const suc_code = document.getElementById('suc').value.trim();
        const password = document.getElementById('password').value.trim();
        if (!suc_code || !password) return;

        submitBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'block';
        errorBox.textContent = '';

        try {
            const res  = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suc_code, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch attendance.');
            showResults(data);
            subscribePush(suc_code, password);
        } catch (err) {
            errorBox.textContent = err.message;
        } finally {
            submitBtn.disabled = false;
            btnText.style.display = 'block';
            loader.style.display = 'none';
        }
    });

    backBtn.addEventListener('click', () => {
        resultsPage.classList.remove('active');
        loginPage.classList.add('active');
        loginForm.reset();
    });

    // ── Show Results ────────────────────────────
    function showResults(data) {
        loginPage.classList.remove('active');
        resultsPage.classList.add('active');

        // Name & campus
        const name = data.student_name || 'Student';
        document.getElementById('res-name').textContent = name;
        const parts = [data.campus_name, data.course_name].filter(Boolean);
        document.getElementById('res-campus').textContent = parts.join(' · ');

        // Percentage — animated counter + CSS gradient
        const pct = parseFloat(data.overall_percentage) || 0;
        animCounter(document.getElementById('result-pct'), pct, '%');
        document.getElementById('result-days').textContent =
            `${data.present_days} / ${data.total_days} Days`;

        // Fee
        const feeEl = document.getElementById('res-fee');
        if (data.fee_due && data.fee_due !== 'No Dues Found') {
            feeEl.textContent = data.fee_due;
            feeEl.className = 'res-card-val fee-red';
        } else {
            feeEl.textContent = 'Clear ✓';
            feeEl.className = 'res-card-val fee-green';
        }

        // Status pill + action card
        const pill       = document.getElementById('status-pill');
        const actionCard = document.getElementById('action-card');
        const actionIcon = document.getElementById('action-icon');
        const actionText = document.getElementById('action-text');

        if (data.status === 'safe') {
            pill.textContent = '✓ SAFE';
            pill.style.color = '#00F5A0';
            pill.style.borderColor = 'rgba(0,245,160,.3)';
            actionCard.className = 'action-card safe anim d4';
            actionIcon.textContent = '🎉';
            actionText.innerHTML = data.target_days > 0
                ? `<strong>Bunk ${data.target_days} Days</strong>You can safely skip ${data.target_days} more ${data.target_days === 1 ? 'day' : 'days'} without dropping below 75%.`
                : `<strong>Exactly at 75%</strong>Don't skip a single class — you're right at the limit.`;
        } else {
            pill.textContent = '⚠ CRITICAL';
            pill.style.color = '#FF4D6A';
            pill.style.borderColor = 'rgba(255,77,106,.3)';
            actionCard.className = 'action-card danger anim d4';
            actionIcon.textContent = '📅';
            actionText.innerHTML = `<strong>Attend ${data.target_days} Days</strong>You must attend the next ${data.target_days} consecutive classes to reach the required 75%.`;
        }

        // Trigger animations
        ['result-hero','result-cards','action-card'].forEach((id, i) => {
            const el = document.getElementById(id) || document.querySelector('.' + id);
            if (el) { el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''; }
        });
    }

    function animCounter(el, end, suffix) {
        const dur = 1000;
        let start = null;
        const step = ts => {
            if (!start) start = ts;
            const p = Math.min((ts - start) / dur, 1);
            const e = 1 - Math.pow(1 - p, 4);
            el.textContent = (e * end).toFixed(1) + suffix;
            if (p < 1) requestAnimationFrame(step);
            else el.textContent = end.toFixed(1) + suffix;
        };
        requestAnimationFrame(step);
    }
});
