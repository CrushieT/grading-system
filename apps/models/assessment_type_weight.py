from django.db import models
from .choices import AssessmentType
from .schedule import Schedule
from .period import Period

class AssessmentTypeWeight(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE)
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    type = models.CharField(max_length=20, choices=AssessmentType.choices)
    weight = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        unique_together = ('schedule', 'period', 'type')

    def __str__(self):
        return f"{self.schedule} - {self.period} - {self.type} ({self.weight}%)"