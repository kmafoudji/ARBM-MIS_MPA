import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workplan", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="activity",
            name="responsible_user",
            field=models.ForeignKey(
                blank=True,
                help_text="Utilisateur LLFMU responsable (si interne à la plateforme).",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="activities_responsible",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="activity",
            name="responsible_party",
            field=models.CharField(
                blank=True,
                max_length=255,
                help_text="Nom libre pour un responsable externe (contractant, partenaire, ministère).",
            ),
        ),
    ]
