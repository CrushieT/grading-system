from django.db import models

class Period(models.Model):
    name = models.CharField(max_length=20)
    position = models.IntegerField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name