from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_admin
from app.models import AppSetting, User
from app.schemas import AppSettingRead, AppSettingUpdate
from app.services.audit import write_audit_log

router = APIRouter()

VALID_KEYS = {"ai", "notifications"}


@router.get("", response_model=list[AppSettingRead])
def list_settings(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    rows = db.query(AppSetting).filter(AppSetting.organization_id == admin.organization_id).all()
    return [AppSettingRead(key=row.key, value=row.value) for row in rows]


@router.put("/{key}", response_model=AppSettingRead)
def upsert_setting(key: str, payload: AppSettingUpdate, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if key not in VALID_KEYS:
        raise HTTPException(status_code=400, detail="Invalid setting key")
    row = db.query(AppSetting).filter(AppSetting.organization_id == admin.organization_id, AppSetting.key == key).first()
    if row:
        row.value = payload.value
    else:
        row = AppSetting(organization_id=admin.organization_id, key=key, value=payload.value)
        db.add(row)
    db.commit()
    db.refresh(row)
    write_audit_log(db, admin, "update", "setting", key, request, {})
    return row
