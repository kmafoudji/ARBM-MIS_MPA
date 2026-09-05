from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("project", "0019_projectstagetransition_transition_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="investment_cycle",
            field=models.CharField(
                blank=True,
                choices=[("LLF1", "LLF1"), ("LLF2", "LLF2")],
                help_text="LLF investment cycle the project belongs to (LLF1 or LLF2).",
                max_length=10,
                null=True,
            ),
        ),
    ]
