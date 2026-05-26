from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ("apps", "0008_assessment_component_assessment_description_and_more"),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name="record",
            unique_together=set(),
        ),
        migrations.AddField(
            model_name="record",
            name="component_breakdown",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="record",
            name="computed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="record",
            name="final_grade",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name="record",
            name="grade_period",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to="apps.period",
            ),
        ),
        migrations.AddField(
            model_name="record",
            name="is_locked",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="record",
            name="remarks",
            field=models.CharField(blank=True, max_length=30, null=True),
        ),
        migrations.AddConstraint(
            model_name="record",
            constraint=models.UniqueConstraint(
                condition=Q(("grade_period__isnull", True)),
                fields=("schedule", "student"),
                name="uniq_enrollment_record",
            ),
        ),
        migrations.AddConstraint(
            model_name="record",
            constraint=models.UniqueConstraint(
                condition=Q(("grade_period__isnull", False)),
                fields=("schedule", "student", "grade_period"),
                name="uniq_computed_grade_record",
            ),
        ),
    ]

