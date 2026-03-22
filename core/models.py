from django.db import models
from django.contrib.auth.models import AbstractUser


# ───────────────────────────────
# CHOICES
# ───────────────────────────────
class AssessmentType(models.TextChoices):
    QUIZ = 'QUIZ', 'Quiz'
    ACTIVITY = 'ACTIVITY', 'Activity'
    EXAM = 'EXAM', 'Exam'
    ATTENDANCE = 'ATTENDANCE', 'Attendance'


# ───────────────────────────────
# USER
# ───────────────────────────────
class User(AbstractUser):
    is_teacher = models.BooleanField(default=True)

    def __str__(self):
        return self.username


# ───────────────────────────────
# SCHOOL STRUCTURE
# ───────────────────────────────
class SchoolYear(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=20)  # e.g. "2024-2025"

    def __str__(self):
        return self.name


class Semester(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=20)  # e.g. "1st Semester"

    def __str__(self):
        return self.name


class SchoolYearSemester(models.Model):
    school_year = models.ForeignKey(SchoolYear, on_delete=models.CASCADE)
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.school_year} - {self.semester}"


# ───────────────────────────────
# SUBJECT + SECTION
# ───────────────────────────────
class Subject(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Section(models.Model):
    name = models.CharField(max_length=50)  # e.g. "BSIT 2A"

    def __str__(self):
        return self.name


# ───────────────────────────────
# PERIOD (Prelim, Midterm, etc.)
# ───────────────────────────────
class Period(models.Model):
    name = models.CharField(max_length=20)      # e.g. "Prelim"
    position = models.IntegerField()             # 1, 2, 3, 4 for ordering
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


# ───────────────────────────────
# SCHEDULE (the main class entity)
# ───────────────────────────────
class Schedule(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    school_year_semester = models.ForeignKey(SchoolYearSemester, on_delete=models.CASCADE)
    section = models.ForeignKey(Section, on_delete=models.CASCADE)

    def __str__(self):
        return f"{self.subject} - {self.section}"


# ───────────────────────────────
# STUDENT
# ───────────────────────────────
class Student(models.Model):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    student_id = models.CharField(max_length=20, unique=True)

    def __str__(self):
        return f"{self.last_name}, {self.first_name}"


# ───────────────────────────────
# RECORD (student enrolled in a schedule)
# ───────────────────────────────
class Record(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    average = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('schedule', 'student')  # prevent duplicate enrollment

    def __str__(self):
        return f"{self.student} - {self.schedule}"


# ───────────────────────────────
# GRADE PERIOD (per student per period)
# ───────────────────────────────
class GradePeriod(models.Model):
    record = models.ForeignKey(Record, on_delete=models.CASCADE)
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    grade = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('record', 'period')  # one grade per student per period

    def __str__(self):
        return f"{self.record} - {self.period}: {self.grade}"


# ───────────────────────────────
# GRADE PART (period weights per schedule)
# ───────────────────────────────
class GradePart(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE)
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    weight = models.DecimalField(max_digits=5, decimal_places=2)  # e.g. 25.00 for 25%

    class Meta:
        unique_together = ('schedule', 'period')  # one weight per period per schedule

    def __str__(self):
        return f"{self.schedule} - {self.period} ({self.weight}%)"


# ───────────────────────────────
# ASSESSMENT (one quiz/exam for the whole class)
# ───────────────────────────────
class Assessment(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, null=True, blank=True)
    period = models.ForeignKey(Period, on_delete=models.CASCADE, null=True, blank=True)
    title = models.CharField(max_length=100)
    max_score = models.DecimalField(max_digits=5, decimal_places=2)
    date_given = models.DateField(null=True, blank=True)
    type = models.CharField(max_length=20, choices=AssessmentType.choices)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.title} ({self.type}) - {self.schedule}"


# ───────────────────────────────
# ASSESSMENT SCORE (each student's score)
# ───────────────────────────────
class AssessmentScore(models.Model):
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE)
    record = models.ForeignKey(Record, on_delete=models.CASCADE)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = ('assessment', 'record')  # one score per student per assessment

    def __str__(self):
        return f"{self.record.student} - {self.assessment.title}: {self.score}"


# ───────────────────────────────
# ASSESSMENT TYPE WEIGHT (quiz/exam/activity weights per schedule per period)
# ───────────────────────────────
class AssessmentTypeWeight(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE)
    period = models.ForeignKey(Period, on_delete=models.CASCADE)
    type = models.CharField(max_length=20, choices=AssessmentType.choices)
    weight = models.DecimalField(max_digits=5, decimal_places=2)  # e.g. 20.00 for 20%

    class Meta:
        unique_together = ('schedule', 'period', 'type')  # one weight per type per period per schedule

    def __str__(self):
        return f"{self.schedule} - {self.period} - {self.type} ({self.weight}%)"


# ───────────────────────────────
# ATTENDANCE
# ───────────────────────────────
class Attendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = 'PRESENT', 'Present'
        ABSENT = 'ABSENT', 'Absent'
        EXCUSE = 'EXCUSE', 'Excuse'
        LATE = 'LATE', 'Late'

    record = models.ForeignKey(Record, on_delete=models.CASCADE)
    day_time = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices)
    reason = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return f"{self.record.student} - {self.day_time} - {self.status}"


# ───────────────────────────────
# GRADING TEMPLATE
# ───────────────────────────────
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
        unique_together = ('grading_template', 'type')  # one weight per type per template

    def __str__(self):
        return f"{self.grading_template} - {self.type} ({self.weight}%)"