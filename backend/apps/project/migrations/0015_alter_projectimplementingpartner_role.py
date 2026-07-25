from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0014_alter_projectgadmscope_is_primary_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="projectimplementingpartner",
            name="role",
            field=models.CharField(
                choices=[
                    ("lead",              "Lead Implementing Agency"),
                    ("co_executor",       "Co-executing Agency"),
                    ("technical_partner", "Technical Partner"),
                    ("fiduciary",         "Fiduciary Agent"),
                    ("subcontract",       "Subcontractor / Service provider"),
                    ("ngo",               "NGO / Civil society"),
                    ("government",        "Government entity"),
                    ("un_agency",         "UN Agency"),
                    ("private_sector",    "Private sector"),
                    ("research",          "Research / Academic institution"),
                ],
                default="lead",
                max_length=20,
                help_text="Rôle de l'agence dans le projet.",
            ),
        ),
    ]
