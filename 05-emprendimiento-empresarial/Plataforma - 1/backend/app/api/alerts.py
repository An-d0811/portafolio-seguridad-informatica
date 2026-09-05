from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import Alert, User
from app.schemas import AlertRead

router = APIRouter()


@router.get("", response_model=list[AlertRead])
def list_alerts(db: Session = Depends(get_db), user: User = Depends(require_permission("alerts:read"))):
    return db.query(Alert).filter(Alert.organization_id == user.organization_id).order_by(Alert.created_at.desc()).all()


@router.patch("/{alert_id}/read", response_model=AlertRead)
def mark_alert_read(alert_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("alerts:read"))):
    alert = db.query(Alert).filter(Alert.id == alert_id, Alert.organization_id == user.organization_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    db.commit()
    db.refresh(alert)
    return alert
