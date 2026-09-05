import hashlib
import json

from sqlalchemy import text

from app.core.database import engine

ALTER_STATEMENTS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(64)",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS evidence JSON",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS provider VARCHAR(40)",
    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS model VARCHAR(120)",
]

SIGNED_FIELDS = ("executive_summary", "technical_details", "recommendations")


def _sign(title: str, executive_summary: str, technical_details: str, recommendations) -> str:
    canonical = json.dumps(
        {
            "title": title,
            "executive_summary": executive_summary,
            "technical_details": technical_details,
            "recommendations": recommendations,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def run_migrations() -> None:
    with engine.begin() as connection:
        for statement in ALTER_STATEMENTS:
            connection.execute(text(statement))
        rows = connection.execute(
            text(
                "SELECT id, title, executive_summary, technical_details, recommendations "
                "FROM reports WHERE content_hash IS NULL OR content_hash = ''"
            )
        ).fetchall()
        for row in rows:
            digest = _sign(row.title, row.executive_summary, row.technical_details, row.recommendations)
            connection.execute(
                text("UPDATE reports SET content_hash = :digest WHERE id = :id"),
                {"digest": digest, "id": row.id},
            )
