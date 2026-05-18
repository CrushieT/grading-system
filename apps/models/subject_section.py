from django.db import models
from .user import User
from .school_structure import SchoolYearSemester

class Subject(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    code = models.CharField(max_length=30, default="SUBJ-001")
    name = models.CharField(max_length=100)
    units = models.PositiveSmallIntegerField(default=3)

    def __str__(self):
        return f"{self.code} - {self.name}"


class Section(models.Model):
    name = models.CharField(max_length=50)
    year_level = models.PositiveSmallIntegerField(default=1)
    school_year_sem = models.ForeignKey(
        SchoolYearSemester,
        on_delete=models.CASCADE,
        related_name="sections",
        null=True,
        blank=True,
    )

    class Meta:
        unique_together = ("school_year_sem", "name")

    def __str__(self):
        return self.name
