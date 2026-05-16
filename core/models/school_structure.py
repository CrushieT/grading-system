from django.db import models
from .user import User

class SchoolYear(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=20)

    def __str__(self):
        return self.name


class Semester(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=20)

    def __str__(self):
        return self.name


class SchoolYearSemester(models.Model):
    school_year = models.ForeignKey(SchoolYear, on_delete=models.CASCADE)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.school_year} - {self.semester}"