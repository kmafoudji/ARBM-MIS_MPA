from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0006_country_is_active_donor_is_active_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="gadmarea",
            name="gadm_uid",
            field=models.CharField(
                default="",
                help_text="Identifiant unique GADM (ex. SEN.1_1). Clé d'idempotence.",
                max_length=40,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="gadmarea",
            name="name_alt",
            field=models.CharField(
                blank=True,
                help_text="Nom alternatif ou translittération (GADM VARNAME).",
                max_length=200,
            ),
        ),
        migrations.AlterField(
            model_name="gadmarea",
            name="name",
            field=models.CharField(max_length=200),
        ),
        migrations.AlterModelOptions(
            name="gadmarea",
            options={"ordering": ["country", "level", "name"]},
        ),
        migrations.AddIndex(
            model_name="gadmarea",
            index=models.Index(
                fields=["country", "level"],
                name="gadm_area_country_level_idx",
            ),
        ),
        # gadm_uid unique — on l'ajoute après avoir peuplé le champ
        migrations.AlterField(
            model_name="gadmarea",
            name="gadm_uid",
            field=models.CharField(
                unique=True,
                help_text="Identifiant unique GADM (ex. SEN.1_1). Clé d'idempotence.",
                max_length=40,
            ),
        ),
    ]
