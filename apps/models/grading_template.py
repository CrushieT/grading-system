from django.db import models
from .user import User
from .subject_section import Subject

class GradingTemplate(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    subject = models.ForeignKey(Subject, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=100)
    description = models.TextField(null=True, blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class GradingTemplateItem(models.Model):
    grading_template = models.ForeignKey(GradingTemplate, on_delete=models.CASCADE)
    type = models.CharField(max_length=60)
    weight = models.DecimalField(max_digits=5, decimal_places=2)
    order = models.PositiveSmallIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('grading_template', 'type')

    def __str__(self):
        return f"{self.grading_template} - {self.type} ({self.weight}%)"
