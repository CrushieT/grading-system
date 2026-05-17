from django.db import models
from .choices import AssessmentType
from .schedule import Schedule
from .period import Period
from .record import Record

class Assessment(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, null=True, blank=True)
    period = models.ForeignKey(Period, on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=100)
    max_score = models.DecimalField(max_digits=5, decimal_places=2)
    date_given = models.DateField(null=True, blank=True)
    type = models.CharField(max_length=20, choices=AssessmentType.choices)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.title} ({self.type}) - {self.schedule}"

