import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workplan", "0002_activity_responsible_user"),
        ("project", "0018_merge_rio_water"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkplanAlert",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("alert_type", models.CharField(
                    choices=[
                        ("milestone_t30",    "Milestone due in 30 days"),
                        ("milestone_t7",     "Milestone due in 7 days"),
                        ("milestone_t0",     "Milestone due today"),
                        ("milestone_missed", "Milestone missed"),
                        ("activity_overdue", "Activity overdue"),
                        ("delay_pending",    "Delay revision pending approval"),
                        ("escalation_l1",    "Escalation L1 — PMU PM (>15d overdue)"),
                        ("escalation_l2",    "Escalation L2 — Regional Hub (>30d overdue)"),
                        ("escalation_l3",    "Escalation L3 — LLFMU (>60d overdue)"),
                    ],
                    max_length=30,
                )),
                ("status", models.CharField(
                    choices=[("active", "Active"), ("acknowledged", "Acknowledged"), ("resolved", "Resolved")],
                    default="active", max_length=15,
                )),
                ("message", models.TextField()),
                ("days_overdue", models.IntegerField(default=0)),
                ("email_sent", models.BooleanField(default=False)),
                ("email_sent_at", models.DateTimeField(blank=True, null=True)),
                ("acknowledged_at", models.DateTimeField(blank=True, null=True)),
                ("dedup_key", models.CharField(max_length=100, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("project", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="workplan_alerts", to="project.project")),
                ("activity", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="alerts", to="workplan.activity")),
                ("milestone", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="alerts", to="workplan.milestone")),
                ("assigned_to", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="workplan_alerts_assigned", to=settings.AUTH_USER_MODEL)),
                ("acknowledged_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="workplan_alerts_acked", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "workplan_alert", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="workplanalert",
            index=models.Index(fields=["project", "status"], name="wp_alert_project_status_idx"),
        ),
        migrations.AddIndex(
            model_name="workplanalert",
            index=models.Index(fields=["alert_type", "status"], name="wp_alert_type_status_idx"),
        ),
    ]
