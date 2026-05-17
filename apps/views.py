from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.views.decorators.cache import never_cache


@never_cache
def login_page(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    return render(request, "login.html")


@never_cache
@login_required(login_url="/login.html")
def dashboard_page(request):
    return render(request, "dashboard.html")
