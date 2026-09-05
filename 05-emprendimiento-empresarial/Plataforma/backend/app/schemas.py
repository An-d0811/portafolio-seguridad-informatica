from datetime import date, datetime
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import AssetType, RiskLevel


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class OrganizationCreate(BaseModel):
    name: str
    sector: str = "public"


class OrganizationRead(OrganizationCreate):
    id: int
    country: str

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    organization_id: int | None = None
    email: EmailStr
    full_name: str
    password: str = Field(min_length=12)
    role: str = "evaluator"

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if not any(char.islower() for char in value):
            raise ValueError("La contrasena debe incluir minusculas.")
        if not any(char.isupper() for char in value):
            raise ValueError("La contrasena debe incluir mayusculas.")
        if not any(char.isdigit() for char in value):
            raise ValueError("La contrasena debe incluir numeros.")
        return value


class UserRead(BaseModel):
    id: int
    organization_id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    mfa_enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if not any(char.islower() for char in value):
            raise ValueError("La contrasena debe incluir minusculas.")
        if not any(char.isupper() for char in value):
            raise ValueError("La contrasena debe incluir mayusculas.")
        if not any(char.isdigit() for char in value):
            raise ValueError("La contrasena debe incluir numeros.")
        return value


class AuthResponse(BaseModel):
    access_token: str | None = None
    token_type: str | None = "bearer"
    mfa_required: bool = False
    mfa_token: str | None = None


class MfaChallenge(BaseModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=6)


class MfaEnable(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class AssetBase(BaseModel):
    name: str
    asset_type: AssetType
    owner: str
    criticality: int = Field(ge=1, le=5)
    location: str | None = None
    description: str | None = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: str | None = None
    asset_type: AssetType | None = None
    owner: str | None = None
    criticality: int | None = Field(default=None, ge=1, le=5)
    location: str | None = None
    description: str | None = None


class AssetRead(AssetBase):
    id: int
    organization_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class EvaluationCreate(BaseModel):
    asset_id: int
    answers: dict[str, int] = Field(
        description="Scores from 1 to 5 for identify, protect, detect, respond, recover"
    )
    likelihood: int = Field(ge=1, le=5)
    impact: int = Field(ge=1, le=5)


class EvaluationRead(BaseModel):
    id: int
    organization_id: int
    asset_id: int
    framework: str
    answers: dict
    likelihood: int
    impact: int
    score: int
    level: RiskLevel
    created_at: datetime

    class Config:
        from_attributes = True


class ReportCreate(BaseModel):
    evaluation_id: int
    title: str | None = None


class ReportRead(BaseModel):
    id: int
    organization_id: int
    evaluation_id: int | None
    title: str
    executive_summary: str
    technical_details: str
    recommendations: list[str]
    content_hash: str | None = None
    evidence: dict | None = None
    provider: str | None = None
    model: str | None = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class SignatureCheck(BaseModel):
    valid: bool
    content_hash: str | None


class MitigationCreate(BaseModel):
    report_id: int
    recommendation: str
    owner: str = ""
    due_date: date | None = None
    status: str = "pending"


class MitigationUpdate(BaseModel):
    owner: str | None = None
    due_date: date | None = None
    status: str | None = None


class MitigationRead(BaseModel):
    id: int
    organization_id: int
    report_id: int
    recommendation: str
    owner: str
    due_date: date | None
    status: str
    priority: RiskLevel
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AppSettingRead(BaseModel):
    key: str
    value: dict

    class Config:
        from_attributes = True


class AppSettingUpdate(BaseModel):
    value: dict


class AlertRead(BaseModel):
    id: int
    title: str
    message: str
    severity: RiskLevel
    channel: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardSummary(BaseModel):
    total_assets: int
    total_evaluations: int
    total_reports: int
    total_mitigations: int
    overdue_mitigations: int
    reevaluation_due: list[dict]
    risk_distribution: dict[str, int]
    recent_alerts: list[AlertRead]
    average_score: float
