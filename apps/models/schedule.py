from django.db import models
from .user import User
from .subject_section import Subject, Section
from .school_structure import SchoolYearSemester

class Schedule(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    school_year_semester = models.ForeignKey(SchoolYearSemester, on_delete=models.CASCADE)
    section = models.ForeignKey(Section, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.subject} - {self.section}"
