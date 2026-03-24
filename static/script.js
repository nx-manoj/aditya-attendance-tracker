/* ── Animated particle canvas background ─── */
(function initCanvas() {
    const canvas = document.getElementById('bg-canvas');
    const ctx = canvas.getContext('2d');
    let W, H, dots = [];

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    function spawnDots() {
        dots = [];
        const count = Math.floor((W * H) / 16000);
        for (let i = 0; i < count; i++) {
            dots.push({
                x: Math.random() * W,
                y: Math.random() * H,
                r: Math.random() * 1.2 + 0.3,
                dx: (Math.random() - 0.5) * 0.3,
                dy: (Math.random() - 0.5) * 0.3,
                o: Math.random() * 0.4 + 0.1
            });
        }
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        dots.forEach(d => {
            d.x += d.dx; d.y += d.dy;
            if (d.x < 0) d.x = W;
            if (d.x > W) d.x = 0;
            if (d.y < 0) d.y = H;
            if (d.y > H) d.y = 0;
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(108,99,255,${d.o})`;
            ctx.fill();
        });

        // Draw lines between close dots
        for (let i = 0; i < dots.length; i++) {
            for (let j = i + 1; j < dots.length; j++) {
                const dx = dots[i].x - dots[j].x;
                const dy = dots[i].y - dots[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 100) {
                    ctx.beginPath();
                    ctx.moveTo(dots[i].x, dots[i].y);
                    ctx.lineTo(dots[j].x, dots[j].y);
                    ctx.strokeStyle = `rgba(108,99,255,${0.08 * (1 - dist / 100)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }

        requestAnimationFrame(draw);
    }

    resize(); spawnDots(); draw();
    window.addEventListener('resize', () => { resize(); spawnDots(); });
})();

/* ── App Logic ─────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Element refs
    const loginSection   = document.getElementById('login-section');
    const resultsSection = document.getElementById('results-section');
    const loginForm      = document.getElementById('login-form');
    const submitBtn      = document.getElementById('submit-btn');
    const btnText        = document.getElementById('btn-text');
    const loader         = document.getElementById('loader');
    const errorBox       = document.getElementById('error-box');
    const backBtn        = document.getElementById('back-btn');

    // Inject SVG gradient defs for ring
    document.body.insertAdjacentHTML('beforeend', `
        <svg class="svg-defs" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#6C63FF"/>
                    <stop offset="100%" stop-color="#3ECFCF"/>
                </linearGradient>
            </defs>
        </svg>
    `);

    // Activate login screen
    requestAnimationFrame(() => loginSection.classList.add('visible'));

    // ── Service Worker + Push ──────────────
    let swReg = null;
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.register('/static/service-worker.js')
            .then(r => { swReg = r; })
            .catch(e => console.warn('SW:', e));
    }

    async function subscribePush(suc_code, password) {
        if (!swReg) return;
        try {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') return;
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
        } catch (e) { console.warn('Push sub failed:', e); }
    }

    function urlB64ToUint8(b64) {
        const pad = '='.repeat((4 - b64.length % 4) % 4);
        const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
    }

    // ── Form submit ────────────────────────
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
            if (!res.ok) throw new Error(data.error || 'Failed to fetch.');
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
        resultsSection.classList.remove('active', 'visible');
        loginSection.classList.add('active');
        requestAnimationFrame(() => loginSection.classList.add('visible'));
        loginForm.reset();
    });

    // ── Show Results ───────────────────────
    function showResults(data) {
        loginSection.classList.remove('active', 'visible');

        resultsSection.classList.add('active');
        // Animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resultsSection.classList.add('visible'));
        });

        // Stagger class application
        resultsSection.querySelectorAll('[class*="anim-"]').forEach(el => {
            el.style.animationPlayState = 'running';
        });

        // Student info
        document.getElementById('student-name-display').textContent = data.student_name || 'Student';
        const parts = [data.campus_name, data.course_name].filter(Boolean);
        document.getElementById('campus-course-display').textContent = parts.join(' · ');

        // Ring animation
        const pct = parseFloat(data.overall_percentage) || 0;
        const circumference = 2 * Math.PI * 78; // r=78
        const offset = circumference - (pct / 100) * circumference;
        const ringFill = document.getElementById('ring-fill');
        ringFill.style.strokeDasharray  = circumference;
        ringFill.style.strokeDashoffset = circumference; // start at 0
        requestAnimationFrame(() => {
            setTimeout(() => { ringFill.style.strokeDashoffset = offset; }, 50);
        });

        // Animated counter for percentage
        animCounter(document.getElementById('ring-pct'), pct, '%');
        document.getElementById('ring-sub').textContent =
            `${data.present_days} / ${data.total_days} Days`;

        // Fee
        const feeEl = document.getElementById('fee-val');
        if (data.fee_due && data.fee_due !== 'No Dues Found') {
            feeEl.textContent = data.fee_due;
            feeEl.className = 'card-val fee-danger';
        } else {
            feeEl.textContent = 'Clear';
            feeEl.className = 'card-val fee-ok';
        }

        // Status card
        const statusCard  = document.getElementById('status-card');
        const statusLabel = document.getElementById('status-label');
        const statusDays  = document.getElementById('status-days');
        const badge       = document.getElementById('topbar-badge');
        const actionGlass = document.getElementById('action-glass');
        const actionMsg   = document.getElementById('action-msg');

        if (data.status === 'safe') {
            statusLabel.textContent = 'Can Bunk';
            statusDays.textContent  = `${data.target_days} Days`;
            statusCard.className = 'info-card safe';
            badge.textContent = '✓ Safe';
            badge.className = 'topbar-badge safe';
            actionGlass.className = 'action-glass safe anim-4';
            actionMsg.innerHTML = data.target_days > 0
                ? `You can safely skip <strong>${data.target_days} more days</strong> without dropping below 75%.`
                : `You're right on the 75% target. Attend all upcoming classes to stay safe.`;
        } else {
            statusLabel.textContent = 'Must Attend';
            statusDays.textContent  = `${data.target_days} Days`;
            statusCard.className = 'info-card danger';
            badge.textContent = '⚠ Critical';
            badge.className = 'topbar-badge danger';
            actionGlass.className = 'action-glass danger anim-4';
            actionMsg.innerHTML = `Attend the next <strong>${data.target_days} consecutive days</strong> without a break to reach the required 75%.`;
        }
    }

    function animCounter(el, end, suffix) {
        const dur = 1100;
        let start = null;
        function step(ts) {
            if (!start) start = ts;
            const prog = Math.min((ts - start) / dur, 1);
            const ease = 1 - Math.pow(1 - prog, 4);
            el.textContent = (ease * end).toFixed(1) + suffix;
            if (prog < 1) requestAnimationFrame(step);
            else el.textContent = end.toFixed(1) + suffix;
        }
        requestAnimationFrame(step);
    }
});
