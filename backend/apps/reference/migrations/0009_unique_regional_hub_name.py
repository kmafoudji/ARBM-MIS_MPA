from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0008_alter_gadmarea_gadm_uid"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="regionalhub",
            constraint=models.UniqueConstraint(
                fields=["name"], name="unique_regional_hub_name"
            ),
        ),
    ]
