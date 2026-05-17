from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    is_teacher = models.BooleanField(default=True)

    groups = models.ManyToManyField(
        'auth.Group',
        related_name='grading_users',    # ← fixes the clash
        blank=True
    )
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='grading_users',    # ← fixes the clash
        blank=True
    )

    def __str__(self):
        return self.username