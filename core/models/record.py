from django.db import models
from .schedule import Schedule
from .student import Student

class Record(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    average = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('schedule', 'student')

    def __str__(self):
        return f"{self.student} - {self.schedule}"