FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
# WeasyPrint (PDF do druku) renders through Pango/HarfBuzz.
RUN apt-get update && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock
# Fixed UID: deploy/media on the host must be writable by it (deploy.sh fixes ownership).
RUN useradd --create-home --uid 1000 app
COPY --chown=app:app . .
# Admin static files are baked into the read-only image and served by WhiteNoise.
RUN DJANGO_SECRET_KEY=build-only-not-secret python manage.py collectstatic --noinput
USER app
EXPOSE 8000
CMD ["uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers", "--forwarded-allow-ips", "*"]
