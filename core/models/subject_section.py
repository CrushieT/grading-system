from django.db import models
from .user import User

class Subject(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Section(models.Model):
    name = models.CharField(max_length=50)

    def __str__(self):
        return self.name