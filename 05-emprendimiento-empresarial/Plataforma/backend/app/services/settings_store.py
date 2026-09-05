from app.core.database import SessionLocal
from app.models import AppSetting


def get_setting(organization_id: int, key: str, default: dict | None = None) -> dict:
    db = SessionLocal()
    try:
        row = db.query(AppSetting).filter(AppSetting.organization_id == organization_id, AppSetting.key == key).first()
        return row.value if row else (default or {})
    finally:
        db.close()
