"""Gunicorn production logging without request queries or headers.

Gunicorn automatically loads ``gunicorn.conf.py`` from its working directory.
Render starts the service from ``backend/``, so the existing start command keeps
working while the access log records only operational request metadata.
"""

accesslog = "-"
errorlog = "-"

# ``U`` is the URL path without the query string. Do not replace it with ``r``
# (full request line) or add request headers: OAuth callbacks and other routes
# can carry short-lived credentials in those locations.
access_log_format = '%(h)s [%(t)s] "%(m)s %(U)s %(H)s" %(s)s %(b)s %(L)s'
