# We use Microsoft's official Playwright image because it comes completely pre-configured with all Linux
# dependencies required to run the headless Chromium browser.
FROM mcr.microsoft.com/playwright/python:v1.42.0-jammy

# Set environment variables
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all the application files (HTML, CSS, JS, app.py) into the container
COPY . .

# Render exposes the deployment port dynamically through the PORT env var.
# We run Gunicorn in production instead of Flask's built in development server.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5000} app:app"]
