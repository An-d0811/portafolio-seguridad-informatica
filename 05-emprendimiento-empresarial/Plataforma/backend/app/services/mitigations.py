from datetime import date

RESOLVED = "resolved"


def is_mitigation_overdue(due_date: date | None, status: str, today: date | None = None) -> bool:
    current = today or date.today()
    return due_date is not None and status != RESOLVED and due_date < current
