from django.db import models
from .choices import AssessmentType
from .user import User
from .subject_section import Subject

class GradingTemplate(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class GradingTemplateItem(models.Model):
    grading_template = models.ForeignKey(GradingTemplate, on_delete=models.CASCADE)
    type = models.CharField(max_length=20, choices=AssessmentType.choices)
    weight = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        unique_together = ('grading_template', 'type')

    def __str__(self):
        return f"{self.grading_template} - {self.type} ({self.weight}%)"