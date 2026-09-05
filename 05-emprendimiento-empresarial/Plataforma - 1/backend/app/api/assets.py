from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import Alert, Asset, Evaluation, Report, Risk, User
from app.schemas import AssetCreate, AssetRead, AssetUpdate
from app.services.audit import write_audit_log

router = APIRouter()


@router.get("", response_model=list[AssetRead])
def list_assets(db: Session = Depends(get_db), user: User = Depends(require_permission("assets:read"))):
    return db.query(Asset).filter(Asset.organization_id == user.organization_id).order_by(Asset.name).all()


@router.post("", response_model=AssetRead)
def create_asset(payload: AssetCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("assets:write"))):
    asset = Asset(**payload.model_dump(), organization_id=user.organization_id)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    write_audit_log(db, user, "create", "asset", str(asset.id), request)
    return asset


@router.patch("/{asset_id}", response_model=AssetRead)
def update_asset(asset_id: int, payload: AssetUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("assets:write"))):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.organization_id == user.organization_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, key, value)
    db.commit()
    db.refresh(asset)
    write_audit_log(db, user, "update", "asset", str(asset.id), request)
    return asset


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_permission("assets:write"))):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.organization_id == user.organization_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    evaluation_ids = [evaluation.id for evaluation in db.query(Evaluation.id).filter(Evaluation.asset_id == asset.id).all()]
    if evaluation_ids:
        db.query(Risk).filter(Risk.evaluation_id.in_(evaluation_ids)).delete(synchronize_session=False)
        db.query(Report).filter(Report.evaluation_id.in_(evaluation_ids)).delete(synchronize_session=False)
        db.query(Evaluation).filter(Evaluation.id.in_(evaluation_ids)).delete(synchronize_session=False)
    db.query(Alert).filter(Alert.asset_id == asset.id).delete(synchronize_session=False)
    db.delete(asset)
    db.commit()
    write_audit_log(db, user, "delete", "asset", str(asset_id), request)
    return None
