from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0006_merge_20260725_1228"),
    ]

    operations = [
        migrations.AlterField(
            model_name="theoryofchange",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft",   "Draft"),
                    ("active",  "Active"),
                    ("locked",  "Locked — Effective (SF-10)"),
                ],
                default="draft",
                max_length=20,
            ),
        ),
    ]
