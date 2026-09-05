from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

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
    organization_id: int
    email: EmailStr
    full_name: str
    password: str = Field(min_length=10)
    role: str = "evaluator"


class UserRead(BaseModel):
    id: int
    organization_id: int
    email: EmailStr
    full_name: str
    role: str
    mfa_enabled: bool

    class Config:
        from_attributes = True


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
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


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
    risk_distribution: dict[str, int]
    recent_alerts: list[AlertRead]
    average_score: float
