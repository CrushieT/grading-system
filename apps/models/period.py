from django.db import models

class Period(models.Model):
    name = models.CharField(max_length=20)
    position = models.IntegerField()
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name
