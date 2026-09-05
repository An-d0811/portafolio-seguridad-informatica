from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import require_permission
from app.models import Alert, Asset, Evaluation, Mitigation, Report, User
from app.schemas import DashboardSummary

router = APIRouter()


@router.get("", response_model=DashboardSummary)
def get_dashboard(db: Session = Depends(get_db), user: User = Depends(require_permission("assets:read"))):
    total_assets = db.query(Asset).filter(Asset.organization_id == user.organization_id).count()
    total_evaluations = db.query(Evaluation).filter(Evaluation.organization_id == user.organization_id).count()
    total_reports = db.query(Report).filter(Report.organization_id == user.organization_id).count()
    mitigations = db.query(Mitigation).filter(Mitigation.organization_id == user.organization_id).all()
    total_mitigations = len(mitigations)
    overdue_mitigations = sum(
        1 for item in mitigations if item.status != "resolved" and item.due_date is not None and item.due_date < date.today()
    )
    cutoff = date.today() - timedelta(days=get_settings().reevaluation_days)
    rows = (
        db.query(Evaluation.asset_id, func.max(Evaluation.created_at))
        .filter(Evaluation.organization_id == user.organization_id)
        .group_by(Evaluation.asset_id)
        .all()
    )
    asset_rows = {row.asset_id: row[1] for row in rows}
    assets = db.query(Asset).filter(Asset.organization_id == user.organization_id).all()
    reevaluation_due = []
    for asset in assets:
        latest = asset_rows.get(asset.id)
        if latest is None or latest.date() < cutoff:
            days_old = None if latest is None else (date.today() - latest.date()).days
            reevaluation_due.append({"asset_id": asset.id, "asset_name": asset.name, "days_old": days_old})
    rows_dist = (
        db.query(Evaluation.level, func.count(Evaluation.id))
        .filter(Evaluation.organization_id == user.organization_id)
        .group_by(Evaluation.level)
        .all()
    )
    distribution = {level.value if hasattr(level, "value") else str(level): count for level, count in rows_dist}
    average_score = db.query(func.avg(Evaluation.score)).filter(Evaluation.organization_id == user.organization_id).scalar() or 0
    recent_alerts = (
        db.query(Alert)
        .filter(Alert.organization_id == user.organization_id)
        .order_by(Alert.created_at.desc())
        .limit(5)
        .all()
    )
    return DashboardSummary(
        total_assets=total_assets,
        total_evaluations=total_evaluations,
        total_reports=total_reports,
        total_mitigations=total_mitigations,
        overdue_mitigations=overdue_mitigations,
        reevaluation_due=reevaluation_due,
        risk_distribution=distribution,
        recent_alerts=recent_alerts,
        average_score=round(float(average_score), 2),
    )


@router.get("/trend")
def risk_trend(db: Session = Depends(get_db), user: User = Depends(require_permission("evaluations:read"))):
    evaluations = (
        db.query(Evaluation)
        .filter(Evaluation.organization_id == user.organization_id)
        .order_by(Evaluation.created_at.asc())
        .all()
    )
    buckets: dict[str, dict] = {}
    for evaluation in evaluations:
        key = evaluation.created_at.strftime("%Y-%m")
        if key not in buckets:
            buckets[key] = {"month": evaluation.created_at.strftime("%b %Y"), "sum": 0, "count": 0}
        buckets[key]["sum"] += evaluation.score
        buckets[key]["count"] += 1
    return [
        {"month": value["month"], "average_score": round(value["sum"] / value["count"], 1)}
        for value in buckets.values()
    ]


@router.get("/assets-trend")
def assets_trend(db: Session = Depends(get_db), user: User = Depends(require_permission("evaluations:read"))):
    evaluations = (
        db.query(Evaluation)
        .filter(Evaluation.organization_id == user.organization_id)
        .order_by(Evaluation.created_at.asc())
        .all()
    )
    by_asset: dict[int, list[dict]] = {}
    for evaluation in evaluations:
        by_asset.setdefault(evaluation.asset_id, []).append(
            {"score": evaluation.score, "created_at": evaluation.created_at.strftime("%Y-%m-%d")}
        )
    result = []
    for asset_id, scores in by_asset.items():
        asset = db.get(Asset, asset_id)
        result.append({"asset_id": asset_id, "asset_name": asset.name if asset else "N/A", "scores": scores})
    return result
