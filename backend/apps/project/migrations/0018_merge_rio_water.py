"""Merge 0002_rio_marker_water and 0017_projectimplementingpartner_focal_fields."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0002_rio_marker_water"),
        ("project", "0017_projectimplementingpartner_focal_fields"),
    ]

    operations = []
