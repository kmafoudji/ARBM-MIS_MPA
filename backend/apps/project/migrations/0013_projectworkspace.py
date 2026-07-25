from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("identity", "0004_alter_appuser_auth_method_alter_appuser_mfa_method_and_more"),
        ("project",  "0012_reportingperiod_projectgadmscope"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjectWorkspace",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("activated_at", models.DateTimeField(auto_now_add=True)),
                ("m2_results_ready",    models.BooleanField(default=False)),
                ("m3_workplan_ready",   models.BooleanField(default=False)),
                ("m5_gis_ready",        models.BooleanField(default=False)),
                ("m6_beneficiary_ready",models.BooleanField(default=False)),
                ("m9_risk_ready",       models.BooleanField(default=False)),
                ("m11_dashboard_ready", models.BooleanField(default=False)),
                ("notes", models.TextField(blank=True)),
                ("project", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="workspace",
                    to="project.project",
                )),
                ("activated_by", models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="workspaces_activated",
                    to="identity.appuser",
                )),
            ],
            options={"db_table": "project_workspace"},
        ),
    ]
