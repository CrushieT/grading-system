from django.db import models
from django.db.models import Q
from .schedule import Schedule
from .student import Student
from .period import Period

class Record(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    grade_period = models.ForeignKey(Period, on_delete=models.SET_NULL, null=True, blank=True)
    date_enrolled = models.DateField(auto_now_add=True, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    average = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    final_grade = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    remarks = models.CharField(max_length=30, null=True, blank=True)
    component_breakdown = models.JSONField(default=list, blank=True)
    computed_at = models.DateTimeField(null=True, blank=True)
    is_locked = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["schedule", "student"],
                condition=Q(grade_period__isnull=True),
                name="uniq_enrollment_record",
            ),
            models.UniqueConstraint(
                fields=["schedule", "student", "grade_period"],
                condition=Q(grade_period__isnull=False),
                name="uniq_computed_grade_record",
            ),
        ]

    def __str__(self):
        if self.grade_period_id:
            return f"{self.student} - {self.schedule} - {self.grade_period}"
        return f"{self.student} - {self.schedule}"
