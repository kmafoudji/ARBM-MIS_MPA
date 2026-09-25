import os, django, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.local"
django.setup()

from apps.results.models import LogframeRow, ResultsData
from apps.project.models import Project

# Afficher toutes les LogframeRow avec leur chain_level
print("=== LogframeRows ===")
for row in LogframeRow.objects.select_related("indicator", "project").all():
    print(f"  Project: {row.project.code} | Indicator: {row.indicator.code} | "
          f"Row.chain_level: {row.chain_level} | Indicator.chain_level: {row.indicator.chain_level}")

# Afficher les ResultsData
print("\n=== ResultsData ===")
for rd in ResultsData.objects.select_related("logframe_row__indicator", "logframe_row__project").all():
    print(f"  Project: {rd.logframe_row.project.code} | Indicator: {rd.logframe_row.indicator.code} | "
          f"Row.chain_level: {rd.logframe_row.chain_level} | "
          f"actual: {rd.actual_value} | status: {rd.status} | rag: {rd.rag_status}")
