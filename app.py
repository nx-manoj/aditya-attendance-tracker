import math
import re
import json
import urllib.parse
import base64
import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from playwright.sync_api import sync_playwright
from pywebpush import webpush, WebPushException

app = Flask(__name__)
CORS(app)

# Load VAPID keys from .env file
if os.path.exists('.env'):
    with open('.env') as f:
        for line in f:
            if '=' in line:
                key, val = line.strip().split('=', 1)
                os.environ[key] = val

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_CLAIMS = {"sub": "mailto:admin@adityatracker.local"}

SUBSCRIPTIONS_FILE = 'subscriptions.json'

def load_subscriptions():
    if os.path.exists(SUBSCRIPTIONS_FILE):
        with open(SUBSCRIPTIONS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_subscriptions(subs):
    with open(SUBSCRIPTIONS_FILE, 'w') as f:
        json.dump(subs, f)

def fetch_attendance(suc_code, password):
    """Core scraper. Returns a dict with attendance data or an 'error' key."""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            context.set_default_timeout(60000)
            page = context.new_page()

            try:
                page.goto("https://analysis.aditya.ac.in/v23/student/#/")
                page.fill("#loginmobile", suc_code)
                page.fill("#stdPwd", password)
                page.click("#login")
            except Exception as e:
                browser.close()
                return {"error": "The college portal is currently extremely slow or down. Please wait a moment and try again."}

            try:
                attendance_card = page.locator('div.card', has=page.locator('h5', has_text="Attendance")).first
                attendance_card.wait_for(state="visible", timeout=15000)
            except Exception:
                browser.close()
                return {"error": "Login failed or dashboard took too long to load. Please check your credentials.", "auth_failure": True}

            try:
                overall_pct_text = attendance_card.locator('h6').first.inner_text(timeout=5000)
                ratio_text = attendance_card.locator('span').first.inner_text(timeout=5000)

                student_name = "Student"
                campus_name = ""
                course_name = ""
                url = page.url
                fragment = urllib.parse.urlparse(url).fragment
                if "?" in fragment:
                    qs = fragment.split("?", 1)[1]
                    fetchinfo = urllib.parse.parse_qs(qs).get('fetchinfo', [''])[0]
                    if fetchinfo:
                        b64 = fetchinfo + "=" * ((4 - len(fetchinfo) % 4) % 4)
                        try:
                            b64 = b64.replace('-', '+').replace('_', '/')
                            info = json.loads(base64.b64decode(b64).decode('utf-8'))
                            student_name = info.get('student_name', "Student")
                            campus_name = info.get('campus_name', "")
                            course_name = info.get('course_name', "")
                        except Exception:
                            pass

                try:
                    fee_card = page.locator('div.card', has=page.locator('h5', has_text=re.compile(r"Fee", re.IGNORECASE))).first
                    fee_text_raw = fee_card.inner_text(timeout=5000)
                    fee_match = re.search(r'(₹\s*[\d,]+)', fee_text_raw)
                    fee_due_text = fee_match.group(1) if fee_match else fee_card.locator('h6').first.inner_text(timeout=2000)
                except Exception:
                    fee_due_text = "No Dues Found"

            except Exception:
                browser.close()
                return {"error": "Could not locate attendance data on the dashboard. Layout might have changed."}

            match = re.search(r'([\d\.]+)\s*/\s*([\d\.]+)', ratio_text)
            if not match:
                browser.close()
                return {"error": f"Could not parse attendance ratio: {ratio_text}"}

            present_days = float(match.group(1))
            total_days = float(match.group(2))
            current_pct = present_days / total_days if total_days > 0 else 0

            if current_pct < 0.75:
                days_target = max(0, math.ceil((3 * total_days) - (4 * present_days)))
                status = "shortage"
            else:
                days_target = max(0, math.floor((present_days / 0.75) - total_days))
                status = "safe"

            browser.close()

            return {
                "success": True,
                "student_name": student_name,
                "campus_name": campus_name,
                "course_name": course_name,
                "fee_due": fee_due_text,
                "overall_percentage": overall_pct_text,
                "present_days": present_days,
                "total_days": total_days,
                "status": status,
                "target_days": days_target
            }

    except Exception as e:
        return {"error": "An unexpected error occurred during scraping.", "details": str(e)}


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/attendance', methods=['POST'])
def get_attendance():
    data = request.json
    suc_code = data.get('suc_code')
    password = data.get('password')
    if not suc_code or not password:
        return jsonify({"error": "SUC code and password are required"}), 400

    result = fetch_attendance(suc_code, password)
    if "error" in result:
        code = 401 if result.get("auth_failure") else 500
        return jsonify(result), code
    return jsonify(result)

@app.route('/api/vapidPublicKey', methods=['GET'])
def vapid_public_key():
    return jsonify({"publicKey": VAPID_PUBLIC_KEY})

@app.route('/api/subscribe', methods=['POST'])
def subscribe():
    data = request.get_json()
    suc = data.get('suc_code')
    pwd = data.get('password')
    sub = data.get('subscription')

    if not suc or not pwd or not sub:
        return jsonify({"error": "Missing data"}), 400

    subs = load_subscriptions()
    subs[suc] = {"password": pwd, "subscription": sub}
    save_subscriptions(subs)

    try:
        webpush(
            subscription_info=sub,
            data=json.dumps({
                "title": "Aditya Tracker ✓",
                "body": "Daily push notifications are now active! You'll get an attendance summary every morning.",
                "url": "/"
            }),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
    except WebPushException as ex:
        print("WebPush confirmation error:", repr(ex))

    return jsonify({"success": True})

@app.route('/api/cron/daily', methods=['GET', 'POST'])
def cron_daily():
    """Called daily by Render Cron Job to push attendance notifications to all subscribers."""
    subs = load_subscriptions()
    results = []

    for suc, user_data in subs.items():
        pwd = user_data['password']
        sub = user_data['subscription']

        att = fetch_attendance(suc, pwd)
        if "error" not in att:
            if att['status'] == 'safe':
                body_msg = f"{att['overall_percentage']} · Safe to bunk {att['target_days']} days." if att['target_days'] > 0 else f"{att['overall_percentage']} · Exactly at 75% target."
            else:
                body_msg = f"{att['overall_percentage']} · ⚠ Attend next {att['target_days']} days to reach 75%."
            try:
                webpush(
                    subscription_info=sub,
                    data=json.dumps({
                        "title": f"Daily: {att['student_name'].split()[0]}",
                        "body": body_msg,
                        "url": "/"
                    }),
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims=VAPID_CLAIMS
                )
                results.append(f"OK: {suc}")
            except WebPushException as ex:
                results.append(f"FAIL: {suc} - {repr(ex)}")
        else:
            results.append(f"SCRAPE_FAIL: {suc}")

    return jsonify({"cron_results": results, "count": len(results)})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
