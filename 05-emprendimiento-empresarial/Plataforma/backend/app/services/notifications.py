import logging
import smtplib
import threading
from email.message import EmailMessage

import httpx

from app.core.config import get_settings
from app.models import Alert
from app.services.settings_store import get_setting

logger = logging.getLogger(__name__)


def _config(organization_id: int) -> dict:
    stored = get_setting(organization_id, "notifications", {})
    settings = get_settings()
    return {
        "smtp_host": stored.get("smtp_host") or settings.smtp_host,
        "smtp_port": int(stored.get("smtp_port") or settings.smtp_port),
        "smtp_user": stored.get("smtp_user") or settings.smtp_user,
        "smtp_password": stored.get("smtp_password") or settings.smtp_password,
        "smtp_from": stored.get("smtp_from") or settings.smtp_from,
        "webhook_url": stored.get("webhook_url") or settings.webhook_url,
    }


def _send_email(config: dict, alert: Alert, org_name: str) -> None:
    if not config.get("smtp_host"):
        return
    message = EmailMessage()
    message["Subject"] = f"[GuardIA] {alert.title}"
    message["From"] = config["smtp_from"]
    message["To"] = config["smtp_from"]
    message.set_content(f"Organizacion: {org_name}\n\n{alert.title}\n\n{alert.message}\n\nSeveridad: {alert.severity.value}")
    with smtplib.SMTP(config["smtp_host"], config["smtp_port"], timeout=15) as server:
        if config.get("smtp_user"):
            server.starttls()
            server.login(config["smtp_user"], config["smtp_password"])
        server.send_message(message)


def _send_webhook(config: dict, alert: Alert, org_name: str) -> None:
    webhook_url = config.get("webhook_url")
    if not webhook_url:
        return
    payload = {
        "text": f"*[GuardIA]* {alert.title}\n{alert.message}\nSeveridad: {alert.severity.value} - {org_name}",
        "type": "alert",
        "severity": alert.severity.value,
        "organization": org_name,
    }
    httpx.post(webhook_url, json=payload, timeout=15)


def notify_external(alert: Alert, org_name: str) -> None:
    config = _config(alert.organization_id)
    if not config.get("smtp_host") and not config.get("webhook_url"):
        return

    def worker() -> None:
        if config.get("smtp_host"):
            try:
                _send_email(config, alert, org_name)
            except Exception:
                logger.exception("Failed to send alert email")
        if config.get("webhook_url"):
            try:
                _send_webhook(config, alert, org_name)
            except Exception:
                logger.exception("Failed to send alert webhook")

    threading.Thread(target=worker, daemon=True).start()
