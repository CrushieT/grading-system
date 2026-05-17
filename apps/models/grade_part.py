from django.db import models
from .schedule import Schedule
from .period import Period

class GradePart(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE)
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    weight = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        unique_together = ('schedule', 'period')

    def __str__(self):
        return f"{self.schedule} - {self.period} ({self.weight}%)"