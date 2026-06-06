from django.db import models

class AssessmentType(models.TextChoices):
    QUIZ = 'QUIZ', 'Quiz'
    ACTIVITY = 'ACTIVITY', 'Activity'
    EXAM = 'EXAM', 'Exam'
    ATTENDANCE = 'ATTENDANCE', 'Attendance'


class WeekDay(models.TextChoices):
    MONDAY = "Monday", "Monday"
    TUESDAY = "Tuesday", "Tuesday"
    WEDNESDAY = "Wednesday", "Wednesday"
    THURSDAY = "Thursday", "Thursday"
    FRIDAY = "Friday", "Friday"
    SATURDAY = "Saturday", "Saturday"
