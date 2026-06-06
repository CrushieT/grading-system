from django.db import models
from .subject_section import Section

class Student(models.Model):
    section = models.ForeignKey(Section, on_delete=models.CASCADE, null=True, blank=True)
    year_level = models.PositiveSmallIntegerField(default=1)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, null=True, blank=True)
    last_name = models.CharField(max_length=100)
    gender = models.CharField(max_length=20, null=True, blank=True)
    contact_number = models.CharField(max_length=30, null=True, blank=True)
    student_id = models.CharField(max_length=20, unique=True)

    def __str__(self):
        return f"{self.last_name}, {self.first_name}"
