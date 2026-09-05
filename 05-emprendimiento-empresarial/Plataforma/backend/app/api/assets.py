import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_permission
from app.models import Alert, Asset, AssetType, Evaluation, Mitigation, Report, Risk, User
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
        report_ids = [row[0] for row in db.query(Report.id).filter(Report.evaluation_id.in_(evaluation_ids)).all()]
        if report_ids:
            db.query(Mitigation).filter(Mitigation.report_id.in_(report_ids)).delete(synchronize_session=False)
        db.query(Risk).filter(Risk.evaluation_id.in_(evaluation_ids)).delete(synchronize_session=False)
        db.query(Report).filter(Report.evaluation_id.in_(evaluation_ids)).delete(synchronize_session=False)
        db.query(Evaluation).filter(Evaluation.id.in_(evaluation_ids)).delete(synchronize_session=False)
    db.query(Alert).filter(Alert.asset_id == asset.id).delete(synchronize_session=False)
    db.delete(asset)
    db.commit()
    write_audit_log(db, user, "delete", "asset", str(asset_id), request)
    return None


@router.post("/import")
async def import_assets(file: UploadFile = File(...), request: Request = None, db: Session = Depends(get_db), user: User = Depends(require_permission("assets:write"))):
    try:
        content = (await file.read()).decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="El archivo debe ser CSV con codificacion UTF-8")
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames or "name" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="El CSV debe incluir una columna 'name' y opcionalmente asset_type, owner, criticality, location, description")
    created = 0
    skipped = []
    for index, row in enumerate(reader, start=2):
        name = (row.get("name") or "").strip()
        if not name:
            skipped.append(f"fila {index}: sin nombre")
            continue
        asset_type = (row.get("asset_type") or "hardware").strip().lower()
        if asset_type not in {"hardware", "software", "data", "person"}:
            asset_type = "hardware"
        try:
            criticality = max(1, min(5, int(row.get("criticality") or 3)))
        except ValueError:
            criticality = 3
        db.add(
            Asset(
                organization_id=user.organization_id,
                name=name,
                asset_type=AssetType(asset_type),
                owner=(row.get("owner") or "").strip(),
                criticality=criticality,
                location=(row.get("location") or "").strip() or None,
                description=(row.get("description") or "").strip() or None,
            )
        )
        created += 1
    db.commit()
    write_audit_log(db, user, "import", "asset", None, request, {"created": created})
    return {"created": created, "skipped": skipped}
