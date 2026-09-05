from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    create_access_token,
    generate_totp_secret,
    get_current_user,
    hash_password,
    verify_password,
    verify_totp,
)
from app.models import User
from app.schemas import AuthResponse, MfaChallenge, MfaEnable, PasswordChange, Token, UserCreate, UserRead
from app.services.audit import write_audit_log

router = APIRouter()


def _mfa_token(user: User) -> str:
    return create_access_token(
        str(user.id),
        {"type": "mfa", "role": user.role, "org": user.organization_id},
    )


@router.post("/register", response_model=UserRead)
def register_user(payload: UserCreate, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        organization_id=payload.organization_id,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        mfa_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    write_audit_log(db, user, "create", "user", str(user.id), request, {"email": user.email})
    return user


@router.post("/token", response_model=AuthResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), request: Request = None, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not user.is_active or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    write_audit_log(db, user, "login", "session", None, request)
    if user.mfa_enabled and user.mfa_secret:
        user.mfa_verified = False
        db.commit()
        return AuthResponse(mfa_required=True, mfa_token=_mfa_token(user))
    return AuthResponse(access_token=create_access_token(str(user.id), {"role": user.role, "org": user.organization_id}))


@router.post("/mfa/verify", response_model=Token)
def verify_mfa(payload: MfaChallenge, db: Session = Depends(get_db)):
    settings = get_settings()
    try:
        decoded = jwt.decode(payload.mfa_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid MFA token")
    if decoded.get("type") != "mfa":
        raise HTTPException(status_code=401, detail="Invalid MFA token")
    user = db.get(User, int(decoded["sub"]))
    if not user or not verify_totp(user.mfa_secret, payload.code):
        raise HTTPException(status_code=401, detail="Invalid code")
    user.mfa_verified = True
    db.commit()
    return Token(access_token=create_access_token(str(user.id), {"role": user.role, "org": user.organization_id}))


@router.post("/mfa/setup")
def mfa_setup(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = generate_totp_secret()
    user.mfa_secret = secret
    user.mfa_enabled = False
    user.mfa_verified = True
    db.commit()

    label = "GuardIA"
    uri = f"otpauth://totp/{label}:{user.email}?secret={secret}&issuer={label}"
    return {"secret": secret, "otpauth_uri": uri, "note": "Agregue el secreto a su app de autenticacion (Google Authenticator, Aegis, etc.)."}


@router.post("/mfa/enable", response_model=Token)
def mfa_enable(payload: MfaEnable, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_totp(user.mfa_secret, payload.code):
        raise HTTPException(status_code=401, detail="Invalid code")
    user.mfa_enabled = True
    user.mfa_verified = True
    db.commit()
    return Token(access_token=create_access_token(str(user.id), {"role": user.role, "org": user.organization_id}))


@router.post("/mfa/disable")
def mfa_disable(payload: MfaEnable, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_totp(user.mfa_secret, payload.code):
        raise HTTPException(status_code=401, detail="Invalid code")
    user.mfa_enabled = False
    user.mfa_secret = None
    user.mfa_verified = True
    db.commit()
    return {"status": "disabled"}


@router.post("/password", response_model=UserRead)
def change_password(payload: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    return user


@router.get("/me", response_model=UserRead)
def current_user(user: User = Depends(get_current_user)):
    return user
