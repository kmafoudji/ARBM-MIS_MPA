"""
SF-9 — Service de calcul du Data Quality Score (DQ Score)
BRQ-2.23a / BRQ-2.23b

Dimensions et pondérations :
  Complétude   30% — % périodes avec données approuvées / périodes attendues
  Ponctualité  25% — % soumissions avant la due_date
  Cohérence    25% — absence d'écarts > 20% vs tendance historique
  Exactitude   20% — placeholder (SF-10 non implémenté) → 100% par défaut

Score composite = somme pondérée, arrondi à 2 décimales.
"""
from decimal import Decimal
from django.utils import timezone


WEIGHTS = {
    "completeness": Decimal("0.30"),
    "timeliness":   Decimal("0.25"),
    "consistency":  Decimal("0.25"),
    "accuracy":     Decimal("0.20"),
}


def compute_dq_score(logframe_row, period=None):
    """
    Calcule le DQ Score pour une LogframeRow.

    Si period=None  → score global (toutes les périodes du projet).
    Si period=<obj> → score pour cette période uniquement.

    Retourne un dict :
      {
        completeness, timeliness, consistency, accuracy,
        composite,
        details: { ... }
      }
    Toutes les valeurs sont des Decimal 0–100.
    """
    from .models import ResultsData

    project  = logframe_row.project
    periods  = project.reporting_periods.filter(status__in=["open", "approved", "closed"])
    if period:
        periods = periods.filter(id=period.id)

    total_periods = periods.count()

    # ── Complétude ─────────────────────────────────────────────────────────
    # Nb de périodes pour lesquelles une donnée approuvée existe
    approved_count = ResultsData.objects.filter(
        logframe_row=logframe_row,
        reporting_period__in=periods,
        status="approved",
    ).count()

    if total_periods > 0:
        completeness = Decimal(str(round((approved_count / total_periods) * 100, 2)))
    else:
        completeness = Decimal("0")

    # ── Ponctualité ────────────────────────────────────────────────────────
    # Pour chaque période avec données, vérifier si soumis avant due_date
    rds = ResultsData.objects.filter(
        logframe_row=logframe_row,
        reporting_period__in=periods,
    ).select_related("reporting_period")

    on_time_count = 0
    submitted_count = 0
    for rd in rds:
        if rd.updated_at:
            submitted_count += 1
            due = rd.reporting_period.due_date
            # Comparer date de soumission (ou approbation) avec due_date
            submitted_date = rd.approved_at.date() if rd.approved_at else rd.updated_at.date()
            if submitted_date <= due:
                on_time_count += 1

    if submitted_count > 0:
        timeliness = Decimal(str(round((on_time_count / submitted_count) * 100, 2)))
    else:
        timeliness = Decimal("0") if total_periods > 0 else Decimal("100")

    # ── Cohérence ──────────────────────────────────────────────────────────
    # Écarts > 20% entre périodes consécutives → pénalité
    approved_rds = list(ResultsData.objects.filter(
        logframe_row=logframe_row,
        status="approved",
    ).select_related("reporting_period").order_by("reporting_period__period_number"))

    inconsistencies = 0
    comparisons     = 0
    for i in range(1, len(approved_rds)):
        prev_val = float(approved_rds[i-1].actual_value or 0)
        curr_val = float(approved_rds[i].actual_value or 0)
        if prev_val != 0:
            comparisons += 1
            change_pct = abs((curr_val - prev_val) / prev_val) * 100
            if change_pct > 20:
                inconsistencies += 1

    if comparisons > 0:
        consistency = Decimal(str(round(((comparisons - inconsistencies) / comparisons) * 100, 2)))
    else:
        consistency = Decimal("100")  # pas assez de données pour juger

    # ── Exactitude ─────────────────────────────────────────────────────────
    # SF-10 : ratio preuves vérifiées / total preuves attachées
    try:
        from .models import Evidence
        total_ev    = Evidence.objects.filter(
            results_data__logframe_row=logframe_row,
            is_active=True,
        ).count()
        verified_ev = Evidence.objects.filter(
            results_data__logframe_row=logframe_row,
            is_active=True,
            status="verified",
        ).count()
        if total_ev > 0:
            accuracy = Decimal(str(round((verified_ev / total_ev) * 100, 2)))
        else:
            accuracy = Decimal("100")  # Pas de preuves requises → neutre
    except Exception:
        accuracy = Decimal("100")

    # ── Composite ──────────────────────────────────────────────────────────
    composite = (
        completeness  * WEIGHTS["completeness"] +
        timeliness    * WEIGHTS["timeliness"]   +
        consistency   * WEIGHTS["consistency"]  +
        accuracy      * WEIGHTS["accuracy"]
    ).quantize(Decimal("0.01"))

    return {
        "completeness": completeness,
        "timeliness":   timeliness,
        "consistency":  consistency,
        "accuracy":     accuracy,
        "composite":    composite,
        "details": {
            "total_periods":    total_periods,
            "approved_count":   approved_count,
            "submitted_count":  submitted_count,
            "on_time_count":    on_time_count,
            "comparisons":      comparisons,
            "inconsistencies":  inconsistencies,
        },
    }


def save_dq_snapshot(logframe_row, period=None):
    """Calcule et persiste le DQ Score en base."""
    from .models import DQScoreSnapshot

    scores = compute_dq_score(logframe_row, period)
    snapshot, _ = DQScoreSnapshot.objects.update_or_create(
        logframe_row=logframe_row,
        reporting_period=period,
        defaults={
            "completeness_score": scores["completeness"],
            "timeliness_score":   scores["timeliness"],
            "consistency_score":  scores["consistency"],
            "accuracy_score":     scores["accuracy"],
            "composite_score":    scores["composite"],
        },
    )
    return snapshot
