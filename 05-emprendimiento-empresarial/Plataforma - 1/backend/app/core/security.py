from datetime import datetime, timedelta, timezone
from enum import StrEnum
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


class Role(StrEnum):
    admin = "admin"
    evaluator = "evaluator"
    viewer = "viewer"


ROLE_PERMISSIONS = {
    Role.admin: {"*"},
    Role.evaluator: {"assets:read", "assets:write", "evaluations:read", "evaluations:write", "reports:read", "reports:write", "alerts:read"},
    Role.viewer: {"assets:read", "evaluations:read", "reports:read", "alerts:read"},
}


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": subject, "exp": expires}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    settings = get_settings()
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_error
    except JWTError as exc:
        raise credentials_error from exc
    user = db.get(User, int(user_id))
    if not user or not user.is_active:
        raise credentials_error
    return user


def require_permission(permission: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        permissions = ROLE_PERMISSIONS.get(Role(current_user.role), set())
        if "*" not in permissions and permission not in permissions:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        if current_user.mfa_enabled and not current_user.mfa_verified:
            raise HTTPException(status_code=403, detail="MFA verification required")
        return current_user

    return dependency
