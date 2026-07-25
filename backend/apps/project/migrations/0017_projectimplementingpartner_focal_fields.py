from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0016_merge_20260725_1300"),
    ]

    operations = [
        migrations.AddField(
            model_name="projectimplementingpartner",
            name="focal_point_name",
            field=models.CharField(blank=True, max_length=150,
                help_text="Nom du point focal pour ce projet."),
        ),
        migrations.AddField(
            model_name="projectimplementingpartner",
            name="focal_point_email",
            field=models.EmailField(blank=True,
                help_text="Email du point focal."),
        ),
        migrations.AddField(
            model_name="projectimplementingpartner",
            name="focal_point_phone",
            field=models.CharField(blank=True, max_length=30,
                help_text="Téléphone du point focal."),
        ),
    ]
