from django.contrib.auth import authenticate, get_user_model
from django.db.models import Q
from rest_framework import serializers

from apps.services.auth_service import register_teacher_account


class UsernameOrEmailLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        password = attrs["password"]

        user_model = get_user_model()
        lookup_user = user_model.objects.filter(email__iexact=email).first()

        if not lookup_user:
            raise serializers.ValidationError("Invalid email or password.")

        user = authenticate(
            request=self.context.get("request"),
            username=lookup_user.username,
            password=password,
        )
        if not user:
            raise serializers.ValidationError("Invalid email or password.")

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


class UpdateMeSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    current_password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    new_password = serializers.CharField(required=False, allow_blank=True, write_only=True)
    confirm_new_password = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs):
        user = self.context["request"].user
        first_name = str(attrs.get("first_name") or "").strip()
        last_name = str(attrs.get("last_name") or "").strip()
        email = str(attrs.get("email") or "").strip().lower()

        if not first_name:
            raise serializers.ValidationError({"first_name": "First name is required."})
        if not last_name:
            raise serializers.ValidationError({"last_name": "Last name is required."})
        if not email:
            raise serializers.ValidationError({"email": "Email is required."})

        if get_user_model().objects.filter(email__iexact=email).exclude(id=user.id).exists():
            raise serializers.ValidationError({"email": "An account with this email already exists."})

        current_password = str(attrs.get("current_password") or "")
        new_password = str(attrs.get("new_password") or "")
        confirm_new_password = str(attrs.get("confirm_new_password") or "")

        wants_password_change = bool(current_password or new_password or confirm_new_password)
        if wants_password_change:
            if not current_password:
                raise serializers.ValidationError(
                    {"current_password": "Current password is required to change password."}
                )
            if not user.check_password(current_password):
                raise serializers.ValidationError({"current_password": "Current password is incorrect."})
            if not new_password:
                raise serializers.ValidationError({"new_password": "New password is required."})
            if len(new_password) < 8:
                raise serializers.ValidationError(
                    {"new_password": "New password must be at least 8 characters."}
                )
            if new_password != confirm_new_password:
                raise serializers.ValidationError(
                    {"confirm_new_password": "New password and confirmation do not match."}
                )

        attrs["first_name"] = first_name
        attrs["last_name"] = last_name
        attrs["email"] = email
        attrs["wants_password_change"] = wants_password_change
        return attrs

    def update(self, instance, validated_data):
        instance.first_name = validated_data["first_name"]
        instance.last_name = validated_data["last_name"]
        instance.email = validated_data["email"]
        # Email is the single auth identifier; keep username synchronized.
        instance.username = validated_data["email"]

        if validated_data.get("wants_password_change"):
            instance.set_password(validated_data.get("new_password"))

        instance.save()
        return instance
