from django.db.models import Q
from rest_framework import serializers

from apps.models import Schedule, Section, Subject


def apply_subject_search(queryset, search_term):
    search_term = (search_term or "").strip()
    if not search_term:
        return queryset
    return queryset.filter(Q(code__icontains=search_term) | Q(name__icontains=search_term))


def apply_section_filters(queryset, params):
    search_term = (params.get("search") or "").strip()
    school_year_sem = (params.get("school_year_sem") or "").strip()
    year_level = (params.get("year_level") or "").strip()

    if search_term:
        queryset = queryset.filter(name__icontains=search_term)

    if school_year_sem:
        if not school_year_sem.isdigit():
            raise serializers.ValidationError(
                {"school_year_sem": "school_year_sem must be a valid id."}
            )
        queryset = queryset.filter(school_year_sem_id=int(school_year_sem))

    if year_level:
        if not year_level.isdigit():
            raise serializers.ValidationError(
                {"year_level": "year_level must be a whole number."}
            )
        queryset = queryset.filter(year_level=int(year_level))

    return queryset


def validate_subject_code_unique(user, code, exclude_id=None):
    queryset = Subject.objects.filter(user=user, code__iexact=code)
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError({"code": "A subject with this code already exists."})


def validate_section_name_unique(school_year_sem, name, exclude_id=None):
    queryset = Section.objects.filter(
        school_year_sem=school_year_sem,
        name__iexact=name,
    )
    if exclude_id is not None:
        queryset = queryset.exclude(id=exclude_id)
    if queryset.exists():
        raise serializers.ValidationError(
            {"name": "This section already exists for this school term."}
        )


def ensure_subject_deletable(subject):
    if Schedule.objects.filter(subject=subject).exists():
        raise serializers.ValidationError("Cannot delete this item because it is already used.")


def ensure_section_deletable(section):
    if Schedule.objects.filter(section=section).exists():
        raise serializers.ValidationError("Cannot delete this item because it is already used.")
