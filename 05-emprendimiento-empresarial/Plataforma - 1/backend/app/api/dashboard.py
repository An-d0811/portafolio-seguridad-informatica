from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import Alert, Asset, Evaluation, Report, User
from app.schemas import DashboardSummary

router = APIRouter()


@router.get("", response_model=DashboardSummary)
def get_dashboard(db: Session = Depends(get_db), user: User = Depends(require_permission("assets:read"))):
    total_assets = db.query(Asset).filter(Asset.organization_id == user.organization_id).count()
    total_evaluations = db.query(Evaluation).filter(Evaluation.organization_id == user.organization_id).count()
    total_reports = db.query(Report).filter(Report.organization_id == user.organization_id).count()
    rows = (
        db.query(Evaluation.level, func.count(Evaluation.id))
        .filter(Evaluation.organization_id == user.organization_id)
        .group_by(Evaluation.level)
        .all()
    )
    distribution = {level.value if hasattr(level, "value") else str(level): count for level, count in rows}
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
        risk_distribution=distribution,
        recent_alerts=recent_alerts,
        average_score=round(float(average_score), 2),
    )
