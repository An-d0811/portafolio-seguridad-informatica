from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import Alert, Evaluation, Mitigation, Report, RiskLevel, User
from app.schemas import MitigationCreate, MitigationRead, MitigationUpdate
from app.services.audit import write_audit_log
from app.services.mitigations import is_mitigation_overdue
from app.services.notifications import notify_external

router = APIRouter()


def _sync_overdue_alert(db: Session, mitigation: Mitigation, org_name: str) -> None:
    if not is_mitigation_overdue(mitigation.due_date, mitigation.status):
        return
    title = "Tarea de mitigacion vencida"
    message = f"{mitigation.recommendation} | Responsable: {mitigation.owner or 'sin asignar'}"
    existing = (
        db.query(Alert)
        .filter(
            Alert.organization_id == mitigation.organization_id,
            Alert.title == title,
            Alert.message == message,
            Alert.is_read.is_(False),
        )
        .first()
    )
    if existing:
        return
    alert = Alert(
        organization_id=mitigation.organization_id,
        title=title,
        message=message,
        severity=mitigation.priority,
        channel="in_app",
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    notify_external(alert, org_name)


@router.get("", response_model=list[MitigationRead])
def list_mitigations(db: Session = Depends(get_db), user: User = Depends(require_permission("mitigations:read"))):
    return db.query(Mitigation).filter(Mitigation.organization_id == user.organization_id).order_by(Mitigation.created_at.desc()).all()


@router.post("", response_model=MitigationRead)
def create_mitigation(payload: MitigationCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("mitigations:write"))):
    report = db.query(Report).filter(Report.id == payload.report_id, Report.organization_id == user.organization_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    priority = RiskLevel.medium
    if report.evaluation_id:
        evaluation = db.query(Evaluation).filter(Evaluation.id == report.evaluation_id).first()
        if evaluation:
            priority = evaluation.level
    mitigation = Mitigation(
        organization_id=user.organization_id,
        report_id=report.id,
        recommendation=payload.recommendation,
        owner=payload.owner,
        due_date=payload.due_date,
        status=payload.status,
        priority=priority,
    )
    db.add(mitigation)
    db.commit()
    db.refresh(mitigation)
    write_audit_log(db, user, "create", "mitigation", str(mitigation.id), request, {"status": mitigation.status})
    _sync_overdue_alert(db, mitigation, user.organization.name)
    return mitigation


@router.patch("/{mitigation_id}", response_model=MitigationRead)
def update_mitigation(mitigation_id: int, payload: MitigationUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("mitigations:write"))):
    mitigation = db.query(Mitigation).filter(Mitigation.id == mitigation_id, Mitigation.organization_id == user.organization_id).first()
    if not mitigation:
        raise HTTPException(status_code=404, detail="Mitigation not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(mitigation, field, value)
    db.commit()
    db.refresh(mitigation)
    write_audit_log(db, user, "update", "mitigation", str(mitigation.id), request, {"status": mitigation.status})
    _sync_overdue_alert(db, mitigation, user.organization.name)
    return mitigation


@router.delete("/{mitigation_id}", status_code=204)
def delete_mitigation(mitigation_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("mitigations:write"))):
    mitigation = db.query(Mitigation).filter(Mitigation.id == mitigation_id, Mitigation.organization_id == user.organization_id).first()
    if not mitigation:
        raise HTTPException(status_code=404, detail="Mitigation not found")
    db.delete(mitigation)
    db.commit()
    write_audit_log(db, user, "delete", "mitigation", str(mitigation_id), request)
    return None
