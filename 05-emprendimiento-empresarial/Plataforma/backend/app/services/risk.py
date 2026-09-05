from app.models import RiskLevel

NIST_FUNCTIONS = ("identify", "protect", "detect", "respond", "recover")


def cvss_severity(level: RiskLevel) -> dict:
    mapping = {
        RiskLevel.low: {"rating": "Low", "range": "0.1 - 3.9"},
        RiskLevel.medium: {"rating": "Medium", "range": "4.0 - 6.9"},
        RiskLevel.high: {"rating": "High", "range": "7.0 - 8.9"},
        RiskLevel.critical: {"rating": "Critical", "range": "9.0 - 10.0"},
    }
    return mapping.get(level, {"rating": "Unknown", "range": "-"})


def calculate_risk_score(answers: dict[str, int], likelihood: int, impact: int, criticality: int) -> tuple[int, RiskLevel]:
    maturity_scores = [max(1, min(5, int(answers.get(item, 1)))) for item in NIST_FUNCTIONS]
    maturity_gap = 6 - (sum(maturity_scores) / len(maturity_scores))
    raw_score = round(((likelihood * impact * criticality) + (maturity_gap * 5)) * 2)
    score = max(1, min(100, raw_score))
    if score >= 80:
        return score, RiskLevel.critical
    if score >= 60:
        return score, RiskLevel.high
    if score >= 35:
        return score, RiskLevel.medium
    return score, RiskLevel.low


def classify_mitre(answers: dict[str, int]) -> list[dict[str, str]]:
    weak = [key for key, value in answers.items() if int(value) <= 2]
    mapping = {
        "identify": ("Reconnaissance", "Inventario y gobierno insuficiente facilitan reconocimiento externo."),
        "protect": ("Credential Access", "Controles debiles de acceso incrementan riesgo de robo de credenciales."),
        "detect": ("Defense Evasion", "Baja deteccion permite que actividad maliciosa pase inadvertida."),
        "respond": ("Impact", "Capacidad limitada de respuesta aumenta impacto operativo."),
        "recover": ("Impact", "Recuperacion debil prolonga indisponibilidad y perdida de datos."),
    }
    return [
        {
            "mitre_tactic": mapping[item][0],
            "description": mapping[item][1],
            "recommendation": "Priorizar controles CIS v8, responsables, presupuesto y fecha objetivo para cerrar la brecha.",
        }
        for item in weak
        if item in mapping
    ]
