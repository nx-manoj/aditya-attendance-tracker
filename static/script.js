document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const loginSection = document.getElementById('login-section');
    const resultsSection = document.getElementById('results-section');

    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const loader = document.getElementById('loader');
    const errorBox = document.getElementById('error-box');
    const backBtn = document.getElementById('back-btn');

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

        // Reset animations so they play again next time
        document.querySelectorAll('.slide-up').forEach(el => {
            el.style.animation = 'none';
            let forceReflow = el.offsetHeight;
            el.style.animation = null;
        });
    });

    function displayResults(data) {
        loginSection.style.display = 'none';
        resultsSection.style.display = 'block';

        document.getElementById('student-name-display').textContent = data.student_name || "Student";

        let campusText = [];
        if (data.campus_name) campusText.push(data.campus_name);
        if (data.course_name) campusText.push(data.course_name);
        document.getElementById('campus-course-display').textContent = campusText.length ? campusText.join(" | ") : "";

        // Number animation for percentage (e.g. 70.11%)
        const pctEl = document.getElementById('overall-pct');
        animateValue(pctEl, parseFloat(data.overall_percentage) || 0, data.overall_percentage.includes('%') ? '%' : '');

        document.getElementById('present-ratio').textContent = `${data.present_days} / ${data.total_days} Days`;

        const feeEl = document.getElementById('fee-due-display');
        if (data.fee_due && data.fee_due !== "No Dues Found" && data.fee_due !== "₹ 0") {
            feeEl.textContent = data.fee_due;
            feeEl.className = 'stat-value fee';
        } else {
            feeEl.textContent = "₹0";
            feeEl.className = 'stat-value fee clear';
        }

        const actionText = document.getElementById('action-text');
        const statusTitle = document.getElementById('status-title');
        const ring = document.getElementById('status-ring');

        if (data.status === 'safe') {
            statusTitle.textContent = 'Safe Zone';
            statusTitle.style.color = 'var(--success)';
            ring.className = 'pulse-ring';
            if (data.target_days > 0) {
                actionText.innerHTML = `You can safely bunk <span class="highlight">${data.target_days}</span> more days without dropping below 75%.`;
            } else {
                actionText.innerHTML = `You are exactly at your required attendance target.`;
            }
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
            // easeOutExpo function for super smooth deceleration
            const easeProgress = 1 - Math.pow(1 - progress, 5);
            const current = (easeProgress * end).toFixed(2);
            obj.innerHTML = current + '<span style="font-size:0.5em; opacity:0.7;">' + suffix + '</span>';
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                obj.innerHTML = end.toFixed(2) + '<span style="font-size:0.5em; opacity:0.7;">' + suffix + '</span>';
            }
        };
        window.requestAnimationFrame(step);
    }
});
