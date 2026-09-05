import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_permission
from app.models import Evaluation, Report, User
from app.schemas import ReportCreate, ReportRead, SignatureCheck
from app.services.ai import _provider_config, detect_provider, generate_risk_report
from app.services.audit import write_audit_log

router = APIRouter()

SIGNED_FIELDS = ("executive_summary", "technical_details", "recommendations")


def sign_content(title: str, content: dict) -> str:
    canonical = json.dumps(
        {"title": title, **{field: content.get(field) for field in SIGNED_FIELDS}},
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@router.get("/ai-status")
def ai_status(user: User = Depends(get_current_user)):
    config = _provider_config(user.organization_id)
    base_url = config["base_url"] or ""
    local_provider = any(marker in base_url for marker in ("11434", "localhost", "host.docker.internal", "127.0.0.1"))
    configured = bool(config["api_key"]) or local_provider
    provider = detect_provider(base_url)
    message = (
        "IA conectada: los reportes los genera el proveedor configurado."
        if configured
        else "Modo demostracion: agrega la clave del proveedor en el archivo .env del servidor. Sin la clave se usa un reporte de ejemplo."
    )
    return {
        "configured": configured,
        "provider": provider,
        "model": config["model"],
        "mode": "ia" if configured else "demo",
        "message": message,
    }


@router.get("", response_model=list[ReportRead])
def list_reports(db: Session = Depends(get_db), user: User = Depends(require_permission("reports:read"))):
    return db.query(Report).filter(Report.organization_id == user.organization_id).order_by(Report.created_at.desc()).all()


@router.post("", response_model=ReportRead)
def create_report(payload: ReportCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("reports:write"))):
    evaluation = db.query(Evaluation).filter(Evaluation.id == payload.evaluation_id, Evaluation.organization_id == user.organization_id).first()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    title = payload.title or f"Reporte de riesgo - {evaluation.asset.name}"
    config = _provider_config(user.organization_id)
    content, generated = generate_risk_report(evaluation.asset, evaluation)
    provider = detect_provider(config["base_url"]) if generated else "demo"
    report = Report(
        organization_id=user.organization_id,
        evaluation_id=evaluation.id,
        title=title,
        **content,
        provider=provider,
        model=config["model"] if generated else None,
        content_hash=sign_content(title, content),
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
    content = {"executive_summary": report.executive_summary, "technical_details": report.technical_details, "recommendations": report.recommendations}
    report.content_hash = sign_content(report.title, content)
    db.commit()
    db.refresh(report)
    write_audit_log(db, user, "update", "report", str(report.id), request)
    return report


@router.get("/{report_id}/verify", response_model=SignatureCheck)
def verify_report(report_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("reports:read"))):
    report = db.query(Report).filter(Report.id == report_id, Report.organization_id == user.organization_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not report.content_hash:
        return SignatureCheck(valid=False, content_hash=None)
    content = {"executive_summary": report.executive_summary, "technical_details": report.technical_details, "recommendations": report.recommendations}
    valid = sign_content(report.title, content) == report.content_hash
    return SignatureCheck(valid=valid, content_hash=report.content_hash)
