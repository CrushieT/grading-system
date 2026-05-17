from django.contrib.auth import authenticate, get_user_model
from django.db.models import Q
from rest_framework import serializers

from apps.services.auth_service import register_teacher_account


class UsernameOrEmailLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        username_or_email = attrs["username"].strip()
        password = attrs["password"]

        user_model = get_user_model()
        lookup_user = user_model.objects.filter(
            Q(username__iexact=username_or_email) | Q(email__iexact=username_or_email)
        ).first()

        if not lookup_user:
            raise serializers.ValidationError("Invalid username/email or password.")

        user = authenticate(
            request=self.context.get("request"),
            username=lookup_user.username,
            password=password,
        )
        if not user:
            raise serializers.ValidationError("Invalid username/email or password.")

        if not user.is_active:
            raise serializers.ValidationError("This account is disabled.")

        attrs["user"] = user
        return attrs


class RegisterSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)
    school_name = serializers.CharField(max_length=200)
    year_start = serializers.IntegerField(min_value=2000, max_value=2100)
    year_end = serializers.IntegerField(min_value=2001, max_value=2101)
    semester = serializers.ChoiceField(choices=["1st", "2nd", "summer"])
    grading = serializers.ChoiceField(choices=["standard", "exam-heavy", "activity"])

    def validate(self, attrs):
        password = attrs["password"]
        confirm_password = attrs["confirm_password"]
        email = attrs["email"].strip().lower()
        year_start = attrs["year_start"]
        year_end = attrs["year_end"]

        if password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        if year_end <= year_start:
            raise serializers.ValidationError(
                {"year_end": "School year end must be after school year start."}
            )

        user_model = get_user_model()
        if user_model.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).exists():
            raise serializers.ValidationError(
                {"email": "An account with this email already exists."}
            )

        attrs["email"] = email
        return attrs

    def create(self, validated_data):
        return register_teacher_account(validated_data)
