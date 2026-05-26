from django.db import models
from .record import Record
from .period import Period

class GradePeriod(models.Model):
    record = models.ForeignKey(Record, on_delete=models.CASCADE)
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    grade = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('record', 'period')

    def __str__(self):
        return f"{self.record} - {self.period}: {self.grade}"