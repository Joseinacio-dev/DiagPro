"""Isolated tests only: never load .env, production databases, Redis or SMTP.

Use explicitly with --settings=devicecheck_backend.test_settings.
This module is not a deployment configuration.
"""
import os
from unittest.mock import patch

with patch.dict(os.environ, {
    'DJANGO_SECRET_KEY': 'isolated-test-key-not-for-deployment',
    'DJANGO_DEBUG': 'true',
    'DJANGO_REQUIRE_SHARED_THROTTLE_CACHE': 'false',
}, clear=True), patch('dotenv.load_dotenv'):
    from .settings import *  # noqa: F403

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
CACHES = {
    name: {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': f'test-{name}'}
    for name in ('default', 'throttle')
}
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
ALLOWED_HOSTS = ['testserver', 'localhost', '127.0.0.1']
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
