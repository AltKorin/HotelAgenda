import os, re, sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get("DEBUG", "0") == "1"
TESTING = "test" in sys.argv
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY or SECRET_KEY.startswith("replace-with-"):
    if DEBUG or TESTING:
        SECRET_KEY = "local-development-only"
    else:
        from django.core.exceptions import ImproperlyConfigured

        raise ImproperlyConfigured(
            "Set DJANGO_SECRET_KEY (or DEBUG=1 for local development)"
        )
# CLAUDE.md: hosts are listed explicitly; env only extends them per deployment.
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver", "api"] + [
    h for h in os.environ.get("ALLOWED_HOSTS", "").split(",") if h
]
INSTALLED_APPS = [
    "jazzmin",  # must precede django.contrib.admin
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "simple_history",
    "core",
    "agenda",
]
MIDDLEWARE = [
    "core.private_cache.PrivateResponseMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",  # after auth: fills history_user
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
DATABASES = {
    "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
}
if os.environ.get("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": os.environ["POSTGRES_HOST"],
            "NAME": os.environ.get("POSTGRES_DB", "hotelagenda"),
            "USER": os.environ.get("POSTGRES_USER", "hotelagenda"),
            "PASSWORD": os.environ["POSTGRES_PASSWORD"],
            "CONN_MAX_AGE": 0,
            "OPTIONS": {"options": "-c statement_timeout=5000 -c lock_timeout=2000"},
        }
    }
# ponytail: database cache shares throttle counters between uvicorn workers without Redis;
# move to Redis only if throttling ever shows up in DB load.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "cache_table",
    }
}
if TESTING:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
REST_FRAMEWORK = {
    # JSON only: a browser opening an API link (e.g. the data export) gets the file, not the browsable API.
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["core.transport.BoundedJSONParser"],
    "EXCEPTION_HANDLER": "core.transport.exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication"
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "user": os.environ.get("THROTTLE_USER", "120/minute"),
        "anon": os.environ.get("THROTTLE_ANON", "60/minute"),
        "login": os.environ.get("THROTTLE_LOGIN", "10/minute"),
        "public": os.environ.get("THROTTLE_PUBLIC", "600/minute"),
        "pdf": os.environ.get("THROTTLE_PDF", "30/minute"),
        "registration": os.environ.get("THROTTLE_REGISTRATION", "5/hour"),
        "demo": os.environ.get("THROTTLE_DEMO", "10/hour"),
    },
    "NUM_PROXIES": 1,
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "pl"
TIME_ZONE = "UTC"  # each hotel carries its own timezone
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Uploaded logos (written by the API, served read-only by Caddy from the same folder).
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media"))
SESSION_COOKIE_HTTPONLY = True
# Tests run over plain HTTP in any environment (also `manage.py test` inside the production container).
SESSION_COOKIE_SECURE = os.environ.get("SECURE_COOKIES", "0") == "1" and not TESTING
CSRF_COOKIE_SECURE = SESSION_COOKIE_SECURE
CSRF_TRUSTED_ORIGINS = [
    s for s in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",") if s
]
# CLAUDE.md: behind a TLS-terminating proxy these two are set together, never one alone,
# otherwise the first production request loops on redirects.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = os.environ.get("SSL_REDIRECT", "0") == "1" and not TESTING
SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]  # container healthcheck speaks plain HTTP
DATA_UPLOAD_MAX_MEMORY_SIZE = 512 * 1024
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
# Agenda outputs (env so the hotel's operator can tune without a deploy).
SCREEN_SLIDE_SECONDS = int(os.environ.get("SCREEN_SLIDE_SECONDS", "12"))
SCREEN_REFRESH_SECONDS = int(os.environ.get("SCREEN_REFRESH_SECONDS", "60"))
GUEST_LINK_GRACE_DAYS = int(os.environ.get("GUEST_LINK_GRACE_DAYS", "3"))
MAX_ACTIVE_LINKS = int(os.environ.get("MAX_ACTIVE_LINKS", "50"))
# RODO retention (komenda `retencja_danych`, cron): login trail kept this many days.
RETENCJA_LOGIN_DNI = int(os.environ.get("RETENCJA_LOGIN_DNI", "365"))
# GA4 on public pages only (landing, rejestracja, regulamin); empty = no tag. Shape-checked: it lands in a script URL.
GA_MEASUREMENT_ID = os.environ.get("GA_MEASUREMENT_ID", "").strip()
if GA_MEASUREMENT_ID and not re.fullmatch(r"G-[A-Z0-9]{4,20}", GA_MEASUREMENT_ID):
    from django.core.exceptions import ImproperlyConfigured

    raise ImproperlyConfigured("GA_MEASUREMENT_ID must look like G-XXXXXXXXXX")

JAZZMIN_SETTINGS = {
    "site_title": "HotelAgenda — serwis",
    "site_header": "HotelAgenda",
    "site_brand": "HotelAgenda",
    "welcome_sign": "Panel serwisowy",
}

# Public sandbox demo (agenda.demo): at most DEMO_MAX copies at once, each erased after DEMO_HOURS.
# DEMO_MAX=0 hides the „Wypróbuj demo” button (CLAUDE.md: feature flag, switched on per deployment).
DEMO_MAX = int(os.environ.get("DEMO_MAX", "0"))
DEMO_HOURS = int(os.environ.get("DEMO_HOURS", "24"))
