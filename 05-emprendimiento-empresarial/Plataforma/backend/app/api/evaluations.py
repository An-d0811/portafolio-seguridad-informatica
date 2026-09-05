from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import Alert, Asset, Evaluation, Risk, User
from app.schemas import EvaluationCreate, EvaluationRead
from app.services.audit import write_audit_log
from app.services.notifications import notify_external
from app.services.risk import calculate_risk_score, classify_mitre

router = APIRouter()


@router.get("", response_model=list[EvaluationRead])
def list_evaluations(db: Session = Depends(get_db), user: User = Depends(require_permission("evaluations:read"))):
    return db.query(Evaluation).filter(Evaluation.organization_id == user.organization_id).order_by(Evaluation.created_at.desc()).all()


@router.post("", response_model=EvaluationRead)
def create_evaluation(payload: EvaluationCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("evaluations:write"))):
    asset = db.query(Asset).filter(Asset.id == payload.asset_id, Asset.organization_id == user.organization_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    score, level = calculate_risk_score(payload.answers, payload.likelihood, payload.impact, asset.criticality)
    evaluation = Evaluation(
        organization_id=user.organization_id,
        asset_id=asset.id,
        answers=payload.answers,
        likelihood=payload.likelihood,
        impact=payload.impact,
        score=score,
        level=level,
        created_by=user.id,
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)
    for item in classify_mitre(payload.answers):
        db.add(Risk(evaluation_id=evaluation.id, priority=level, **item))
    if level.value in {"high", "critical"}:
        alert = Alert(
            organization_id=user.organization_id,
            asset_id=asset.id,
            title=f"Riesgo {level.value} en {asset.name}",
            message=f"El activo obtuvo {score}/100. Revise controles NIST CSF 2.0 y acciones MITRE ATT&CK.",
            severity=level,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        notify_external(alert, user.organization.name)
    db.commit()
    write_audit_log(db, user, "create", "evaluation", str(evaluation.id), request, {"score": score, "level": level.value})
    return evaluation


@router.patch("/{evaluation_id}", response_model=EvaluationRead)
def update_evaluation(evaluation_id: int, payload: EvaluationCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("evaluations:write"))):
    evaluation = db.query(Evaluation).filter(Evaluation.id == evaluation_id, Evaluation.organization_id == user.organization_id).first()
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    asset = db.query(Asset).filter(Asset.id == payload.asset_id, Asset.organization_id == user.organization_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    score, level = calculate_risk_score(payload.answers, payload.likelihood, payload.impact, asset.criticality)
    evaluation.asset_id = asset.id
    evaluation.answers = payload.answers
    evaluation.likelihood = payload.likelihood
    evaluation.impact = payload.impact
    evaluation.score = score
    evaluation.level = level
    db.query(Risk).filter(Risk.evaluation_id == evaluation.id).delete(synchronize_session=False)
    for item in classify_mitre(payload.answers):
        db.add(Risk(evaluation_id=evaluation.id, priority=level, **item))
    if level.value in {"high", "critical"} and not db.query(Alert).filter(Alert.asset_id == asset.id, Alert.is_read.is_(False)).first():
        alert = Alert(
            organization_id=user.organization_id,
            asset_id=asset.id,
            title=f"Riesgo {level.value} en {asset.name}",
            message=f"El activo obtuvo {score}/100. Revise controles NIST CSF 2.0 y acciones MITRE ATT&CK.",
            severity=level,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        notify_external(alert, user.organization.name)
    db.commit()
    db.refresh(evaluation)
    write_audit_log(db, user, "update", "evaluation", str(evaluation.id), request, {"score": score, "level": level.value})
    return evaluation
