import math
import re
import json
import urllib.parse
import base64
from flask import Flask, request, jsonify, render_template
from playwright.sync_api import sync_playwright

app = Flask(__name__)

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
        
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            context.set_default_timeout(60000) # Give 60 seconds for slow college servers
            page = context.new_page()
            
            try:
                page.goto("https://analysis.aditya.ac.in/v23/student/#/")
                page.fill("#loginmobile", suc_code)
                page.fill("#stdPwd", password)
                page.click("#login")
            except Exception as e:
                browser.close()
                return jsonify({"error": "The college portal is currently extremely slow or down. Please wait a moment and try again."}), 503
            
            try:
                # Wait directly for the Attendance card instead of relying on exact URL matches
                attendance_card = page.locator('div.card', has=page.locator('h5', has_text="Attendance")).first
                attendance_card.wait_for(state="visible", timeout=15000)
            except Exception:
                browser.close()
                return jsonify({"error": "Login failed or dashboard took too long to load. Please check your credentials."}), 401
                
            try:
                overall_pct_text = attendance_card.locator('h6').first.inner_text(timeout=5000)
                ratio_text = attendance_card.locator('span').first.inner_text(timeout=5000)
                # Extract Student Name, Campus, Course
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
                            # It's base64url encoded so we might need to replace chars, but usually standard works
                            # Let's replace - with + and _ with / just in case
                            b64 = b64.replace('-', '+').replace('_', '/')
                            data = json.loads(base64.b64decode(b64).decode('utf-8'))
                            student_name = data.get('student_name', "Student")
                            campus_name = data.get('campus_name', "")
                            course_name = data.get('course_name', "")
                        except Exception:
                            pass
                            
                # Extract Fee Due
                try:
                    fee_card = page.locator('div.card', has=page.locator('h5', has_text=re.compile(r"Fee", re.IGNORECASE))).first
                    fee_text_raw = fee_card.inner_text(timeout=5000)
                    fee_match = re.search(r'(₹\s*[\d,]+)', fee_text_raw)
                    if fee_match:
                        fee_due_text = fee_match.group(1)
                    else:
                        fee_due_text = fee_card.locator('h6').first.inner_text(timeout=2000)
                except Exception:
                    fee_due_text = "No Dues Found"
                    
            except Exception:
                browser.close()
                return jsonify({"error": "Could not locate attendance data on the dashboard. Layout might have changed."}), 500
            
            match = re.search(r'([\d\.]+)\s*/\s*([\d\.]+)', ratio_text)
            if not match:
                browser.close()
                return jsonify({"error": f"Could not parse attendance ratio: {ratio_text}"}), 500
                
            present_days = float(match.group(1))
            total_days = float(match.group(2))
            current_pct = present_days / total_days if total_days > 0 else 0
            
            status = ""
            days_target = 0
            
            if current_pct < 0.75:
                days_target = (3 * total_days) - (4 * present_days)
                days_target = max(0, math.ceil(days_target))
                status = "shortage"
            else:
                bunkable = (present_days / 0.75) - total_days
                days_target = max(0, math.floor(bunkable))
                status = "safe"
                
            browser.close()
            
            return jsonify({
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
            })
            
    except Exception as e:
        return jsonify({"error": "An unexpected error occurred during scraping.", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
