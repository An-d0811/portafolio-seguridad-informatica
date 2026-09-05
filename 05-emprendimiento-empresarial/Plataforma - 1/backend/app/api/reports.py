from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import get_current_user, require_permission
from app.models import Evaluation, Report, User
from app.schemas import ReportCreate, ReportRead
from app.services.ai import generate_risk_report
from app.services.audit import write_audit_log

router = APIRouter()


@router.get("/ai-status")
def ai_status(user: User = Depends(get_current_user)):
    settings = get_settings()
    configured = bool(settings.openai_api_key)
    return {
        "configured": configured,
        "model": settings.openai_model,
        "mode": "ia" if configured else "demo",
        "message": (
            "IA conectada: los reportes los genera el proveedor configurado."
            if configured
            else "Modo demostracion: configura OPENAI_API_KEY para que la IA genere los reportes. Sin la clave se usa un reporte de ejemplo."
        ),
    }


@router.get("", response_model=list[ReportRead])
def list_reports(db: Session = Depends(get_db), user: User = Depends(require_permission("reports:read"))):
    return db.query(Report).filter(Report.organization_id == user.organization_id).order_by(Report.created_at.desc()).all()


@router.post("", response_model=ReportRead)
def create_report(payload: ReportCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("reports:write"))):
    evaluation = db.query(Evaluation).filter(Evaluation.id == payload.evaluation_id, Evaluation.organization_id == user.organization_id).first()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    content = generate_risk_report(evaluation.asset, evaluation)
    report = Report(
        organization_id=user.organization_id,
        evaluation_id=evaluation.id,
        title=payload.title or f"Reporte de riesgo - {evaluation.asset.name}",
        **content,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    write_audit_log(db, user, "create", "report", str(report.id), request)
    return report


@router.patch("/{report_id}", response_model=ReportRead)
def edit_report(report_id: int, payload: dict, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("reports:write"))):
    report = db.query(Report).filter(Report.id == report_id, Report.organization_id == user.organization_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    for field in ("title", "executive_summary", "technical_details", "recommendations", "status"):
        if field in payload:
            setattr(report, field, payload[field])
    db.commit()
    db.refresh(report)
    write_audit_log(db, user, "update", "report", str(report.id), request)
    return report
