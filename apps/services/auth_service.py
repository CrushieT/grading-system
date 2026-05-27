from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework_simplejwt.tokens import RefreshToken

from apps.models import (
    AssessmentType,
    GradingTemplate,
    GradingTemplateItem,
    SchoolYear,
    Subject,
)
from apps.services.setup_service import (
    ensure_default_periods_for_user,
    ensure_school_year_semester_link,
    get_or_create_default_semester_for_user,
)


def serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
    }


def issue_tokens(user):
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


@transaction.atomic
def register_teacher_account(validated_data):
    first_name = validated_data["first_name"].strip()
    last_name = validated_data["last_name"].strip()
    email = validated_data["email"]
    password = validated_data["password"]
    school_name = validated_data["school_name"].strip()
    year_start = validated_data["year_start"]
    year_end = validated_data["year_end"]
    grading_key = validated_data["grading"]

    user_model = get_user_model()
    user = user_model.objects.create_user(
        username=email,
        email=email,
        first_name=first_name,
        last_name=last_name,
        password=password,
        is_teacher=True,
    )

    school_year = SchoolYear.objects.create(user=user, name=f"{year_start}-{year_end}")

    semester = get_or_create_default_semester_for_user(user)
    school_year_semester = ensure_school_year_semester_link(
        user=user,
        school_year=school_year,
        is_active=True,
    )

    suffix = " - General"
    school_label = school_name.strip()
    max_school_len = 100 - len(suffix)
    if len(school_label) > max_school_len:
        school_label = school_label[:max_school_len].rstrip()

    default_subject = Subject.objects.create(
        user=user,
        code="GEN-101",
        name=f"{school_label}{suffix}",
        units=1,
    )

    grading_profiles = {
        "standard": {
            "name": "Standard",
            "items": [
                (AssessmentType.QUIZ, Decimal("30.00")),
                (AssessmentType.ACTIVITY, Decimal("40.00")),
                (AssessmentType.EXAM, Decimal("30.00")),
            ],
        },
        "exam-heavy": {
            "name": "Exam-Heavy",
            "items": [
                (AssessmentType.QUIZ, Decimal("20.00")),
                (AssessmentType.ACTIVITY, Decimal("30.00")),
                (AssessmentType.EXAM, Decimal("50.00")),
            ],
        },
        "activity": {
            "name": "Activity-Based",
            "items": [
                (AssessmentType.QUIZ, Decimal("20.00")),
                (AssessmentType.ACTIVITY, Decimal("60.00")),
                (AssessmentType.EXAM, Decimal("20.00")),
            ],
        },
    }

    profile = grading_profiles[grading_key]
    template = GradingTemplate.objects.create(
        user=user,
        subject=default_subject,
        name=profile["name"],
        is_default=True,
        is_active=True,
    )
    GradingTemplateItem.objects.bulk_create(
        [
            GradingTemplateItem(grading_template=template, type=item_type, weight=weight)
            for item_type, weight in profile["items"]
        ]
    )

    ensure_default_periods_for_user(user, grading_key=grading_key)

    return {
        "user": user,
        "school_year": school_year,
        "semester": semester,
        "school_year_semester": school_year_semester,
        "grading_template": template,
    }
