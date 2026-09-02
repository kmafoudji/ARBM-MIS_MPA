from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0018_merge_rio_water"),
    ]

    operations = [
        migrations.AddField(
            model_name="projectstagetransition",
            name="transition_date",
            field=models.DateField(
                blank=True,
                help_text="Date effective du passage d'etape (peut differer de la date de saisie).",
                null=True,
            ),
        ),
    ]
