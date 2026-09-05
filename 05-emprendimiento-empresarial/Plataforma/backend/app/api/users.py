from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password, require_admin
from app.models import AuditLog, User
from app.schemas import UserCreate, UserRead, UserUpdate
from app.services.audit import write_audit_log

router = APIRouter()

VALID_ROLES = {"admin", "evaluator", "viewer"}


@router.get("", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return db.query(User).filter(User.organization_id == admin.organization_id).order_by(User.created_at.desc()).all()


@router.post("", response_model=UserRead)
def create_user(payload: UserCreate, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        organization_id=admin.organization_id,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        mfa_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    write_audit_log(db, admin, "create", "user", str(user.id), request, {"email": user.email, "role": user.role})
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: UserUpdate, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    target = db.query(User).filter(User.id == user_id, User.organization_id == admin.organization_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="No puede desactivar su propia cuenta")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(target, field, value)
    db.commit()
    db.refresh(target)
    write_audit_log(db, admin, "update", "user", str(target.id), request, {"role": target.role, "active": target.is_active})
    return target


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, request: Request, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    target = db.query(User).filter(User.id == user_id, User.organization_id == admin.organization_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="No puede eliminar su propia cuenta")
    db.query(AuditLog).filter(AuditLog.user_id == target.id).update({"user_id": None})
    db.delete(target)
    db.commit()
    write_audit_log(db, admin, "delete", "user", str(user_id), request, {"email": target.email})
    return None
