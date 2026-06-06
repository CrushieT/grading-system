from django.db.models import Q
from rest_framework import serializers

from apps.models import GradingTemplate, Period, Schedule, Section, Subject


def get_schedule_period_queryset(user):
    return Period.objects.filter(
        user=user,
        time_start__isnull=False,
        time_end__isnull=False,
    )


def apply_period_search(queryset, search_term):
    search_term = (search_term or "").strip()
    if not search_term:
        return queryset
    return queryset.filter(name__icontains=search_term)


def apply_schedule_filters(queryset, params):
    teacher = (params.get("teacher") or "").strip()
    section = (params.get("section") or "").strip()
    subject = (params.get("subject") or "").strip()
    school_year_sem = (params.get("school_year_sem") or "").strip()
    day = (params.get("day") or "").strip()
    search = (params.get("search") or "").strip()

    if teacher:
        if not teacher.isdigit():
            raise serializers.ValidationError({"teacher": "teacher must be a valid id."})
        queryset = queryset.filter(user_id=int(teacher))

    if section:
        if not section.isdigit():
            raise serializers.ValidationError({"section": "section must be a valid id."})
        queryset = queryset.filter(section_id=int(section))

    if subject:
        if not subject.isdigit():
            raise serializers.ValidationError({"subject": "subject must be a valid id."})
        queryset = queryset.filter(subject_id=int(subject))

    if school_year_sem:
        if not school_year_sem.isdigit():
            raise serializers.ValidationError(
                {"school_year_sem": "school_year_sem must be a valid id."}
            )
        queryset = queryset.filter(school_year_semester_id=int(school_year_sem))

    if day:
        queryset = queryset.filter(day__iexact=day)

    if search:
        queryset = queryset.filter(
            Q(subject__code__icontains=search)
            | Q(subject__name__icontains=search)
            | Q(section__name__icontains=search)
            | Q(day__icontains=search)
            | Q(period__name__icontains=search)
            | Q(school_year_semester__school_year__name__icontains=search)
            | Q(school_year_semester__semester__name__icontains=search)
        )

    return queryset


def ensure_schedule_period_deletable(period):
    if Schedule.objects.filter(period=period).exists():
        raise serializers.ValidationError("Cannot delete this period because it is already used.")


def ensure_schedule_deletable(_schedule):
    return


def validate_schedule_subject_owner(user, subject):
    if subject.user_id != user.id:
        raise serializers.ValidationError({"subject": "Invalid subject selected."})


def validate_schedule_section_owner(user, section):
    if section.school_year_sem is None:
        raise serializers.ValidationError({"section": "Section is not linked to a school term."})
    if section.school_year_sem.school_year.user_id != user.id:
        raise serializers.ValidationError({"section": "Invalid section selected."})


def validate_schedule_school_year_sem_owner(user, school_year_semester):
    if school_year_semester.school_year.user_id != user.id:
        raise serializers.ValidationError({"school_year_sem": "Invalid school term selected."})


def validate_schedule_period_owner(user, period):
    if period.user_id != user.id:
        raise serializers.ValidationError({"period": "Invalid period selected."})
    if period.time_start is None or period.time_end is None:
        raise serializers.ValidationError({"period": "Please select a schedule period."})


def get_grading_template_queryset_for_user(user):
    return GradingTemplate.objects.filter(user=user, is_active=True)


def get_default_grading_template_for_user(user):
    return (
        GradingTemplate.objects.filter(user=user, is_default=True, is_active=True)
        .order_by("id")
        .first()
    )


def validate_schedule_grading_template_owner(user, grading_template):
    if grading_template is None:
        return
    if grading_template.user_id != user.id:
        raise serializers.ValidationError(
            {"grading_template": "Invalid grading template selected."}
        )
    if not grading_template.is_active:
        raise serializers.ValidationError(
            {"grading_template": "Please select an active grading template."}
        )


def validate_schedule_section_term_match(section, school_year_semester):
    if section.school_year_sem_id != school_year_semester.id:
        raise serializers.ValidationError(
            {"school_year_sem": "Selected section does not belong to this school term."}
        )


def validate_schedule_conflicts(
    *,
    teacher,
    section,
    subject,
    school_year_semester,
    period,
    day,
    exclude_id=None,
):
    base = Schedule.objects.filter(
        day=day,
        period=period,
        school_year_semester=school_year_semester,
    )
    if exclude_id is not None:
        base = base.exclude(id=exclude_id)

    if base.filter(user=teacher).exists():
        raise serializers.ValidationError(
            {"day": "This teacher already has a schedule for this day and period."}
        )

    if base.filter(section=section).exists():
        raise serializers.ValidationError(
            {"section": "This section already has a schedule for this day and period."}
        )

    if base.filter(subject=subject, section=section).exists():
        raise serializers.ValidationError(
            {"subject": "This subject and section already has a schedule for this day and period."}
        )


def get_subject_queryset_for_user(user):
    return Subject.objects.filter(user=user)


def get_section_queryset_for_user(user):
    return Section.objects.select_related("school_year_sem__school_year", "school_year_sem__semester").filter(
        school_year_sem__school_year__user=user,
        school_year_sem__semester__user=user,
    )
