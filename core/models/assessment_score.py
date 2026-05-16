from django.db import models
from .record import Record
from .assessment import Assessment


class AssessmentScore(models.Model):
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE)
    record = models.ForeignKey(Record, on_delete=models.CASCADE)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('assessment', 'record')

    def __str__(self):
        return f"{self.record.student} - {self.assessment.title}: {self.score}"