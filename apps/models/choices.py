from django.db import models

class AssessmentType(models.TextChoices):
    QUIZ = 'QUIZ', 'Quiz'
    ACTIVITY = 'ACTIVITY', 'Activity'
    EXAM = 'EXAM', 'Exam'
    ATTENDANCE = 'ATTENDANCE', 'Attendance'