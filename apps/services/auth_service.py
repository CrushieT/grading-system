from decimal import Decimal
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.mail import send_mail
from django.db import transaction
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
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


class StablePasswordResetTokenGenerator(PasswordResetTokenGenerator):
    """Avoid invalidating links on login events while keeping reset-time safety."""

    def _make_hash_value(self, user, timestamp):
        email = getattr(user, user.get_email_field_name(), "") or ""
        return f"{user.pk}{user.password}{timestamp}{email}"


password_reset_token_generator = StablePasswordResetTokenGenerator()


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


def send_password_reset_email(user, request):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = password_reset_token_generator.make_token(user)
    query = urlencode({"uid": uid, "token": token})
    reset_path = reverse("reset-password")

    base_url = getattr(settings, "PASSWORD_RESET_FRONTEND_BASE_URL", "").strip()
    if base_url:
        reset_url = f"{base_url.rstrip('/')}{reset_path}?{query}"
    else:
        reset_url = request.build_absolute_uri(f"{reset_path}?{query}")

    subject = "GradeDesk password reset"
    message = (
        f"Hi {user.first_name or 'Teacher'},\n\n"
        "We received a request to reset your GradeDesk password.\n"
        "Use the link below to set a new password:\n\n"
        f"{reset_url}\n\n"
        "If you did not request this, you can ignore this email."
    )

    brevo_api_key = (
        os.getenv("BREVO_API_KEY")
        or getattr(settings, "BREVO_API_KEY", "")
        or ""
    ).strip()
    sender_email = (
        getattr(settings, "DEFAULT_FROM_EMAIL", "")
        or getattr(settings, "EMAIL_HOST_USER", "")
        or "noreply@gradedesk.local"
    )

    if brevo_api_key:
        payload = {
            "sender": {
                "name": "GradeDesk",
                "email": sender_email,
            },
            "to": [{"email": user.email}],
            "subject": subject,
            "textContent": message,
        }
        req = Request(
            url="https://api.brevo.com/v3/smtp/email",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "accept": "application/json",
                "api-key": brevo_api_key,
                "content-type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(req, timeout=20):
                return
        except HTTPError as exc:
            try:
                details = exc.read().decode("utf-8")
            except Exception:
                details = ""
            raise RuntimeError(f"Brevo API error ({exc.code}): {details}") from exc
        except URLError as exc:
            raise RuntimeError(f"Brevo API connection failed: {exc}") from exc

    send_mail(
        subject=subject,
        message=message,
        from_email=sender_email,
        recipient_list=[user.email],
        fail_silently=False,
    )


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
