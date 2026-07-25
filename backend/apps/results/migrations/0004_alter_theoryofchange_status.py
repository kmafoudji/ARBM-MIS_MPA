from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0003_alter_indicator_direction_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="theoryofchange",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft",  "Draft"),
                    ("active", "Active"),
                    ("locked", "Locked — Effective (SF-10)"),
                ],
                default="draft",
                max_length=10,
            ),
        ),
    ]
