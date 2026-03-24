document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginSection = document.getElementById('login-section');
    const resultsSection = document.getElementById('results-section');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const loader = document.getElementById('loader');
    const errorBox = document.getElementById('error-box');
    const backBtn = document.getElementById('back-btn');

    // ─── SERVICE WORKER + PUSH REGISTRATION ─────────────────────────────────
    let swRegistration = null;

    if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.register('/static/service-worker.js').then(reg => {
            swRegistration = reg;
            console.log('Service Worker registered.');
        }).catch(err => console.warn('SW registration failed:', err));
    }

    async function subscribeForPush(suc_code, password) {
        if (!swRegistration) return;
        try {
            const permResult = await Notification.requestPermission();
            if (permResult !== 'granted') return;

            const vapidRes = await fetch('/api/vapidPublicKey');
            const { publicKey } = await vapidRes.json();

            const applicationServerKey = urlBase64ToUint8Array(publicKey);
            const subscription = await swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });

            await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suc_code, password, subscription })
            });
            console.log('Push subscription registered!');
        } catch (err) {
            console.warn('Push subscription error:', err);
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
    }

    // ─── FORM SUBMIT ─────────────────────────────────────────────────────────
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const suc_code = document.getElementById('suc').value.trim();
        const password = document.getElementById('password').value.trim();
        if (!suc_code || !password) return;

        submitBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'block';
        errorBox.style.display = 'none';

        try {
            const response = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suc_code, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to fetch attendance');
            
            displayResults(data);
            
            // Subscribe for push notifications silently after successful login
            subscribeForPush(suc_code, password);
            
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            btnText.style.display = 'block';
            loader.style.display = 'none';
        }
    });

    backBtn.addEventListener('click', () => {
        resultsSection.style.display = 'none';
        loginSection.style.display = 'block';
        loginForm.reset();
    });

    function displayResults(data) {
        loginSection.style.display = 'none';
        resultsSection.style.display = 'block';

        document.getElementById('student-name-display').textContent = data.student_name || "Student";

        let campusText = [];
        if (data.campus_name) campusText.push(data.campus_name);
        if (data.course_name) campusText.push(data.course_name);
        document.getElementById('campus-course-display').textContent = campusText.length ? campusText.join(" | ") : "";

        // Animated percentage counter
        const pctEl = document.getElementById('overall-pct');
        animateValue(pctEl, parseFloat(data.overall_percentage) || 0, '%');
        document.getElementById('present-ratio').textContent = `${data.present_days} / ${data.total_days} Days`;

        const feeEl = document.getElementById('fee-due-display');
        if (data.fee_due && data.fee_due !== "No Dues Found" && data.fee_due !== "₹ 0") {
            feeEl.textContent = data.fee_due;
            feeEl.className = 'stat-value fee';
        } else {
            feeEl.textContent = "Clear";
            feeEl.className = 'stat-value fee clear';
        }

        const actionText = document.getElementById('action-text');
        const statusTitle = document.getElementById('status-title');
        const ring = document.getElementById('status-ring');

        if (data.status === 'safe') {
            statusTitle.textContent = 'Safe Zone';
            statusTitle.style.color = 'var(--success)';
            ring.className = 'pulse-ring';
            actionText.innerHTML = data.target_days > 0
                ? `You can safely bunk <span class="highlight">${data.target_days}</span> more days without dropping below 75%.`
                : `You are exactly at your required attendance target.`;
        } else {
            statusTitle.textContent = 'Critical Shortage';
            statusTitle.style.color = 'var(--danger)';
            ring.className = 'pulse-ring danger';
            actionText.innerHTML = `You must attend the next <span class="highlight">${data.target_days}</span> days consecutively to reach 75%.`;
        }
    }

    function animateValue(obj, end, suffix) {
        let startTimestamp = null;
        const duration = 1200;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 5);
            const current = (easeProgress * end).toFixed(2);
            obj.innerHTML = current + `<span style="font-size:0.5em; opacity:0.7;">${suffix}</span>`;
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.innerHTML = end.toFixed(2) + `<span style="font-size:0.5em; opacity:0.7;">${suffix}</span>`;
            }
        };
        window.requestAnimationFrame(step);
    }
});
