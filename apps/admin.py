from django.contrib import admin
from .models import (
    User, SchoolYear, Semester, SchoolYearSemester,
    Subject, Section, Period, Schedule, Student,
    Record, GradePeriod, GradePart, Assessment,
    AssessmentScore, AssessmentTypeWeight, Attendance,
    GradingTemplate, GradingTemplateItem
)

admin.site.register(User)
admin.site.register(SchoolYear)
admin.site.register(Semester)
admin.site.register(SchoolYearSemester)
admin.site.register(Subject)
admin.site.register(Section)
admin.site.register(Period)
admin.site.register(Schedule)
admin.site.register(Student)
admin.site.register(Record)
admin.site.register(GradePeriod)
admin.site.register(GradePart)
admin.site.register(Assessment)
admin.site.register(AssessmentScore)
admin.site.register(AssessmentTypeWeight)
admin.site.register(Attendance)
admin.site.register(GradingTemplate)
admin.site.register(GradingTemplateItem)