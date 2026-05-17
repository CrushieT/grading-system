from django.db import models
from .record import Record

class Attendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = 'PRESENT', 'Present'
        ABSENT = 'ABSENT', 'Absent'
        EXCUSE = 'EXCUSE', 'Excuse'
        LATE = 'LATE', 'Late'

    record = models.ForeignKey(Record, on_delete=models.CASCADE)
    day_time = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices)
    reason = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.record.student} - {self.day_time} - {self.status}"